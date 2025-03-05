// @ts-ignore
import parseGitignore from "gitignore-globs";
import { glob } from "glob";
import * as path from "path";
import * as fs from "node:fs";
import { dirname } from "node:path";

export function getDirectoriesFromFilePaths(filePaths: string[]): string[] {
  const affectedDirectoriesSet = new Set<string>();
  for (const filePath of filePaths) {
    let currentDir = dirname(filePath);
    while (currentDir && currentDir !== ".") {
      affectedDirectoriesSet.add(currentDir);
      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
  }

  return Array.from(affectedDirectoriesSet).sort(
    (a, b) => b.split("/").length - a.split("/").length
  );
}

export function getGitIgnoreGlobs(workspacePath: string): string[] {
  try {
    return parseGitignore(path.join(workspacePath, ".gitignore"));
  } catch {
    return [];
  }
}

export function getIgnoreGlobs(workspacePath: string) {
  return getGitIgnoreGlobs(workspacePath);
}

export async function getAllFilePaths(workspacePath: string) {
  const ignoreGlobs = getIgnoreGlobs(workspacePath);
  /**
   * Embed current files
   */
  const files = await glob("**/*.*", {
    ignore: ignoreGlobs,
    cwd: workspacePath,
  });

  return files;
}

export interface Event<T> {
  /**
   *
   * @param listener The listener function will be called when the event happens.
   * @return a disposable to remove the listener again.
   */
  (listener: (e: T) => void): IDisposable;
}

export interface IDisposable {
  /**
   * Dispose this object.
   */
  dispose(): void;
}

export class Disposable implements IDisposable {
  protected toDispose: IDisposable[] = [];
  public isDisposed = false;

  public addDisposable<T extends IDisposable>(disposable: T): T {
    this.toDispose.push(disposable);
    return disposable;
  }

  public onDispose(cb: () => void): void {
    this.toDispose.push(Disposable.create(cb));
  }

  public dispose(): void {
    if (this.isDisposed) return;

    this.isDisposed = true;
    this.toDispose.forEach((disposable) => {
      disposable.dispose();
    });
  }

  public static is(arg: any): arg is Disposable {
    return typeof arg["dispose"] === "function";
  }

  public static create(cb: () => void): IDisposable {
    return {
      dispose: cb,
    };
  }
}

export class Emitter<T> {
  private registeredListeners = new Set<(e: T) => void>();
  private _event: Event<T> | undefined;

  get event(): Event<T> {
    if (!this._event) {
      this._event = (listener: (e: T) => void) => {
        this.registeredListeners.add(listener);

        return Disposable.create(() => {
          this.registeredListeners.delete(listener);
        });
      };
    }

    return this._event;
  }

  /** Invoke all listeners registered to this event. */
  fire(event: T): void {
    this.registeredListeners.forEach((listener) => {
      listener(event);
    });
  }

  dispose(): void {
    this.registeredListeners = new Set();
  }
}

export function writeToNestedFolder(filePath: string, content: string): void {
  const folderPath = path.dirname(filePath);

  // Create nested directories if they don't exist
  fs.mkdirSync(folderPath, { recursive: true });

  // Write content to the file
  fs.writeFileSync(filePath, content);
}

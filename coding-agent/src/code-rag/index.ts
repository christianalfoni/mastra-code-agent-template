import * as fs from "node:fs/promises";
import { join, relative, dirname } from "path";
import { openai } from "@ai-sdk/openai";
import { OpenAIEmbedding } from "@llamaindex/openai";
import { QdrantVectorStore } from "@llamaindex/qdrant";
import {
  Document,
  VectorStoreIndex,
  RetrieverQueryEngine,
  VectorStoreQueryMode,
  MetadataMode,
  VectorIndexRetriever,
} from "llamaindex";
import {
  getAllFilePaths,
  getDirectoriesFromFilePaths,
  getGitIgnoreGlobs,
} from "./utils.js";
import { generateText } from "ai";

import { FSWatcher, watch } from "chokidar";
import { debounce } from "ts-debounce";
import { v5 } from "uuid";
import ignore from "ignore";

async function getSummary(prompt: string) {
  const { text: summary } = await generateText({
    model: openai("gpt-3.5-turbo"),
    temperature: 0.2,
    prompt,
  });

  if (!summary) {
    console.log("ERROR: No summary for\n" + prompt);
  }

  return summary || "Missing summary";
}

async function createFileDocument(workspacePath: string, path: string) {
  const absolutePath = join(workspacePath, path);
  const content = (await fs.readFile(absolutePath)).toString();

  let summary: string;
  // TODO: This can be improved by checking the file extension or like a ratio of spaces VS length
  if (content.length > 50_000) {
    summary = `---
path: "${path}"
type: "file"
---
File too large to summarize`;
  } else {
    summary = await getSummary(`This is the content of a file:
\`\`\`
${content}
\`\`\`

Please give me a summary of what this describes.`);
  }

  const document = new Document({
    id_: v5(path, v5.URL),
    text: `---
path: "${path}"
type: "file"
---
${summary}`,
    metadata: {
      parentPath: dirname(path),
      path,
      type: "file",
      text: summary,
    },
  });

  console.log("## RESOLVED FILE", dirname(path), path);

  return document;
}

async function createDirectoryDocument(path: string, summaries: string[]) {
  const summary =
    await getSummary(`This is a list of file summaries in a directory:

${summaries.join("\n\n")}

Please give me a summary of all files in this directory.`);
  const document = new Document({
    id_: v5(path, v5.URL),
    text: `---
path: "${path}"
type: "directory"
---
${summary}`,
    metadata: {
      parentPath: path === "." ? undefined : dirname(path),
      path,
      type: "directory",
      text: summary,
    },
  });

  console.log("## RESOLVED DIRECTORY", dirname(path), path, summary);

  return document;
}

export class CodeRAG {
  private watcher: FSWatcher;

  constructor(
    private queryEngine: VectorIndexRetriever,
    public allFilePaths: string[],
    private workspacePath: string,
    private vectorStore: QdrantVectorStore,
    private index: VectorStoreIndex
  ) {
    this.watcher = this.createFileWatcher();
  }

  private createFileWatcher() {
    const changes = {
      added: new Set<string>(),
      changed: new Set<string>(),
      unlinked: new Set<string>(),
    };

    const flush = debounce(async () => {
      const changed = Array.from(changes.added).concat(
        Array.from(changes.changed)
      );
      const unlinked = Array.from(changes.unlinked);

      changes.added.clear();
      changes.changed.clear();
      changes.unlinked.clear();

      const documents: Document[] = [];

      console.log("FLUSHING!", changed, unlinked);

      for (const filepath of changed) {
        documents.push(await createFileDocument(this.workspacePath, filepath));
      }

      for (const filepath of unlinked) {
        await this.vectorStore
          .client()
          .delete(this.vectorStore.collectionName, {
            points: [v5(filepath, v5.URL)],
          });
      }

      const directories = getDirectoriesFromFilePaths(changed.concat(unlinked));

      console.log("Updating directories!", directories);

      for (const directorypath of directories) {
        const result = await this.vectorStore
          .client()
          .scroll(this.vectorStore.collectionName, {
            filter: {
              must: [
                {
                  key: "parentPath",
                  match: { value: directorypath },
                },
                {
                  key: "type",
                  match: { value: "file" },
                },
              ],
            },
          });

        const summaries = result.points.map(
          (point) => point.payload!["text"] as string
        );
        const document = await createDirectoryDocument(
          directorypath,
          summaries
        );
        documents.push(document);
      }

      this.index.insertNodes(documents);
    }, 15_000);

    const gitIgnoreGlobs = getGitIgnoreGlobs(this.workspacePath);
    const ig = ignore().add(gitIgnoreGlobs);

    console.log("Watching", this.workspacePath, gitIgnoreGlobs);

    return watch(this.workspacePath, {
      ignored: (filePath) =>
        filePath === this.workspacePath
          ? false
          : ig.ignores(relative(this.workspacePath, filePath)),
      persistent: true,
      ignoreInitial: true,
    })
      .on("add", async (filepath) => {
        const relativePath = relative(this.workspacePath, filepath);

        changes.added.add(relativePath);
        flush();
      })
      .on("change", async (filepath) => {
        const relativePath = relative(this.workspacePath, filepath);

        console.log("Gotz change!");

        changes.changed.add(relativePath);
        flush();
      })
      .on("unlink", async (filepath) => {
        const relativePath = relative(this.workspacePath, filepath);

        changes.unlinked.add(relativePath);
        flush();
      });
  }

  async query(query: string) {
    const result = await this.queryEngine.retrieve({
      query,
    });

    return result;
  }

  async readdir(directorypath: string) {
    const result = await this.vectorStore
      .client()
      .scroll(this.vectorStore.collectionName, {
        filter: {
          must: [
            {
              key: "parentPath",
              match: { value: directorypath || "." },
            },
          ],
        },
      });

    return result.points.map((point) => ({
      path: point.payload!["path"] as string,
      summary: point.payload!["text"] as string,
      type: point.payload!["type"] as string,
    }));
  }

  dispose() {
    this.watcher.close();
  }

  static async create(workspacePath: string) {
    console.log("Verifying code RAG...");

    const vectorStore = new QdrantVectorStore({
      url: "http://localhost:6333",
      embeddingModel: new OpenAIEmbedding(),
    });

    const index = await VectorStoreIndex.fromVectorStore(vectorStore);

    if (false) {
      await vectorStore.client().deleteCollection(vectorStore.collectionName);
    }

    const collection = await vectorStore
      .client()
      .collectionExists(vectorStore.collectionName);
    const filesToEmbed = await getAllFilePaths(workspacePath);

    if (!collection.exists) {
      const documents: Document[] = [];

      for (const filepath of filesToEmbed) {
        const document = await createFileDocument(workspacePath, filepath);

        documents.push(document);
      }

      // Most nested directory first
      const directories = getDirectoriesFromFilePaths(filesToEmbed);

      for (const directorypath of directories) {
        const summaries = documents
          .filter((doc) => doc.metadata.parentPath === directorypath)
          .map((doc) => doc.text);

        const document = await createDirectoryDocument(
          directorypath,
          summaries
        );
        documents.push(document);
      }

      await index.insertNodes(documents);
    }

    const queryEngine = await index.asRetriever();

    return new CodeRAG(
      queryEngine,
      filesToEmbed,
      workspacePath,
      vectorStore,
      index
    );
  }
}

import * as fs from "node:fs/promises";
import { join, relative, dirname } from "path";
import {
  Document,
  VectorStoreIndex,
  RetrieverQueryEngine,
  VectorStoreQueryMode,
  MetadataMode,
} from "llamaindex";
import { OpenAIEmbedding } from "@llamaindex/openai";
import { QdrantVectorStore } from "@llamaindex/qdrant";
import {
  getAllFilePaths,
  getDirectoriesFromFilePaths,
  getGitIgnoreGlobs,
} from "./utils.js";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { FSWatcher, watch } from "chokidar";
import { debounce } from "ts-debounce";
import { v5 } from "uuid";

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
    summary = "File too large to summarize";
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
    },
  });

  console.log("## RESOLVED FILE", summary);

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
      parentPath: dirname(path),
      path,
      type: "directory",
    },
  });

  console.log("## RESOLVED DIRECTORY", summary);

  return document;
}

export class CodeRAG {
  private watcher: FSWatcher;

  constructor(
    private queryEngine: RetrieverQueryEngine,
    public allFilePaths: string[],
    private workspacePath: string,
    private vectorStore: QdrantVectorStore,
    private index: VectorStoreIndex
  ) {
    this.watcher = this.createFileWatcher();
  }

  private createFileWatcher() {
    const watchPath = join(this.workspacePath, "**/*");

    const changes = {
      added: [] as string[],
      changed: [] as string[],
      unlinked: [] as string[],
    };

    const flush = debounce(async () => {
      console.log("FLUSHING!");
      const changed = changes.added.concat(changes.changed);
      const unlinked = changes.unlinked.slice();

      changes.added = [];
      changes.changed = [];
      changes.unlinked = [];

      const documents: Document[] = [];

      for (const filepath of changed) {
        documents.push(await createFileDocument(this.workspacePath, filepath));
      }

      for (const filepath of unlinked) {
        await this.index.deleteRefDoc(v5(filepath, v5.URL), true);
      }

      const directories = getDirectoriesFromFilePaths(changed.concat(unlinked));

      for (const directorypath of directories) {
        const result = await this.vectorStore.query({
          mode: VectorStoreQueryMode.DEFAULT,
          similarityTopK: 1,
          filters: {
            filters: [
              {
                key: "parentPath",
                value: directorypath,
                operator: "==",
              },
            ],
          },
        });
        const docs = result.nodes || [];
        const summaries = docs.map((doc) => doc.getContent(MetadataMode.NONE));
        const document = await createDirectoryDocument(
          directorypath,
          summaries
        );
        documents.push(document);
      }

      this.index.insertNodes(documents);
    }, 15_000);

    return watch(watchPath, {
      ignored: getGitIgnoreGlobs(this.workspacePath),
      persistent: true,
    })
      .on("add", async (filepath) => {
        const relativePath = relative(this.workspacePath, filepath);

        changes.added.push(relativePath);
        flush();
      })
      .on("change", async (filepath) => {
        const relativePath = relative(this.workspacePath, filepath);

        changes.changed.push(relativePath);
        flush();
      })
      .on("unlink", async (filepath) => {
        const relativePath = relative(this.workspacePath, filepath);

        changes.unlinked.push(relativePath);
        flush();
      });
  }

  async query(query: string) {
    const result = await this.queryEngine.query({
      query,
    });

    return result.message;
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

    // Temp
    // await vectorStore.client().deleteCollection(vectorStore.collectionName);

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

    const queryEngine = await index.asQueryEngine();

    return new CodeRAG(
      queryEngine,
      filesToEmbed,
      workspacePath,
      vectorStore,
      index
    );
  }
}

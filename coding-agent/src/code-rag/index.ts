import * as fs from "node:fs/promises";
import * as path from "path";
import { Document, VectorStoreIndex, RetrieverQueryEngine } from "llamaindex";
import { OpenAIEmbedding } from "@llamaindex/openai";
import { QdrantVectorStore } from "@llamaindex/qdrant";
import { getAllFilePaths } from "./utils.js";
import { SerialQueue } from "./SerialQueue.js";
import { traverseTree } from "./traversePaths.js";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export class CodeRAG {
  constructor(
    private queryEngine: RetrieverQueryEngine,
    public allFilePaths: string[],
  ) {}
  async query(query: string) {
    const result = await this.queryEngine.query({
      query,
    });

    return result.message;
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
      const queue = new SerialQueue();
      const documents: Document[] = [];

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

      async function createFileDocument(filepath: string) {
        return queue.add(async () => {
          const absolutePath = path.join(workspacePath, filepath);
          const content = (await fs.readFile(absolutePath)).toString();
          const summary = await getSummary(`This is the code of a file:
\`\`\`
${content}
\`\`\`

Please give me a summary of what this file does.`);
          const document = new Document({
            text: `---
path: "${filepath}"
type: "file"
---
${summary}`,
            metadata: {
              filepath: filepath,
              type: "file",
            },
          });

          console.log("## RESOLVED FILE", summary);

          documents.push(document);

          return summary;
        });
      }

      async function createDirectoryDocument(
        directorypath: string,
        summaries: string[],
      ) {
        return queue.add(async () => {
          const summary =
            await getSummary(`This is a list of file summaries in a directory:

${summaries.join("\n\n")}

Please give me a summary of all files in this directory.`);
          const document = new Document({
            text: `---
path: "${directorypath}"
type: "directory"
---
${summary}`,
            metadata: {
              filepath: directorypath,
              type: "directory",
            },
          });

          console.log("## RESOLVED DIRECTORY", summary);

          documents.push(document);

          return summary;
        });
      }

      await traverseTree(
        filesToEmbed,
        createFileDocument,
        async (directorypath, results) =>
          createDirectoryDocument(
            directorypath || "$ROOT",
            results.map((result) => result.summary),
          ),
      );

      await index.insertNodes(documents);
    }

    const queryEngine = await index.asQueryEngine();

    return new CodeRAG(queryEngine, filesToEmbed);
  }
}

import { CodeRAG } from "../../code-rag";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import * as fs from "fs";
import { join } from "path";

const PROJECT_PATH = "/project/workspace/project";

function getProjectPath(path: string) {
  return join(PROJECT_PATH, path);
}

const codeRAGPromise = CodeRAG.create(PROJECT_PATH);

async function runQuery(query: string) {
  const codeRAG = await codeRAGPromise;

  return codeRAG.readdir(query);
}

export const writeFile = createTool({
  id: "write-file",
  description: "Write a file",
  inputSchema: z.object({
    path: z.string(),
    content: z.string(),
  }),
  outputSchema: z.string(),
  async execute({ context }) {
    await fs.promises.writeFile(getProjectPath(context.path), context.content);

    return "OK";
  },
});

export const readFile = createTool({
  id: "read-file",
  description: "Read a file",
  inputSchema: z.object({
    path: z.string(),
  }),
  outputSchema: z.string(),
  async execute({ context }) {
    const result = await fs.promises.readFile(getProjectPath(context.path));

    return result.toString("utf-8");
  },
});

export const queryCode = createTool({
  id: "readdir",
  description:
    "Read a directory and return a list of files, directories and their summaries",
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        "A directory path. Use . for root and no leading or trailing delimiters"
      ),
  }),
  outputSchema: z.array(
    z.object({
      path: z.string(),
      summary: z.string(),
    })
  ),
  async execute({ context }) {
    try {
      console.log("EHM", context.path);
      const result = await runQuery(context.path);

      console.log("RESULT", result);

      return result;
    } catch (error) {
      console.log("WWUUUT?", error);
      throw error;
    }
  },
});

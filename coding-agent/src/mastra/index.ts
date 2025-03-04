import { Mastra } from "@mastra/core/mastra";
import { createLogger } from "@mastra/core/logger";
import { weatherWorkflow } from "./workflows";
import { weatherAgent } from "./agents";
import { CodeRAG } from "../code-rag";

const codeRAGPromise = CodeRAG.create("/project/workspace/project");

async function queryCode(query: string) {
  const codeRAG = await codeRAGPromise;

  return codeRAG.query(query);
}

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { weatherAgent },
  logger: createLogger({
    name: "Mastra",
    level: "info",
  }),
});

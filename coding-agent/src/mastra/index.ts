import { Mastra } from "@mastra/core/mastra";
import { createLogger } from "@mastra/core/logger";
import { weatherWorkflow } from "./workflows";
import { codeAgent } from "./agents";
import { CodeRAG } from "../code-rag";

export const mastra = new Mastra({
  workflows: {  },
  agents: { codeAgent },
  logger: createLogger({
    name: "Mastra",
    level: "info",
  }),
});

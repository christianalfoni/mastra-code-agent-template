import { Mastra } from "@mastra/core/mastra";
import { createLogger } from "@mastra/core/logger";
import { weatherWorkflow } from "./workflows";
import { codeAgent } from "./agents";

export const mastra = new Mastra({
  workflows: {  },
  agents: { codeAgent },
  logger: createLogger({
    name: "Mastra",
    level: "info",
  }),
});

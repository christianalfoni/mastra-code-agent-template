import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { weatherTool } from "../tools";

export const weatherAgent = new Agent({
  name: "Code Agent",
  instructions: `
      You are a helpful code assistant.
`,
  model: openai("gpt-4o"),
  tools: { weatherTool },
});

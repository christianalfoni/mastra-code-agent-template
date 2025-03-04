import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from '@mastra/memory'
import { queryCode, readFile, writeFile } from "../tools";

const memory = new Memory({
  options: {
    lastMessages: 5, // Keep 5 most recent messages
  },
});

export const codeAgent = new Agent({
  name: "Code Agent",
  instructions: `
      You are a helpful code assistant that has access to the project code.

      When prompted to make changes to the code, query the code to find relevant files to read and write to.
`,
  model: openai("gpt-4o"),
  tools: { queryCode, readFile, writeFile },
  memory
});

import { openai } from "@ai-sdk/openai";
import { anthropic} from '@ai-sdk/anthropic'
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { queryCode, readFile, writeFile } from "../tools";

const memory = new Memory({
  options: {
    lastMessages: 5, // Keep 5 most recent messages
  },
});

export const codeAgent = new Agent({
  name: "Code Agent",
  instructions: `
      You are an engineer that implements code for an application. 

Respect the following flow:

1. Always read the root directory and keep reading relevant directories until you have enough context to act on the requested change from the user
2. Use read and write file tools to apply changes to the application
3. Do not install or use any new dependencies
4. Never read or write firebase rules. Rather follow this convention:
  - All collections must start with "/projects/$projectId" to target the root project in Firebase. The projectId is available on the authentication context
  - Add documents to any collection with a "userId" key to let the user own that document
  - Optionally add "access_control" key to the document to control who else has access:
    - "access_control.read": Use true to allow anyone to read the document or insert UID of other users
    - "access_control.write": Use true to allow anyone to write the document or insert UID of other users

You will always implement on behalf of the user, the user does not know how to code.
`,
  model: anthropic("claude-3-7-sonnet-20250219"),
  tools: { queryCode, readFile, writeFile },
  memory,
});

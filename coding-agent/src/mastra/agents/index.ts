import { openai } from "@ai-sdk/openai";
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
      You are a helpful code assistant that has access to the project code.

      When prompted to make changes to the code, query the code to find relevant files to read and write to.

      The project uses Firebase. All authenticated users has a "projectId" which can be used to manage
      collection within the following rules:

      rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Updated rules for projects/{projectId}
    match /projects/{projectId} {
      // Helper functions
      function isProjectUser() {
        return request.auth.token.projectId == projectId;
      }
      function ownerMatches() {
        // Changed to use keys().hasAny
        return resource.data.keys().hasAny(['userId']) && request.auth.uid == resource.data.userId;
      }
      function accessAllowed(action) {
        // Changed to use keys().hasAny
        return resource.data.keys().hasAny(['access_control']) && (
          (resource.data.access_control[action] is bool && resource.data.access_control[action] == true) ||
          (resource.data.access_control[action] is list && request.auth.uid in resource.data.access_control[action])
        );
      }
      function canRead() {
        return request.auth != null && isProjectUser() && (ownerMatches() || accessAllowed('read'));
      }
      function canWrite() {
        return request.auth != null && isProjectUser() && (ownerMatches() || accessAllowed('write'));
      }
      
      // Use rules based on helper functions
      allow read: if canRead();
      allow write: if canWrite();
    }
    
    // Unchanged catch-all rule remains
    match /{document=**} {
      allow read, write: if false;
    }
  }
}


`,
  model: openai("gpt-4o"),
  tools: { queryCode, readFile, writeFile },
  memory,
});

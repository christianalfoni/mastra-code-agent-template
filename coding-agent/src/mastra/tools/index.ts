import { CodeRAG } from '../../code-rag';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs';
import { join } from 'path';

const PROJECT_PATH = "/project/workspace/project"

function getProjectPath(path: string) {
  return join(PROJECT_PATH, path)
}

const codeRAGPromise = CodeRAG.create(PROJECT_PATH);

async function runQuery(query: string) {
  const codeRAG = await codeRAGPromise;

  const result =  await codeRAG.query(query);

  return result.content.toString()
}

export const writeFile = createTool({
  id: 'write-file',
  description: "Write a file",
  inputSchema: z.object({
    path: z.string(), 
    content: z.string()
  })  ,
  outputSchema: z.void(),
  async execute({context}) {
       await fs.promises.writeFile(getProjectPath(context.path), context.content) 

       return 'OK'
  }
})

export const readFile = createTool({
  id: 'read-file',
  description: "Read a file",
  inputSchema: z.object({
    path: z.string(), 
  })  ,
  outputSchema: z.string(),
  async execute({context}) {
      const result =  await fs.promises.readFile(getProjectPath(context.path)) 

      return result.toString('utf-8')
  }
})

export const queryCode = createTool({
  id: 'query-code',
  description: "Ask an AI agent about the codebase",
  inputSchema: z.object({
    query: z.string(),
  }),
  outputSchema: z.string(),
  async execute({context}) {
    try {
      console.log("EHM", context.query)
      const result =  await runQuery(context.query)

      console.log("RESULT", result)

      return result
    } catch (error) {
      console.log("WWUUUT?", error)
      throw error
    }
    
  }
})

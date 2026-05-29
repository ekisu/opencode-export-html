import { readFile, writeFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, "..")

const css = await readFile(join(rootDir, "dist", "viewer.css"), "utf-8")
const js = await readFile(join(rootDir, "dist", "viewer.js"), "utf-8")

const testData = {
  session: {
    id: "test-session-1",
    slug: "test-session",
    title: "Test Session — opencode-export-html",
    version: "1.15.0",
    time: {
      created: Date.now() - 3600000,
      updated: Date.now(),
    },
    directory: "/home/user/project",
    projectID: "proj_123",
    share: { url: "https://opencode.ai/share/test-session-1" },
  },
  messages: [
    {
      info: {
        id: "msg_001",
        sessionID: "test-session-1",
        role: "assistant",
        parentID: "",
        agent: "build",
        time: { created: Date.now() - 3500000, completed: Date.now() - 3400000 },
        cost: 0.05,
        tokens: { input: 500, output: 200, reasoning: 100, cache: { read: 0, write: 0 } },
        modelID: "claude-sonnet-4-20250514",
        providerID: "anthropic",
        mode: "build",
        path: { cwd: "/home/user/project", root: "/home/user/project" },
      },
      parts: [
        { id: "prt_001", messageID: "msg_001", sessionID: "test-session-1", type: "step-start" },
        { id: "prt_002", messageID: "msg_001", sessionID: "test-session-1", type: "text", text: "Hello! I'll help you with that. Let me take a look at the project structure first." },
        {
          id: "prt_003",
          messageID: "msg_001",
          sessionID: "test-session-1",
          type: "tool",
          callID: "call_001",
          tool: "bash",
          state: {
            status: "completed",
            input: { command: "ls -la", description: "List files in project root" },
            output: "total 48\ndrwxr-xr-x  9 user staff  288 May 29 12:00 .\ndrwxr-xr-x  5 user staff  160 May 28 10:00 ..\n-rw-r--r--  1 user staff  512 May 29 11:00 package.json\n-rw-r--r--  1 user staff 2048 May 29 11:30 src/index.ts",
            title: "List files",
            time: { start: Date.now() - 3400000, end: Date.now() - 3390000 },
            metadata: {
              command: "ls -la",
              description: "List files in project root",
              output: "total 48\ndrwxr-xr-x  9 user staff  288 May 29 12:00 .\ndrwxr-xr-x  5 user staff  160 May 28 10:00 ..\n-rw-r--r--  1 user staff  512 May 29 11:00 package.json\n-rw-r--r--  1 user staff 2048 May 29 11:30 src/index.ts",
            },
          },
        },
        {
          id: "prt_004",
          messageID: "msg_001",
          sessionID: "test-session-1",
          type: "reasoning",
          text: "The user wants me to help with their project. Let me look at what's in the directory to understand the project structure.",
        },
        { id: "prt_005", messageID: "msg_001", sessionID: "test-session-1", type: "step-finish", reason: "end_turn", cost: 0.05, tokens: { input: 500, output: 200, reasoning: 100 } },
      ],
    },
    {
      info: {
        id: "msg_002",
        sessionID: "test-session-1",
        role: "assistant",
        parentID: "msg_001",
        agent: "build",
        time: { created: Date.now() - 2000000, completed: Date.now() - 1900000 },
        cost: 0.03,
        tokens: { input: 300, output: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: "claude-sonnet-4-20250514",
        providerID: "anthropic",
        mode: "build",
        path: { cwd: "/home/user/project", root: "/home/user/project" },
      },
      parts: [
        {
          id: "prt_006",
          messageID: "msg_002",
          sessionID: "test-session-1",
          type: "text",
          text: "Here's a simple example of how to set up a basic Express server:\n\n```typescript\nimport express from 'express'\n\nconst app = express()\nconst port = 3000\n\napp.get('/', (req, res) => {\n  res.send('Hello World!')\n})\n\napp.listen(port, () => {\n  console.log(`Server running at http://localhost:${port}`)\n})\n```\n\nYou can start the server with:\n\n```bash\nnpx tsx src/server.ts\n```",
        },
        { id: "prt_007", messageID: "msg_002", sessionID: "test-session-1", type: "step-finish", reason: "end_turn", cost: 0.03, tokens: { input: 300, output: 150, reasoning: 0 } },
      ],
    },
  ],
  locale: "en",
  messages_i18n: {
    locale: "en",
  },
}

const escapedTitle = testData.session.title
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script id="session-data" type="application/json">${JSON.stringify(testData)}</script>
<script>${js}</script>
</body>
</html>`

await writeFile(join(rootDir, "test-output.html"), html, "utf-8")
console.log(`Test HTML written to test-output.html (${(html.length / 1024).toFixed(1)} KB)`)

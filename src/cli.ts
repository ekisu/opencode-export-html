#!/usr/bin/env bun
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk/v2"
import { mkdir, writeFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { generateHtml, loadBundles, collectDiffs, preloadDiffs, I18N } from "./export-html"

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      result.help = true
    } else if (arg === "--list-sessions" || arg === "--start-server") {
      result[arg.slice(2)] = true
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith("--")) {
        result[key] = next
        i++
      } else {
        result[key] = true
      }
    }
  }
  return result
}

const USAGE = `Usage: bun run src/cli.ts --session-id <id> [options]

Options:
  --session-id <id>    Session ID to export
  --dir <path>         Project directory (default: cwd)
  --base-url <url>     Server URL (default: http://localhost:4096)
  --start-server       Auto-start and stop opencode serve
  --list-sessions      List sessions instead of exporting
  --output <path>      Output HTML file path (default: <dir>/<title>.html)
  --help               Show this message`

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/^\.+/, "_").trim() || "session"
}

const args = parseArgs(Bun.argv.slice(2))
if (args.help) {
  console.log(USAGE)
  process.exit(0)
}

const directory = (args.dir || args.directory || process.cwd()) as string
const baseUrl = (args["base-url"] || "http://localhost:4096") as string

async function main() {
  let server: { url: string; close: () => void } | null = null

  if (args["start-server"]) {
    console.error("Starting opencode server...")
    server = await createOpencodeServer({
      hostname: "127.0.0.1",
      port: baseUrl.includes(":") ? parseInt(baseUrl.split(":").pop()!) : 4096,
    })
    console.error(`Server listening on ${server.url}`)
  }

  try {
    const client = createOpencodeClient({
      baseUrl: server?.url ?? baseUrl,
      directory,
    })

    if (args["list-sessions"]) {
      const resp = await client.session.list({ directory })
      if (resp.error) {
        console.error("Failed to list sessions:", resp.error)
        process.exit(1)
      }
      const sessions = resp.data as Array<{ id: string; title?: string; time?: { updated?: number } }>
      if (!sessions.length) {
        console.log("No sessions found.")
        return
      }
      for (const s of sessions) {
        const title = s.title || "(untitled)"
        const updated = s.time?.updated ? new Date(s.time.updated).toISOString() : "unknown"
        console.log(`${s.id}  ${title}  (${updated})`)
      }
      return
    }

    const sessionID = args["session-id"]
    if (!sessionID || typeof sessionID !== "string") {
      console.error("Error: --session-id is required. Use --list-sessions to see available sessions.")
      process.exit(1)
    }

    const [sessionResp, messagesResp] = await Promise.all([
      client.session.get({ sessionID, directory }),
      client.session.messages({ sessionID, directory }),
    ])

    if (sessionResp.error) {
      console.error("Failed to fetch session:", sessionResp.error)
      process.exit(1)
    }
    if (messagesResp.error) {
      console.error("Failed to fetch messages:", messagesResp.error)
      process.exit(1)
    }

    const session = sessionResp.data as Record<string, unknown>
    const messages = (messagesResp.data as Array<{
      info: Record<string, unknown>
      parts: Record<string, unknown>[]
    }>) || []

    const diffSources = collectDiffs(session, messages as Array<{ info: Record<string, unknown> }>)
    const session_diff_preload = diffSources.length > 0 ? await preloadDiffs(diffSources) : {}

    const embeddedData = {
      session,
      messages,
      locale: I18N.locale,
      messages_i18n: I18N,
      session_diff_preload,
    }

    const compressed = await loadBundles()

    const html = await generateHtml(compressed, embeddedData)

    const title = session.title as string || "session"
    const outPath = (args.output || join(directory, `${sanitizeFilename(title)}.html`)) as string

    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, html, "utf-8")

    console.log(`Exported to ${outPath} (${(html.length / 1024).toFixed(1)} KB)`)
  } finally {
    if (server) {
      server.close()
      console.error("Server stopped.")
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

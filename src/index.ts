import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"
import { preloadFileDiff } from "@pierre/diffs/ssr"
import { parsePatchFiles } from "@pierre/diffs"
import type { FileDiffMetadata } from "@pierre/diffs"
import { execFileSync } from "node:child_process"
import { collectLanguages, loadGrammars, compressLanguages } from "./languages"

const __dirname = dirname(fileURLToPath(import.meta.url))

let BOOTSTRAP: string | null = null
let JS_ZST: Buffer | null = null
let CSS_ZST: Buffer | null = null

function bundlePaths() {
  return [
    join(__dirname, "..", "dist"),
    join(process.cwd(), "dist"),
    join(homedir(), ".opencode", "dist"),
  ]
}

async function loadBundles() {
  for (const distDir of bundlePaths()) {
    const bootstrapPath = join(distDir, "bootstrap.js")
    const jsZstPath = join(distDir, "viewer.js.zst")
    const cssZstPath = join(distDir, "viewer.css.zst")
    if (existsSync(bootstrapPath) && existsSync(jsZstPath) && existsSync(cssZstPath)) {
      BOOTSTRAP = await readFile(bootstrapPath, "utf-8")
      JS_ZST = await readFile(jsZstPath)
      CSS_ZST = await readFile(cssZstPath)
      return
    }
  }
  console.warn(
    "[opencode-export-html] Viewer bundles not found. Run 'bun run src/build.ts' in the plugin directory.",
  )
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/^\.+/, "_")
    .trim()
    || "session"
}

const DEFAULT_I18N: Record<string, string> = {
  locale: "en",
  status_connected_waiting: "Session loaded",
  status_connecting: "Connecting...",
  status_disconnected: "Disconnected",
  status_reconnecting: "Reconnecting...",
  status_error: "Error",
  status_unknown: "Unknown",
  error_id_not_found: "Session not found",
  error_api_url_not_found: "API URL not found",
  error_connection_failed: "Connection failed",
  opencode_version: "OpenCode version",
  opencode_name: "OpenCode",
  models: "Models",
  waiting_for_messages: "No messages yet",
  cost: "Cost",
  input_tokens: "Input",
  output_tokens: "Output",
  reasoning_tokens: "Reasoning",
  scroll_to_bottom: "Scroll to bottom",
  thinking: "Thinking",
  thinking_pending: "Thinking...",
  attachment: "Attachment",
  show_details: "Show details",
  hide_details: "Hide details",
  show_more: "Show more",
  show_less: "Show less",
  show_results: "Show results",
  hide_results: "Hide results",
  show_preview: "Show preview",
  hide_preview: "Hide preview",
  show_contents: "Show contents",
  hide_contents: "Hide contents",
  show_output: "Show output",
  hide_output: "Hide output",
  copy: "Copy",
  copied: "Copied!",
  link_to_message: "Link to message",
  creating_plan: "Creating plan",
  updating_plan: "Updating plan",
  completing_plan: "Completing plan",
  error: "Error",
  match_one: "match",
  match_other: "matches",
  result_one: "result",
  result_other: "results",
}

interface EmbeddedData {
  session: Record<string, unknown>
  messages: Array<{ info: Record<string, unknown>; parts: Record<string, unknown>[] }>
  locale?: string
  messages_i18n?: Record<string, string>
  session_diff_preload?: Record<string, unknown>
}

interface DiffFile {
  file: string
  patch: string
  additions: number
  deletions: number
  status?: string
}

async function preloadDiffs(diffSources: DiffFile[]): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}
  for (const diff of diffSources) {
    if (!diff.file || !diff.patch || result[diff.file]) continue
    try {
      const parsed = parsePatchFiles(diff.patch)
      const fileDiff = parsed[0]?.files?.[0] as FileDiffMetadata | undefined
      if (fileDiff) {
        result[diff.file] = await preloadFileDiff({ fileDiff })
      }
    } catch (e) {
      console.warn(`Failed to preload diff for ${diff.file}:`, e)
    }
  }
  return result
}

async function generateHtml(data: EmbeddedData): Promise<string> {
  if (!BOOTSTRAP || !JS_ZST || !CSS_ZST) {
    throw new Error("Viewer bundles not loaded")
  }

  const langs = collectLanguages(data)
  const { grammars } = await loadGrammars(langs)
  const languagesZst = compressLanguages(grammars)

  const title = (data.session as { title?: string }).title || "OpenCode Session"
  const escapedTitle = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

  const jsonBuf = Buffer.from(JSON.stringify(data))
  const jsonZst = execFileSync("zstd", ["--force", "-19", "-q", "-c"], { input: jsonBuf })
  const jsonB64 = jsonZst.toString("base64")

  const langsBlock = languagesZst
    ? `<script id="shiki-langs-zst" type="application/zstd+base64">${languagesZst.toString("base64")}</script>`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title>
</head>
<body>
<div id="root"></div>
<script id="session-data-zst" type="application/zstd+base64">${jsonB64}</script>
${langsBlock}
<script>${BOOTSTRAP}</script>
<style type="application/zstd+base64">${CSS_ZST.toString("base64")}</style>
<script type="application/zstd+base64">${JS_ZST.toString("base64")}</script>
</body>
</html>`
}

const tui: TuiPlugin = async (api) => {
  await loadBundles()

  api.keymap.registerLayer({
    commands: [
      {
        name: "session.export-html",
        title: "Export session to HTML",
        category: "Session",
        namespace: "palette" as const,
        slashName: "export-to-html",
        run: async () => {
          if (!BOOTSTRAP || !JS_ZST || !CSS_ZST) {
            api.ui.toast({
              message:
                "Viewer bundle not found. Run 'bun run src/build.ts' in the plugin directory.",
              variant: "error",
            })
            return
          }

          const route = api.route.current
          if (route.name !== "session" || !route.params?.sessionID) {
            api.ui.toast({ message: "No active session", variant: "error" })
            return
          }

          const sessionID = route.params.sessionID
          const dir = api.state.path.directory

          const [sessionResp, messagesResp] = await Promise.all([
            api.client.session.get({ sessionID, directory: dir }),
            api.client.session.messages({ sessionID, directory: dir }),
          ])

          if (sessionResp.error) {
            api.ui.toast({
              message: `Failed to fetch session: ${JSON.stringify(sessionResp.error)}`,
              variant: "error",
            })
            return
          }

          if (messagesResp.error) {
            api.ui.toast({
              message: `Failed to fetch messages: ${JSON.stringify(messagesResp.error)}`,
              variant: "error",
            })
            return
          }

          const session = sessionResp.data as Record<string, unknown>
          const messages = (messagesResp.data as Array<{
            info: Record<string, unknown>
            parts: Record<string, unknown>[]
          }>) || []

          const diffSources: DiffFile[] = []
          const seen = new Set<string>()
          for (const diff of ((session as any).summary?.diffs ?? []) as DiffFile[]) {
            if (!diff.file || seen.has(diff.file)) continue
            seen.add(diff.file)
            diffSources.push(diff)
          }
          for (const msg of messages) {
            for (const diff of ((msg.info as any).summary?.diffs ?? []) as DiffFile[]) {
              if (!diff.file || seen.has(diff.file)) continue
              seen.add(diff.file)
              diffSources.push(diff)
            }
          }

          const session_diff_preload = diffSources.length > 0 ? await preloadDiffs(diffSources) : undefined

          const embeddedData: EmbeddedData = {
            session,
            messages,
            locale: DEFAULT_I18N.locale,
            messages_i18n: DEFAULT_I18N,
            session_diff_preload,
          }

          const html = await generateHtml(embeddedData)
          const title = (session as { title?: string }).title || "session"
          const outPath = join(dir, `${sanitizeFilename(title)}.html`)

          await mkdir(dirname(outPath), { recursive: true })
          await writeFile(outPath, html, "utf-8")

          const relPath = relative(dir, outPath)
          api.ui.toast({ message: `Session exported to "${relPath}"`, variant: "success" })
        },
      },
    ],
  })
}

export default {
  id: "opencode-export-html",
  tui,
}

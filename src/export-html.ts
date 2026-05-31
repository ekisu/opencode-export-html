import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { preloadFileDiff } from "@pierre/diffs/ssr"
import { parsePatchFiles } from "@pierre/diffs"
import type { FileDiffMetadata } from "@pierre/diffs"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { collectLanguages, loadGrammars, compressLanguages } from "./languages"

const __dirname = dirname(fileURLToPath(import.meta.url))

export const I18N: Record<string, string> = {
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

export interface DiffFile {
  file: string
  patch: string
  additions: number
  deletions: number
  status?: string
}

export interface CompressedBundles {
  bootstrap: string
  jsZst: Buffer
  cssZst: Buffer
}

export async function generateHtml(compressed: CompressedBundles, data: unknown): Promise<string> {
  const session = (data as any).session || {}
  const title = session.title || "OpenCode Session"
  const escapedTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

  const langs = collectLanguages(data)
  const { grammars } = await loadGrammars(langs)
  const languagesZst = compressLanguages(grammars)

  const jsonBuf = Buffer.from(JSON.stringify(data), "utf8")
  const jsonZst = zstdCompressSync(jsonBuf)
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
<script>${compressed.bootstrap}</script>
<style type="application/zstd+base64">${compressed.cssZst.toString("base64")}</style>
<script type="application/zstd+base64">${compressed.jsZst.toString("base64")}</script>
</body>
</html>`
}

function zstdCompressSync(input: Buffer): Buffer {
  return execFileSync("zstd", ["--force", "-19", "-q", "-c"], { input })
}

export async function loadBundles(): Promise<CompressedBundles> {
  for (const distDir of [
    join(__dirname, "..", "dist"),
    join(process.cwd(), "dist"),
    join(homedir(), ".opencode", "dist"),
  ]) {
    const bootstrapPath = join(distDir, "bootstrap.js")
    const jsZstPath = join(distDir, "viewer.js.zst")
    const cssZstPath = join(distDir, "viewer.css.zst")
    if (existsSync(bootstrapPath) && existsSync(jsZstPath) && existsSync(cssZstPath)) {
      return {
        bootstrap: await readFile(bootstrapPath, "utf-8"),
        jsZst: await readFile(jsZstPath),
        cssZst: await readFile(cssZstPath),
      }
    }
  }
  throw new Error("Viewer bundles not found. Run 'bun run build' first.")
}

export async function preloadDiffs(diffSources: DiffFile[]): Promise<Record<string, unknown>> {
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
      console.error(`Failed to preload diff for ${diff.file}:`, e)
    }
  }
  return result
}

export function collectDiffs(session: Record<string, unknown>, messages: Array<{ info: Record<string, unknown> }>): DiffFile[] {
  const seen = new Set<string>()
  const diffs: DiffFile[] = []
  for (const diff of ((session as any).summary?.diffs ?? []) as DiffFile[]) {
    if (!diff.file || seen.has(diff.file)) continue
    seen.add(diff.file)
    diffs.push(diff)
  }
  for (const msg of messages) {
    for (const diff of ((msg.info as any).summary?.diffs ?? []) as DiffFile[]) {
      if (!diff.file || seen.has(diff.file)) continue
      seen.add(diff.file)
      diffs.push(diff)
    }
  }
  return diffs
}

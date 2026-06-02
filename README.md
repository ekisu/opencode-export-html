# opencode-export-html

A plugin for [OpenCode](https://github.com/anomalyco/opencode) that adds `/export-to-html` — export any conversation to a self-contained HTML file using the same SolidJS renderer as OpenCode's live share pages.

![Demo screenshot](docs/demo.avif)

## Why?

OpenCode's `/share` uploads conversations to the cloud. This plugin gives you the **same visual output, fully offline** — a single `.html` file you can open in any browser, share as an attachment, or archive.

## What it looks like

The exported HTML is rendered by the **exact same SolidJS components** that power [opncd.ai](https://opncd.ai) share pages — user messages, assistant responses, reasoning blocks, tool calls (bash, read, write, edit, grep, glob, task, etc.), code blocks with syntax highlighting (Shiki), math (KaTeX), diffs, todos, file attachments, and cost/token summaries.

## Format

Exported files are **self-extracting archives**: session data, CSS, and JS are zstd-compressed and embedded in the HTML. At page load, a tiny bootstrap script (~11 KB, inlined uncompressed) decompresses everything client-side with fzstd. The final `.html` file is ~2.8 MB (down from ~21 MB uncompressed).

## Installation

```bash
opencode plugin --global opencode-export-html
```

## Usage

### TUI (slash command)

Type `/export-to-html` in an OpenCode session. The plugin fetches the current session via OpenCode's local HTTP API, wraps everything into a self-extracting HTML file, and saves it to the project root (e.g., `my-project/my-session.html`). Open it in any browser — no server, no network, no dependencies.

## Development

```bash
bun run build   # bundles viewer + compresses assets (dist/)
bun run test    # Playwright visual-diff tests against live share page
```

The repo uses `upstream/` as a git submodule pointing to `anomalyco/opencode` (dev branch). UI components are imported directly from `upstream/packages/ui/src/` — no verbatim copies. Vite aliases redirect `@opencode-ai/*` and `@solidjs/router` imports to minimal stubs.

## License

MIT

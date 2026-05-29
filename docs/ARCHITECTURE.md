# Architecture

`opencode-export-html` is an OpenCode TUI plugin that exports a conversation session to a **self-contained, offline HTML file** — rendered by the same SolidJS components that power OpenCode's live share pages.

## Two-phase design

The plugin operates in two distinct phases:

### 1. Build phase: `bun run build`

The build script (`src/build.ts`) invokes Vite with the config in `vite.config.ts` to produce a single-file IIFE bundle, then compresses it:

1. **Vite build:** `src/vendor/main.tsx` → `dist/viewer.js` + `dist/viewer.css`
2. **Bootstrap build:** Concatenates `fzstd` UMD + `src/vendor/bootstrap.js` → `dist/bootstrap.js`
3. **Zstd compression:** Compresses JS/CSS with `zstd -19` → `dist/viewer.js.zst` + `dist/viewer.css.zst`
4. **Cleanup:** Deletes the uncompressed `dist/viewer.js` and `dist/viewer.css`

Final `dist/` (3 files, ~2.8 MB): `bootstrap.js` (~11 KB), `viewer.js.zst` (~2 MB), `viewer.css.zst` (~855 KB).

### 2. Runtime phase: `/export-to-html` command

When the user runs `/export-to-html` in an OpenCode session, the plugin (`src/index.ts`):

1. **Loads the compressed viewer bundles** from `~/.opencode/dist/` (bootstrap.js + *.zst files, cached after first load)
2. **Fetches session data** via OpenCode's local HTTP API
3. **Generates HTML** by zstd-compressing the session JSON, then inlining the bootstrap + compressed bundles as base64
4. **Writes the `.html` file** to the project directory

The browser bootstrap decompresses everything at page load — the viewer app is unchanged.

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────────────┐
│  OpenCode    │────▶│  Plugin (tui)   │────▶│  <session>.html           │
│  HTTP API    │     │  src/index.ts   │     │                          │
│              │     │                 │     │  ┌─────────────────────┐ │
│  session.get │     │  loadBundles()  │     │  │ bootstrap.js (raw)  │ │
│  messages()  │     │  generateHtml() │     │  ├─────────────────────┤ │
└──────────────┘     └─────────────────┘     │  │ session data.zst    │ │
                                              │  │ (base64)            │ │
                                              │  ├─────────────────────┤ │
                                              │  │ viewer.css.zst      │ │
                                              │  │ (base64)            │ │
                                              │  ├─────────────────────┤ │
                                              │  │ viewer.js.zst       │ │
                                              │  │ (base64)            │ │
                                              │  └─────────────────────┘ │
                                              └──────────────────────────┘
```

## Source tree

```
src/
├── index.ts              # Plugin entry: TUI command registration, API calls, HTML generation
├── build.ts              # Build script: invokes Vite, builds bootstrap, zstd-compresses bundles
├── cli.ts                # CLI export script (programmatic use, not TUI)
└── vendor/               # SolidJS viewer app (11 files)
    ├── main.tsx           # Entry point: reads #session-data, sets up providers, renders ShareContent
    ├── bootstrap.js       # Browser-side fzstd decompressor + DOM injector
    ├── pierre/worker.ts    # Stub for @pierre/diffs web worker (virtual module)
    ├── styles/
    │   ├── index.css      # Trimmed CSS imports — only styles for components we use
    │   └── tailwind-setup.css  # Tailwind v4 configuration
    └── stubs/             # Minimal stubs for workspace-internal imports
        ├── router.ts                  # useLocation → empty location
        ├── core/util/path.ts          # getDirectory, getFilename
        ├── core/util/encode.ts        # checksum → undefined
        ├── core/util/binary.ts        # Binary.search, Binary.insert
        ├── core/util/error.ts         # NamedError (full implementation, uses effect/Schema)
        └── sdk/v2/index.ts            # Type-only stubs (@opencode-ai/sdk/v2)
```

## Component tree

When the browser opens the exported HTML, `main.tsx` mounts this component hierarchy:

```
<App>
  <DataProvider data={transformedExportData} directory="">
    <I18nProvider value={en}>
      <MarkedProvider>
        <FileComponentProvider component={() => null}>   {/* disables file viewer */}
          <DialogProvider>
            <ShareContent>
              ├── <header>
              │     ├── <Logo /> (links to opencode.ai)
              │     └── github + discord links
              ├── <TitleHeader info={session} model={activeModel} />
              ├── <MessageNav messages={userMessages} current={activeMessage} />
              ├── <SessionTurn sessionID messageID messages />
              │     └── Messages rendered with:
              │           ├── user messages (text, tool calls)
              │           ├── assistant responses (markdown, reasoning, tool results)
              │           ├── tool-call accordions (bash, read, write, edit, etc.)
              │           └── code blocks (shiki syntax highlighting)
              └── <SessionReview diffs={snapshotDiffs} />   {/* right sidebar */}
          </DialogProvider>
        </FileComponentProvider>
      </MarkedProvider>
    </I18nProvider>
  </DataProvider>
</App>
```

## Data format transformation

The plugin stores session data in a flat `EmbeddedData` shape:

```ts
{ session: Record, messages: [{ info: Message, parts: Part[] }] }
```

At render time, `main.tsx` transforms this into the `DataProvider` format expected by the upstream UI components:

```ts
{
  session: [Session],               // single-element array
  message: { [sessionID]: Message[] },  // extracted from messages[].info
  part: { [messageID]: Part[] },        // extracted from messages[].parts
  session_status: { [sessionID]: SessionStatus },
  session_diff: { [sessionID]: SnapshotFileDiff[] }  // collected from session + message summaries
}
```

This matches the exact format that the upstream `DataProvider` context expects — the same format served by the live share API at `https://opncd.ai/share/<shareID>`.

## How upstream components are imported

Components, contexts, hooks, and i18n from `upstream/packages/ui/src/` are imported **directly** (not vendored). Only 11 custom files live in `src/vendor/`:

| What we import directly from upstream | What we override / stub |
|---|---|
| `context/` (Data, I18n, Marked, File, Dialog) | `main.tsx` — custom entry point |
| `hooks/` (create-auto-scroll, use-filtered-list) | `bootstrap.js` — fzstd decompressor + injector |
| `i18n/en.ts` — English translation dict | `styles/index.css` — trimmed CSS |
| `components/` — SessionTurn, SessionReview, message-part, accordion, logo, markdown, provider-icon, message-nav, icon, etc. | `styles/tailwind-setup.css` — Tailwind v4 config |
| `styles/` — colors, theme, base, utilities, animations, component CSS | `stubs/` — 7 files for `@opencode-ai/*` and `@solidjs/router` |
| | `pierre/worker.ts` — virtual module stub |

The Vite config uses `resolve.alias` to map namespace imports (`@opencode-ai/*`, `@solidjs/router`) to stub files, and uses `esbuild.tsconfigRaw` to avoid resolving the upstream `tsconfig.json`.

## Why zstd compression

The viewer bundle is large (~20 MB JS + ~1.6 MB CSS) because it includes SolidJS, Shiki syntax highlighting, KaTeX, marked, and all upstream UI components. Embedding this raw in every exported HTML would be impractical. The zstd self-extracting format reduces inline bundle size to ~2.8 MB (plus ~33% base64 overhead in the HTML), making the total export ~4 MB instead of ~22 MB.

## Build output deployment

The build produces three files:

```
dist/
├── bootstrap.js    # fzstd decompressor + injector (~11 KB, uncompressed)
├── viewer.js.zst   # IIFE bundle (SolidJS app + all dependencies), zstd-compressed
└── viewer.css.zst  # All component styles, zstd-compressed
```

At runtime, the plugin searches for these files in order:
1. `~/.opencode/dist/` (global plugin install — primary path)
2. Plugin's own `dist/` (development fallback)
3. CWD's `dist/` (project-local fallback)

The files are loaded once and cached for the lifetime of the OpenCode process.

## Updating from upstream

```bash
cd upstream && git pull && cd .. && bun run build
```

When the upstream submodule is updated:
- If new component CSS files are added to `upstream/packages/ui/src/components/`, add `@import` lines to `src/vendor/styles/index.css`
- If new `@opencode-ai/*` imports appear in upstream components, add corresponding stubs and Vite aliases
- If upstream `SessionTurn` or `SessionReview` are modified, review the changes

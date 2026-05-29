# opencode-export-html — Agent Instructions

## Build

```bash
bun run build
```

This bundles the SolidJS share viewer (from `packages/ui/`) with Vite, then:

1. Compiles `src/vendor/main.tsx` → `dist/viewer.js` + `dist/viewer.css` (Vite IIFE + Tailwind)
2. Builds the bootstrap decompressor: `node_modules/fzstd/umd/index.js` + `src/vendor/bootstrap.js` → `dist/bootstrap.js`
3. Zstd-compresses the JS/CSS bundles with `zstd -19` → `dist/viewer.js.zst` + `dist/viewer.css.zst`
4. Deletes the uncompressed `dist/viewer.js` and `dist/viewer.css`

**`dist/` output (3 files):** `bootstrap.js` (~11 KB), `viewer.js.zst` (~2 MB), `viewer.css.zst` (~855 KB). Total: ~2.8 MB (down from ~21 MB uncompressed).

Components are imported directly from the upstream submodule; only the custom entry point, simplified export components, stubs, and trimmed CSS live in `src/vendor/`.

### Self-extracting HTML format

The exported HTML is a self-extracting archive: a tiny bootstrap script (fzstd decompressor + injector, inlined uncompressed) decompresses zstd-compressed session data, CSS, and JS at page load. The bootstrap:

1. Finds `<script id="session-data-zst" type="application/zstd+base64">` → decompresses → re-creates `<script id="session-data" type="application/base64">` for the viewer
2. Finds `<style type="application/zstd+base64">` → decompresses → injects as `<style>`
3. Finds `<script type="application/zstd+base64">` → decompresses → injects as `<script>` (viewer executes)

The viewer app (`main.tsx`) is unchanged — it reads `#session-data` as base64 JSON, same as before.

## Test

```bash
bun run build && cp dist/bootstrap.js dist/viewer.js.zst dist/viewer.css.zst ~/.opencode/dist/ && opencode run "." -m opencode/deepseek-v4-flash-free --dir /tmp/opencode-test-export --log-level ERROR && SESSION_ID=$(bun run src/cli.ts --start-server --dir /tmp/opencode-test-export --list-sessions 2>/dev/null | head -1 | awk '{print $1}') && bun run src/cli.ts --start-server --session-id "$SESSION_ID" --dir /tmp/opencode-test-export --output test-export.html && open test-export.html
```

What this does:
1. Builds the viewer bundle
2. Copies the 3 compressed dist files (`bootstrap.js`, `viewer.js.zst`, `viewer.css.zst`) to the global plugin dist (`~/.opencode/dist/`) where the installed plugin picks them up
3. Starts a fresh conversation (the `.` message triggers the AI to say "Hi, how can I help you?")
4. Lists sessions to find the session ID
5. Exports that conversation to HTML using the programmatic CLI script
6. Opens the result in the default browser

## Programmatic Export

The `export-to-html` slash command is TUI-only. For programmatic use, `src/cli.ts` talks directly to the OpenCode HTTP API:

```bash
# List sessions (auto-starts & stops server):
bun run src/cli.ts --start-server --dir <project-dir> --list-sessions

# Export a specific session:
bun run src/cli.ts --start-server --session-id <id> --dir <project-dir>

# Export against an already-running server:
bun run src/cli.ts --base-url http://localhost:4096 --session-id <id> --dir <project-dir>

# Custom output path:
bun run src/cli.ts --start-server --session-id <id> --dir <project-dir> --output out.html
```

**How it works:** The script uses `@opencode-ai/sdk/v2` (`createOpencodeServer` to start the server, `createOpencodeClient` to connect) to call the same HTTP endpoints that the TUI plugin uses internally: `GET /api/session` and `GET /api/session/{sessionID}/message`. It then wraps the data in the viewer JS/CSS bundle (same `generateHtml` logic as `src/index.ts`).

### Screenshot comparison vs live share page

```bash
node -e "
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true, executablePath: '/etc/profiles/per-user/eki/bin/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('file:///$(pwd)/test-export.html', { waitUntil: 'networkidle', timeout: 15000 });
await p.waitForTimeout(2000);
await p.screenshot({ path: 'screenshot-export.png', fullPage: true });
await b.close();
console.log('screenshot-export.png saved');
"
```

## Live Share Page

The live share page is at `https://opncd.ai/share/<shareID>` (production short domain). It is served by:

- **Route**: `upstream/packages/enterprise/src/routes/share/[shareID].tsx` — SolidStart page using `getShareData` query
- **Route layout**: `upstream/packages/enterprise/src/routes/share.tsx` — pass-through layout
- **Core logic**: `upstream/packages/enterprise/src/core/share.ts` — `Share.get()`, `Share.data()`, `Share.sync()`, CRUD against R2
- **Storage**: `upstream/packages/enterprise/src/core/storage.ts` — R2 storage adapter
- **Deploy**: `upstream/infra/enterprise.ts:6` — deployed as SolidStart app at the `shortDomain` (`opncd.ai`)

This is the v2-style share that uses `@opencode-ai/ui` components (`SessionTurn`, `SessionReview`, `MessageNav`, `Logo`, `ProviderIcon`, `Tabs`) with the `DataProvider` context. The older Astro-based v1 share at `upstream/packages/web/src/pages/s/[id].astro` (using WebSockets) is proxied via `upstream/packages/console/app/src/routes/s/[id].ts`.

### Data Format

The enterprise share page expects `DataProvider` format:
```
{ session: Session[], message: { [sessionID]: Message[] }, part: { [messageID]: Part[] },
  session_status: { [sessionID]: SessionStatus }, session_diff: { [sessionID]: SnapshotFileDiff[] },
  model?: { [sessionID]: Model[] } }
```

The export plugin (`src/index.ts`) must format data this way.

## Architecture

### Source tree

```
src/vendor/              # Custom entry point + stubs (11 files)
  main.tsx               # Entry point: reads #session-data JSON, sets up providers, renders ShareContent
  bootstrap.js           # Browser bootstrap: fzstd decompressor + injector (concatenated with fzstd UMD at build)
  pierre/worker.ts        # Stub for @pierre/diffs web worker (virtual module at build)
  styles/
    index.css            # Trimmed CSS imports (only component CSS we use)
    tailwind-setup.css   # Tailwind v4 configuration
  stubs/                 # Minimal stubs for workspace-internal imports
    core/util/path.ts    # getDirectory, getFilename
    core/util/encode.ts  # checksum → undefined
    core/util/binary.ts  # Binary.search, Binary.insert
    core/util/error.ts   # NamedError
    sdk/v2/index.ts      # Type stubs (@opencode-ai/sdk/v2)
    router.ts            # useLocation stub (@solidjs/router)

upstream/                # Git submodule → https://github.com/anomalyco/opencode (dev branch)
  packages/ui/src/       # Verbatim components imported directly (NOT vendored)
    components/          # message-part, accordion, logo, markdown, etc.
    context/             # Data, I18n, Marked, File, Dialog providers
    hooks/               # create-auto-scroll, use-filtered-list
    i18n/en.ts           # English translation dict
    styles/              # colors.css, theme.css, base.css, utilities, animations
```

### How it differs from upstream

**Components, contexts, hooks, i18n, and base styles are imported directly from `upstream/packages/ui/src/`** — no verbatim copies. Only these files are custom:

1. **`main.tsx`** — entirely custom renderer entry point, transforms flat `ExportData` into `DataProvider` format
2. **`bootstrap.js`** — browser-side fzstd decompressor + DOM injector; decompresses zstd-compressed CSS/JS/session data at page load
3. **`styles/index.css`** — trimmed to only include CSS files for components we use
4. **`stubs/`** — 7 files mapping `@opencode-ai/*` and `@solidjs/router` imports to minimal implementations
5. **Vite config** — aliases resolve namespace imports to stubs; `esbuild.tsconfigRaw` avoids upstream tsconfig resolution

### Key npm dependencies

```
diff, dompurify, fzstd, katex, marked, marked-katex-extension, marked-shiki, morphdom, motion,
remend, shiki, strip-ansi, @kobalte/core, @pierre/diffs, @solid-primitives/event-listener
```

### Updating from upstream

```bash
cd upstream && git pull && cd .. && bun run build
```

If upstream adds new component CSS files to `styles/index.css`, add them to our trimmed `styles/index.css`.
If upstream adds new `@opencode-ai/` imports, add stubs.
If upstream modifies `SessionTurn` or `SessionReview`, review the changes.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a detailed architectural overview.

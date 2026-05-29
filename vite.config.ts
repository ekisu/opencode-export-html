import { defineConfig, type Plugin } from "vite"
import solid from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { resolve } from "node:path"
import { readFile } from "node:fs/promises"

function workerInlinePlugin(): Plugin {
  const virtualModuleId = "virtual:worker-portable"
  const resolvedVirtualModuleId = "\0" + virtualModuleId

  return {
    name: "worker-inline",
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        const code = await readFile(
          resolve(import.meta.dirname, "node_modules/@pierre/diffs/dist/worker/worker-portable.js"),
          "utf-8",
        )
        return `export default ${JSON.stringify(code)}`
      }
    },
  }
}

function spriteInlinePlugin(): Plugin {
  return {
    name: "sprite-inline",
    enforce: "pre",
    async load(id) {
      const match = id.match(/\/components\/(.+)-icons\/sprite\.svg$/)
      if (!match) return
      const dirName = match[1]
      const raw = await readFile(id, "utf-8")
      const defsMatch = raw.match(/<defs[^>]*>([\s\S]*)<\/defs>/)
      const symbols = defsMatch?.[1]?.trim() ?? raw
      const spriteId = `opencode-${dirName}-icon-sprite`

      return `
if (typeof document !== "undefined") {
  (function () {
    if (document.getElementById("${spriteId}")) return;
    var el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.id = "${spriteId}";
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("width", "0");
    el.setAttribute("height", "0");
    el.style.position = "absolute";
    el.style.overflow = "hidden";
    el.innerHTML = ${JSON.stringify(symbols)};
    if (document.body) {
      document.body.appendChild(el);
    } else {
      addEventListener("DOMContentLoaded", function () {
        document.body.appendChild(el);
      });
    }
  })();
}
export default "";
`
    },
  }
}

function workerAliasPlugin(): Plugin {
  const vendorPath = resolve(import.meta.dirname, "src/vendor/pierre/worker.ts")
  const upstreamPath = resolve(import.meta.dirname, "upstream/packages/ui/src/pierre/worker")

  return {
    name: "worker-alias",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return
      if (source.endsWith("/pierre/worker") || source.endsWith("/pierre/worker.ts")) {
        const base = importer.endsWith(".ts") || importer.endsWith(".tsx") ? resolve(importer, "..") : importer
        const resolved = resolve(base, source)
        if (resolved === upstreamPath || resolved === upstreamPath + ".ts") {
          return this.resolve(vendorPath)
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [workerInlinePlugin(), workerAliasPlugin(), spriteInlinePlugin(), tailwindcss(), solid()],
  root: import.meta.dirname,
  esbuild: {
    tsconfigRaw: JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        jsx: "preserve",
      },
    }),
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    lib: {
      entry: resolve(import.meta.dirname, "src/vendor/main.tsx"),
      formats: ["iife"],
      name: "OpenCodeExport",
      fileName: () => "viewer.js",
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: "viewer.[ext]",
      },
    },
    minify: "esbuild",
    target: "es2020",
  },
  worker: {
    format: "es",
  },
  resolve: {
    alias: {
      "@opencode-ai/sdk/v2": resolve(import.meta.dirname, "src/vendor/stubs/sdk/v2/index.ts"),
      "@opencode-ai/sdk/v2/client": resolve(import.meta.dirname, "src/vendor/stubs/sdk/v2/index.ts"),
      "@opencode-ai/core/util/path": resolve(import.meta.dirname, "src/vendor/stubs/core/util/path.ts"),
      "@opencode-ai/core/util/encode": resolve(import.meta.dirname, "src/vendor/stubs/core/util/encode.ts"),
      "@opencode-ai/core/util/binary": resolve(import.meta.dirname, "src/vendor/stubs/core/util/binary.ts"),
      "@opencode-ai/core/util/error": resolve(import.meta.dirname, "src/vendor/stubs/core/util/error.ts"),
      "@solidjs/router": resolve(import.meta.dirname, "src/vendor/stubs/router.ts"),
    },
  },
})

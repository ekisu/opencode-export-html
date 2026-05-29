import { build } from "vite"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { readFile, writeFile, stat, unlink } from "node:fs/promises"
import { existsSync } from "node:fs"
import { execFileSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, "..")

function fmtKB(bytes: number): string {
  return (bytes / 1024).toFixed(1) + " KB"
}

async function buildBootstrap(distDir: string) {
  const fzstdPath = resolve(rootDir, "node_modules/fzstd/umd/index.js")
  const bootPath = resolve(__dirname, "vendor/bootstrap.js")
  const outPath = resolve(distDir, "bootstrap.js")

  const fzstd = await readFile(fzstdPath, "utf-8")
  const boot = await readFile(bootPath, "utf-8")
  await writeFile(outPath, fzstd + ";\n" + boot, "utf-8")

  const size = Buffer.byteLength(fzstd + "\n" + boot, "utf-8")
  console.log(`[build] bootstrap.js: ${fmtKB(size)}`)
}

function zstdCompress(inputPath: string, outputPath: string) {
  execFileSync("zstd", ["--force", "-19", "-q", inputPath, "-o", outputPath], {
    stdio: "inherit",
  })
}

async function compressBundles(distDir: string) {
  const jsFile = resolve(distDir, "viewer.js")
  const cssFile = resolve(distDir, "viewer.css")

  for (const [src, label] of [
    [jsFile, "viewer.js"],
    [cssFile, "viewer.css"],
  ] as const) {
    if (!existsSync(src)) continue
    const dst = src + ".zst"
    zstdCompress(src, dst)
    const origSize = (await stat(src)).size
    const zstSize = (await stat(dst)).size
    const pct = ((1 - zstSize / origSize) * 100).toFixed(1)
    console.log(`[build] ${label}.zst: ${fmtKB(zstSize)} (${pct}% of ${fmtKB(origSize)})`)
    await unlink(src)
  }
}

async function main() {
  console.log("[build] Bundling share viewer...")

  const viteConfigPath = resolve(rootDir, "vite.config.ts")

  try {
    await build({ configFile: viteConfigPath })
  } catch (err) {
    console.error("[build] Vite build failed:", err)
    process.exit(1)
  }

  const distDir = resolve(rootDir, "dist")

  console.log("[build] Building bootstrap...")
  await buildBootstrap(distDir)

  console.log("[build] Compressing bundles with zstd...")
  await compressBundles(distDir)

  console.log("[build] Done!")
}

main()

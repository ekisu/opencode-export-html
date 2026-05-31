import type { LanguageRegistration } from "@shikijs/types"
import { execFileSync } from "node:child_process"

let aliasMap: Map<string, string> | null = null

async function getAliasMap(): Promise<Map<string, string>> {
  if (aliasMap) return aliasMap

  const map = new Map<string, string>()
  const mod = await import("shiki/langs")
  const info: Array<{ id: string; aliases?: string[] }> = mod.bundledLanguagesInfo

  for (const entry of info) {
    map.set(entry.id, entry.id)
    for (const alias of entry.aliases ?? []) {
      map.set(alias, entry.id)
    }
  }

  aliasMap = map
  return map
}

const CODE_FENCE_RE = /```(\S+)/g

function collectFromText(text: string, langs: Set<string>) {
  for (const m of text.matchAll(CODE_FENCE_RE)) {
    const lang = m[1].toLowerCase()
    if (lang === "text" || lang === "plaintext" || lang === "ansi" || lang === "txt") continue
    langs.add(lang)
  }
}

const FILE_EXT_RE = /\.([a-zA-Z0-9_+#-]+)$/

function collectFromFileName(name: string, langs: Set<string>) {
  const m = name.match(FILE_EXT_RE)
  if (!m) return
  const ext = m[1].toLowerCase()
  if (ext === "txt" || ext === "log" || ext === "lock" || ext.length > 10) return
  langs.add(ext)
}

export function collectLanguages(data: unknown): Set<string> {
  const langs = new Set<string>()

  const queue: unknown[] = [data]
  const seen = new Set<unknown>()

  while (queue.length > 0) {
    const item = queue.pop()!
    if (item == null || seen.has(item)) continue
    seen.add(item)

    if (typeof item === "string") {
      collectFromText(item, langs)
    } else if (Array.isArray(item)) {
      for (const v of item) queue.push(v)
    } else if (typeof item === "object") {
      const obj = item as Record<string, unknown>
      if (obj.language && typeof obj.language === "string") {
        const lang = obj.language.toLowerCase()
        if (lang !== "text" && lang !== "plaintext" && lang !== "ansi" && lang !== "txt") {
          langs.add(lang)
        }
      }
      if (obj.lang && typeof obj.lang === "string") {
        const lang = obj.lang.toLowerCase()
        if (lang !== "text" && lang !== "plaintext" && lang !== "ansi" && lang !== "txt") {
          langs.add(lang)
        }
      }
      // File extensions from paths
      for (const field of ["file", "filePath", "filename"]) {
        const val = obj[field]
        if (typeof val === "string") collectFromFileName(val, langs)
      }
      for (const v of Object.values(obj)) queue.push(v)
    }
  }

  return langs
}

export async function loadGrammars(
  languages: Set<string>,
): Promise<{ grammars: Record<string, LanguageRegistration[]>; totalBytes: number }> {
  const map = await getAliasMap()
  const canonical = new Set<string>()
  for (const lang of languages) {
    canonical.add(map.get(lang) ?? lang)
  }

  // Recursively collect embedded languages
  const embedded = new Set<string>()
  let queue = [...canonical]
  while (queue.length > 0) {
    const id = queue.pop()!
    if (embedded.has(id)) continue
    embedded.add(id)
    try {
      const mod = await import(`@shikijs/langs/${id}`)
      const grammars: LanguageRegistration[] = (mod as Record<string, unknown>).default as LanguageRegistration[]
      const embedLangs = grammars[0]?.embeddedLangs ?? []
      for (const el of embedLangs) {
        if (!embedded.has(el) && !canonical.has(el)) {
          queue.push(el)
        }
      }
    } catch {
      // Grammar file not found — skip
    }
  }

  const grammars: Record<string, LanguageRegistration[]> = {}
  let totalBytes = 0

  for (const id of embedded) {
    if (grammars[id]) continue
    try {
      const mod = await import(`@shikijs/langs/${id}`)
      const data: LanguageRegistration[] = (mod as Record<string, unknown>).default as LanguageRegistration[]
      grammars[id] = data
      totalBytes += Buffer.byteLength(JSON.stringify(data), "utf-8")
    } catch {
      // skip
    }
  }

  return { grammars, totalBytes }
}

export function compressLanguages(
  grammars: Record<string, LanguageRegistration[]>,
): Buffer | null {
  const entries = Object.entries(grammars)
  if (entries.length === 0) return null

  const json = JSON.stringify(Object.fromEntries(entries))
  return execFileSync("zstd", ["--force", "-19", "-q", "-c"], {
    input: Buffer.from(json, "utf-8"),
  })
}

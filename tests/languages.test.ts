import { test, expect } from "bun:test"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { collectLanguages, loadGrammars, compressLanguages } from "../src/languages"

const fixturesDir = resolve(import.meta.dirname ?? ".", "playwright/fixtures")

async function loadFixture(name: string) {
  const session = JSON.parse(await readFile(resolve(fixturesDir, name, "session.json"), "utf-8"))
  const messages = JSON.parse(await readFile(resolve(fixturesDir, name, "messages.json"), "utf-8"))
  return { session, messages }
}

test("O7i3peTU detects expected languages", async () => {
  const { session, messages } = await loadFixture("O7i3peTU")
  const langs = collectLanguages({ session, messages })
  expect(langs.has("ts")).toBe(true)
  expect(langs.has("bash")).toBe(true)
  expect(langs.has("tsx")).toBe(true)
  expect(langs.has("xml")).toBe(true)
  expect(langs.has("html")).toBe(true)
  expect(langs.has("yaml")).toBe(true)
  expect(langs.has("svg")).toBe(true)
  expect(langs.has("json")).toBe(true)
  expect(langs.has("md")).toBe(true)
})

test("t8v6Igr8 detects markdown from file extension", async () => {
  const { session, messages } = await loadFixture("t8v6Igr8")
  const langs = collectLanguages({ session, messages })
  expect(langs.has("md")).toBe(true)
})

test("O7i3peTU loads grammars for all detected languages", async () => {
  const { session, messages } = await loadFixture("O7i3peTU")
  const langs = collectLanguages({ session, messages })
  const { grammars, totalBytes } = await loadGrammars(langs)
  expect(Object.keys(grammars).length).toBeGreaterThan(0)
  expect(totalBytes).toBeGreaterThan(0)
  // ts → typescript, tsx → tsx, bash → shellscript, md → markdown, svg has no grammar
  expect(grammars["typescript"]).toBeDefined()
  expect(grammars["tsx"]).toBeDefined()
  expect(grammars["shellscript"]).toBeDefined()
  expect(grammars["xml"]).toBeDefined()
  expect(grammars["html"]).toBeDefined()
  expect(grammars["yaml"]).toBeDefined()
  expect(grammars["json"]).toBeDefined()
  expect(grammars["markdown"]).toBeDefined()
})

test("t8v6Igr8 loads markdown grammar", async () => {
  const { session, messages } = await loadFixture("t8v6Igr8")
  const langs = collectLanguages({ session, messages })
  const { grammars, totalBytes } = await loadGrammars(langs)
  expect(grammars["markdown"]).toBeDefined()
  expect(totalBytes).toBeGreaterThan(0)
})

test("t8v6Igr8 grammar compression returns markdown buffer", async () => {
  const { session, messages } = await loadFixture("t8v6Igr8")
  const langs = collectLanguages({ session, messages })
  const { grammars } = await loadGrammars(langs)
  const compressed = compressLanguages(grammars)
  expect(compressed).toBeInstanceOf(Buffer)
  expect(compressed!.length).toBeGreaterThan(0)
})

test("O7i3peTU grammar compression produces valid buffer", async () => {
  const { session, messages } = await loadFixture("O7i3peTU")
  const langs = collectLanguages({ session, messages })
  const { grammars } = await loadGrammars(langs)
  const compressed = compressLanguages(grammars)
  expect(compressed).toBeInstanceOf(Buffer)
  expect(compressed!.length).toBeGreaterThan(0)
})

test("language alias bash resolves to shellscript grammar", async () => {
  const langs = new Set(["bash"])
  const { grammars } = await loadGrammars(langs)
  expect(grammars["shellscript"]).toBeDefined()
  expect(grammars["shellscript"].length).toBe(1)
  expect(grammars["shellscript"][0].name).toBe("shellscript")
  expect(grammars["bash"]).toBeUndefined()
})

test("language alias ts resolves to typescript grammar", async () => {
  const langs = new Set(["ts"])
  const { grammars } = await loadGrammars(langs)
  expect(grammars["typescript"]).toBeDefined()
  expect(grammars["typescript"].length).toBe(1)
  expect(grammars["typescript"][0].name).toBe("typescript")
})

test("unknown language is skipped gracefully", async () => {
  const langs = new Set(["nonexistent-lang-xyz"])
  const { grammars, totalBytes } = await loadGrammars(langs)
  expect(Object.keys(grammars).length).toBe(0)
  expect(totalBytes).toBe(0)
})

test("collectLanguages skips text/plaintext/ansi/txt", async () => {
  const data = {
    messages: [
      { info: {}, parts: [{ text: "```text\nplain\n```" }] },
      { info: {}, parts: [{ text: "```plaintext\nx\n```" }] },
      { info: {}, parts: [{ text: "```ansi\n\x1b[31mred\x1b[0m\n```" }] },
      { info: {}, parts: [{ text: "```txt\nhi\n```" }] },
    ],
  }
  const langs = collectLanguages(data)
  expect(langs.size).toBe(0)
})

test("collectLanguages normalizes to lowercase and deduplicates", async () => {
  const data = {
    messages: [
      { info: {}, parts: [{ text: "```TypeScript\ncode\n```" }] },
      { info: {}, parts: [{ text: "```typescript\ncode\n```" }] },
    ],
  }
  const langs = collectLanguages(data)
  expect(langs.size).toBe(1)
  expect(langs.has("typescript")).toBe(true)
})

test("collectLanguages detects language field in parts", async () => {
  const data = {
    messages: [
      { info: {}, parts: [{ language: "javascript" }] },
      { info: {}, parts: [{ lang: "rust" }] },
    ],
  }
  const langs = collectLanguages(data)
  expect(langs.has("javascript")).toBe(true)
  expect(langs.has("rust")).toBe(true)
})

test("language alias md resolves to markdown grammar", async () => {
  const langs = new Set(["md"])
  const { grammars } = await loadGrammars(langs)
  expect(grammars["markdown"]).toBeDefined()
  expect(grammars["markdown"].length).toBe(1)
  expect(grammars["md"]).toBeUndefined()
})

test("collectLanguages detects extensions from diff file paths", async () => {
  const data = {
    session: {
      summary: {
        diffs: [{ file: "src/config.json" }, { file: "README.md" }],
      },
    },
    messages: [],
  }
  const langs = collectLanguages(data)
  expect(langs.has("json")).toBe(true)
  expect(langs.has("md")).toBe(true)
})

test("collectLanguages detects extensions from filePath in tool state", async () => {
  const data = {
    messages: [
      {
        info: {},
        parts: [
          {
            state: {
              input: {
                filePath: "/home/user/TEST_EDITS.md",
              },
            },
          },
        ],
      },
    ],
  }
  const langs = collectLanguages(data)
  expect(langs.has("md")).toBe(true)
})

test("collectLanguages skips txt/log/lock extensions", async () => {
  const data = {
    session: {
      summary: {
        diffs: [
          { file: "output.txt" },
          { file: "debug.log" },
          { file: "package-lock.json" },
        ],
      },
    },
    messages: [],
  }
  const langs = collectLanguages(data)
  expect(langs.has("txt")).toBe(false)
  expect(langs.has("log")).toBe(false)
  expect(langs.has("json")).toBe(true)
})

test("each loaded grammar has required fields", async () => {
  const langs = new Set(["typescript", "json"])
  const { grammars } = await loadGrammars(langs)
  for (const [id, regs] of Object.entries(grammars)) {
    expect(regs.length).toBeGreaterThan(0)
    const reg = regs[0]
    expect(reg.name).toBeString()
    expect(reg.name.length).toBeGreaterThan(0)
    expect(reg.scopeName).toBeString()
    expect(reg.scopeName.length).toBeGreaterThan(0)
    expect(reg.patterns).toBeArray()
  }
})

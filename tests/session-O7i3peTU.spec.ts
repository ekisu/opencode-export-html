import { test, expect } from "@playwright/test"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { generateHtml, loadBundles, collectDiffs, preloadDiffs, I18N } from "../src/export-html"

const SHARE_URL = "https://opncd.ai/share/O7i3peTU"
const FIXTURES_DIR = resolve(import.meta.dirname ?? ".", "fixtures/O7i3peTU")
const EXPORT_PATH = "/tmp/test-gen-export-O7i3peTU.html"

test.beforeAll(async () => {
  const session = JSON.parse(await readFile(resolve(FIXTURES_DIR, "session.json"), "utf-8"))
  const messages = JSON.parse(await readFile(resolve(FIXTURES_DIR, "messages.json"), "utf-8"))
  const diffSources = collectDiffs(session, messages)
  const session_diff_preload = diffSources.length > 0
    ? await preloadDiffs(diffSources)
    : {}
  const compressed = await loadBundles()
  const html = generateHtml(compressed, {
    session,
    messages,
    locale: I18N.locale,
    messages_i18n: I18N,
    session_diff_preload,
  })
  await writeFile(EXPORT_PATH, html, "utf-8")
  console.log(`Generated ${EXPORT_PATH} (${(html.length / 1024).toFixed(1)} KB)`)
})

function definePageTests(pageUrl: string) {
  test("model name visible in header", async ({ page }) => {
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 })
    await expect(page.getByText("deepseek-v4-pro").first()).toBeVisible({ timeout: 10000 })
  })

  test("no browser log warnings about blocked SVG data URIs", async ({ page }) => {
    const logs: string[] = []
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Log.enable")
    cdp.on("Log.entryAdded", (entry) => {
      logs.push(entry.entry.text)
    })
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 })
    await page.waitForTimeout(500)
    const svgLogs = logs.filter((e) => e.includes("data:image/svg+xml"))
    expect(svgLogs).toHaveLength(0)
  })

  test("provider icon renders visible content", async ({ page }) => {
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 })
    const useEl = page.locator('[data-component="provider-icon"] use').first()
    await expect(useEl).toBeAttached({ timeout: 10000 })
    const box = await useEl.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })

  test("header icons render visible content", async ({ page }) => {
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 })
    await expect(page.locator('use[href="#opencode-icon-github"]')).toBeAttached({ timeout: 10000 })
    await expect(page.locator('use[href="#opencode-icon-discord"]')).toBeAttached({ timeout: 10000 })

    const ghUse = page.locator('use[href="#opencode-icon-github"]')
    const dcUse = page.locator('use[href="#opencode-icon-discord"]')
    const ghBox = await ghUse.boundingBox()
    const dcBox = await dcUse.boundingBox()
    expect(ghBox).not.toBeNull()
    expect(ghBox!.width).toBeGreaterThan(0)
    expect(ghBox!.height).toBeGreaterThan(0)
    expect(dcBox).not.toBeNull()
    expect(dcBox!.width).toBeGreaterThan(0)
    expect(dcBox!.height).toBeGreaterThan(0)
  })

  test("spriteInlinePlugin text visible in conversation", async ({ page }) => {
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 })
    await expect(page.getByText("spriteInlinePlugin").first()).toBeVisible({ timeout: 10000 })
  })

  test("emoji checkmark renders correctly", async ({ page }) => {
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 })
    await expect(page.getByText("\u2705 Already works").first()).toBeVisible({ timeout: 10000 })
  })

  test("unicode arrow renders correctly", async ({ page }) => {
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 })
    await expect(page.getByText("\u2192").first()).toBeVisible({ timeout: 10000 })
  })

  test("tool count summary text uses muted text-base color (#6f6f6f)", async ({ page }) => {
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 })
    const summary = page.locator('[data-slot="context-tool-group-summary"]').first()
    await expect(summary).toBeVisible({ timeout: 10000 })
    // --text-base: #6f6f6f in light mode; the element has class text-text-base
    await expect(summary).toHaveCSS("color", "rgb(111, 111, 111)")
  })
}

test.describe("live share page", () => {
  definePageTests(SHARE_URL)
})

test.describe("exported html", () => {
  definePageTests("file://" + EXPORT_PATH)
})

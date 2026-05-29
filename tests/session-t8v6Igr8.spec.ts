import { test, expect } from "@playwright/test"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { generateHtml, loadBundles, collectDiffs, preloadDiffs, I18N } from "../src/export-html"

const SHARE_URL = "https://opncd.ai/share/t8v6Igr8"
const FIXTURES_DIR = resolve(import.meta.dirname ?? ".", "fixtures/t8v6Igr8")
const EXPORT_PATH = "/tmp/test-gen-export.html"

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
    await expect(page.getByText("DeepSeek V4 Pro").first()).toBeVisible({ timeout: 10000 })
  })

  test("no browser log warnings about blocked SVG data URIs", async ({ page }) => {
    const logs: string[] = []
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Log.enable")
    cdp.on("Log.entryAdded", (entry) => {
      logs.push(entry.entry.text)
    })
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 })
    // Data URI resolve attempts fire asynchronously after page load
    await page.waitForTimeout(500)
    const svgLogs = logs.filter((e) => e.includes("data:image/svg+xml"))
    expect(svgLogs).toHaveLength(0)
  })

  test("provider icon renders visible content", async ({ page }) => {
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 })
    const useEl = page.locator('[data-component="provider-icon"] use').first()
    await expect(useEl).toBeAttached({ timeout: 10000 })
    // If data URI is blocked, <use> renders nothing => 0x0 bounding box
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

  test("write-tool shows relative file path, not absolute", async ({ page }) => {
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 })

    const dirEl = page.locator('[data-component="write-tool"] [data-slot="message-part-directory"]').first()
    await expect(dirEl).toBeAttached({ timeout: 10000 })
    await expect(dirEl).toHaveText("/")

    const filenameEl = page.locator('[data-component="write-tool"] [data-slot="message-part-title-filename"]').first()
    await expect(filenameEl).toBeAttached({ timeout: 10000 })
    await expect(filenameEl).toHaveText("TEST_EDITS.md")

    const collapsibleTrigger = page
      .locator('[data-component="write-tool"] [data-slot="collapsible-trigger"]')
      .first()
    await collapsibleTrigger.click()

    const applyDirEl = page.locator('[data-component="write-tool"] [data-slot="apply-patch-directory"]').first()
    await expect(applyDirEl).toBeAttached({ timeout: 10000 })
    await expect(applyDirEl).toHaveText("\u202A/\u202C")

    const applyFilenameEl = page.locator('[data-component="write-tool"] [data-slot="apply-patch-filename"]').first()
    await expect(applyFilenameEl).toBeAttached({ timeout: 10000 })
    await expect(applyFilenameEl).toHaveText("TEST_EDITS.md")
  })

  test("poem text visible in write-tool diff accordion", async ({ page }) => {
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 })

    const collapsibleTrigger = page
      .locator('[data-component="write-tool"] [data-slot="collapsible-trigger"]')
      .first()
    await expect(collapsibleTrigger).toBeAttached({ timeout: 10000 })
    await collapsibleTrigger.click()

    const accItem = page.locator('[data-component="write-tool"] [data-slot="accordion-item"]').first()
    await expect(accItem).toBeAttached({ timeout: 10000 })
    await expect(accItem).toHaveAttribute("data-expanded")

    await expect(
      accItem.locator("diffs-container").getByText("The wind that whispers through the trees")
    ).toBeVisible({ timeout: 10000 })
  })
}

test.describe("live share page", () => {
  definePageTests(SHARE_URL)
})

test.describe("exported html", () => {
  definePageTests("file://" + EXPORT_PATH)
})

import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      executablePath: "/etc/profiles/per-user/eki/bin/chromium",
    },
  },
})

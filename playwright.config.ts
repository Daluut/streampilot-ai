import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Use a preinstalled Chromium headless shell when the pinned Playwright build is not downloaded.
const PREINSTALLED_SHELL = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (fs.existsSync(PREINSTALLED_SHELL) ? PREINSTALLED_SHELL : undefined);

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
      },
    },
  ],
  webServer: {
    // Run against the production build: `npm run build` must be run first.
    command: `npx next start --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

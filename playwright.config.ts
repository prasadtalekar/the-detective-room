import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/integration",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:5180",
    headless: true,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ["--no-sandbox"],
        }
      : {},
  },
  webServer: {
    command: "npm run dev -- --port 5180 --strictPort",
    env: { VITE_USE_FIREBASE_EMULATORS: "true" },
    url: "http://127.0.0.1:5180",
    reuseExistingServer: false,
  },
});

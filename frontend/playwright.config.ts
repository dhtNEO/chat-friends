import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.APP_TEST_URL || "http://localhost:8080",
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH,
      args: [
        "--no-sandbox",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--auto-select-desktop-capture-source=Entire screen",
        "--enable-usermedia-screen-capturing",
      ],
    },
  },
  reporter: [["list"], ["html", { open: "never" }]],
});

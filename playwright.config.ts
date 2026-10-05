import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 10_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    headless: true,
  },
});

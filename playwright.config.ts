import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const e2eDatabase = path.resolve("test-results", "e2e.sqlite");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry" },
  webServer: {
    command:
      "node -e \"require('fs').rmSync('test-results/e2e.sqlite',{force:true})\" && npm run dev",
    env: {
      AUTH_SECRET:
        process.env.AUTH_SECRET ??
        "0000000000000000000000000000000000000000000000000000000000000000",
      AUTH_URL: process.env.AUTH_URL ?? "http://127.0.0.1:3000",
      AUTH_MICROSOFT_ENTRA_ID_ID:
        process.env.AUTH_MICROSOFT_ENTRA_ID_ID ??
        "20000000-0000-4000-8000-000000000001",
      AUTH_MICROSOFT_ENTRA_ID_SECRET:
        process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ??
        "e2e-placeholder-not-a-real-secret",
      AUTH_MICROSOFT_ENTRA_ID_TENANT_ID:
        process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID ??
        "20000000-0000-4000-8000-000000000002",
      DEJAVIEW_ENTRA_READER_GROUP_ID:
        process.env.DEJAVIEW_ENTRA_READER_GROUP_ID ??
        "20000000-0000-4000-8000-000000000003",
      DEJAVIEW_ENTRA_EDITOR_GROUP_ID:
        process.env.DEJAVIEW_ENTRA_EDITOR_GROUP_ID ??
        "20000000-0000-4000-8000-000000000004",
      DEJAVIEW_ENTRA_ADMIN_GROUP_ID:
        process.env.DEJAVIEW_ENTRA_ADMIN_GROUP_ID ??
        "20000000-0000-4000-8000-000000000005",
      DEJAVIEW_CURSOR_SECRET:
        process.env.DEJAVIEW_CURSOR_SECRET ??
        "0000000000000000000000000000000000000000000000000000000000000000",
      DATABASE_URL: e2eDatabase,
      DEJAVIEW_LOCAL_AUTH: "true",
    },
    url: "http://127.0.0.1:3000/api/v1/health",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: ["experience.spec.ts", "experience-accessibility.spec.ts"], workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:3011", screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }],
  webServer: process.env.E2E_EXTERNAL_TEST_SERVERS ? undefined : [
    { command: "node e2e/fixtures/experience-db.mjs", port: 54329, reuseExistingServer: false },
    { command: "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3011", url: "http://127.0.0.1:3011/login", reuseExistingServer: false, timeout: 120000,
      env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329", SUPABASE_SERVICE_ROLE_KEY: "test-only-key", SESSION_SECRET: "experience-test-only-secret-with-32-characters", GEMINI_API_KEY: "", BREVO_API_KEY: "" } },
  ],
});

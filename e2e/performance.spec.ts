import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { loginAs } from "./quality-helpers";

const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
test.beforeEach(async ({ page }) => { await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" })); });
test("SLO: production build・実DBの画面応答と資料回答を実測", async ({ page }) => {
  test.setTimeout(120000);
  await loginAs(page, "Owner");
  const report: Record<string, unknown> = { measuredAt: new Date().toISOString(), environment: "isolated production build / real PostgreSQL+PostgREST", samplesPerScenario: 20, caveat: "ローカル基準値。本番ネットワーク・外部AI生成・月間可用性の達成を示すものではない。" };
  for (const path of ["/home", "/events", "/admin/events"]) {
    const server: number[] = [], visible: number[] = [];
    for (let i = 0; i < 20; i++) {
      await page.goto(path); await expect(page.locator("h1")).toBeVisible();
      const timing = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming; return { server: n.responseStart - n.requestStart, visible: performance.now() }; });
      server.push(timing.server); visible.push(timing.visible);
    }
    report[path] = { serverP95Ms: p95(server), visibleP95Ms: p95(visible), serverSamplesMs: server, visibleSamplesMs: visible };
  }
  const chatbot: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    const response = await page.evaluate(async () => { const result = await fetch("/api/chatbot/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "初心者でも参加できますか？", audience: "member" }) }); return { status: result.status, data: await result.json() }; });
    expect(response.status, JSON.stringify(response.data)).toBe(200); expect(response.data.answer).toContain("初心者");
    chatbot.push(performance.now() - start);
  }
  report.chatbot = { groundedDirectP95Ms: p95(chatbot), samplesMs: chatbot };
  await mkdir(".ops-reports", { recursive: true });
  await writeFile(".ops-reports/performance.json", JSON.stringify(report, null, 2));
  // Enforce the stated screen SLO locally. AI latency is recorded separately, not conflated with direct answers.
  for (const path of ["/home", "/events", "/admin/events"]) {
    const result = report[path] as { serverP95Ms: number; visibleP95Ms: number };
    expect(result.serverP95Ms, `${path}: server p95`).toBeLessThanOrEqual(1000);
    expect(result.visibleP95Ms, `${path}: visible p95`).toBeLessThanOrEqual(2500);
  }
});

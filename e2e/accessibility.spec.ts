import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { loginAs } from "./quality-helpers";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
});

for (const path of ["/login", "/register"]) test(`axe: ${path}`, async ({ page }) => {
  await page.goto(path);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations).toEqual([]);
});
test("axe: 会員予約画面・FAQ・チャットを開いた状態", async ({ page }) => {
  await loginAs(page);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.goto("/events");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  const firstEvent = page.locator(".event-gallery-card").first();
  if (await firstEvent.count()) {
    await firstEvent.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
  }
  await page.goto("/faq");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "チャットを開く" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // Measure the settled UI, not a transient fade-in frame.
  await page.getByRole("dialog").evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => undefined))); });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "チャットを開く" })).toBeFocused();
});
test("axe: 管理者設定画面", async ({ page }) => {
  await loginAs(page, "Owner"); await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "運用設定" })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});

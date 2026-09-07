import { createHmac } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const sessionSecret = "experience-test-only-secret-with-32-characters";

async function addSession(context: BrowserContext, userId: string) {
  const payload = Buffer.from(JSON.stringify({
    id: userId,
    session_version: 1,
    exp: Date.now() + 3_600_000,
  })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  await context.addCookies([{
    name: "courtside_session",
    value: `${payload}.${signature}`,
    domain: "127.0.0.1",
    path: "/",
  }]);
}

async function expectNoAccessibilityViolations(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(violations).toEqual([]);
}

test("公開ログイン画面に重大なアクセシビリティ違反がない", async ({ page }) => {
  await page.goto("/login");
  await expectNoAccessibilityViolations(page);
});

test("会員FAQとチャットに重大なアクセシビリティ違反がない", async ({ context, page }) => {
  await addSession(context, "20000000-0000-4000-8000-000000000002");
  await page.goto("/faq");
  await expectNoAccessibilityViolations(page);
  await page.getByRole("button", { name: "チャットを開く" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoAccessibilityViolations(page);
});

test("管理画面に重大なアクセシビリティ違反がない", async ({ context, page }) => {
  await addSession(context, "20000000-0000-4000-8000-000000000001");
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "運用設定" })).toBeVisible();
  await expectNoAccessibilityViolations(page);
});

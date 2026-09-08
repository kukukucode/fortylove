import { expect, test } from "@playwright/test";

const memberName = process.env.E2E_MEMBER_NAME;
const memberPassword = process.env.E2E_MEMBER_PASSWORD;
const eventTitle = process.env.E2E_EVENT_TITLE;

test("会員がログインして対象イベントを予約・キャンセルできる", async ({ page }) => {
  test.skip(!memberName || !memberPassword || !eventTitle, "E2E用の会員・イベント環境変数が必要です");

  await page.goto("/login");
  await page.locator('input[name="name"]').fill(memberName!);
  await page.locator('input[name="password"]').fill(memberPassword!);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/home(?:\?|$)/);

  await page.goto("/events");
  const eventCard = page.locator(".event-gallery-card").filter({ hasText: eventTitle! });
  await expect(eventCard).toHaveCount(1);
  await eventCard.click();
  const detail = page.getByRole("dialog", { name: new RegExp(eventTitle!) });
  await expect(detail).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await detail.getByRole("button", { name: "予約する" }).click();
  await expect(detail.getByRole("button", { name: "予約済み" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await detail.getByRole("button", { name: "予約済み" }).click();
  await expect(detail.getByRole("button", { name: "予約する" })).toBeVisible();
});

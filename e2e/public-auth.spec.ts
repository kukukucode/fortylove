import { expect, test } from "@playwright/test";

test("ログイン画面を表示し、主要な入力欄を操作できる", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: /最高の日々を、\s*ここから。/ })).toBeVisible();
  await page.locator('input[name="name"]').fill("テスト利用者");
  await page.locator('input[name="password"]').fill("password-for-ui-test");
  await expect(page.getByRole("button", { name: "ログイン" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "新規登録する" })).toHaveAttribute("href", "/register");
});

test("未認証ユーザーを会員・管理画面からログインへ戻す", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/events");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
});

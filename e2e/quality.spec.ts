import { test, expect } from "@playwright/test";
import { adminId, assertDb, eventId, loginAs, memberId, qualityDb } from "./quality-helpers";

test.beforeAll(async () => {
  await assertDb(qualityDb.from("login_rate_limits").delete().neq("key_hash", ""));
  await assertDb(qualityDb.from("users").delete().like("name", "Quality Registration %"));
});

test("実DB: 会員ログイン→予約→キャンセルとDB状態を確認", async ({ page }) => {
  await assertDb(qualityDb.from("reservations").delete().eq("user_id", memberId).eq("event_id", eventId));
  await loginAs(page);
  await page.goto("/events");
  const card = page.locator(".event-gallery-card").filter({ hasText: "Quality Reservation Event" });
  await card.click();
  const detail = page.getByRole("dialog", { name: /Quality Reservation Event/ });
  page.once("dialog", (dialog) => dialog.accept());
  await detail.getByRole("button", { name: "予約する", exact: true }).click();
  await expect(detail.getByRole("button", { name: "予約済み", exact: true })).toBeVisible();
  const reserved = await assertDb(qualityDb.from("reservations").select("status").eq("user_id", memberId).eq("event_id", eventId).single());
  expect(reserved.data?.status).toBe("reserved");
  page.once("dialog", (dialog) => dialog.accept());
  await detail.getByRole("button", { name: "予約済み", exact: true }).click();
  await expect(detail.getByRole("button", { name: "予約する", exact: true })).toBeVisible();
  const cancelled = await assertDb(qualityDb.from("reservations").select("status").eq("user_id", memberId).eq("event_id", eventId).single());
  expect(cancelled.data?.status).toBe("cancelled");
});

test("実DB: 新規登録で会員を作成し、平文パスワードを保存しない", async ({ page }) => {
  const name = `Quality Registration ${Date.now()}`;
  await page.goto("/register");
  await page.locator('[name="name"]').fill(name);
  await page.locator('[name="university_choice"]').selectOption("早稲田大学");
  await page.locator('[name="faculty_choice"]').selectOption("法学部");
  await page.locator('[name="has_racket"]').selectOption("false");
  await page.locator('[name="password"]').fill("QualityNew!123");
  await page.getByRole("button", { name: "新歓受付に登録する" }).click();
  await expect(page).toHaveURL(/\/home/);
  const { data } = await assertDb(qualityDb.from("users").select("id,role,password_hash").eq("name", name).single());
  expect(data?.role).toBe("member"); expect(data?.password_hash).toMatch(/^\$2/);
  expect(JSON.stringify(await page.evaluate(() => ({ ...sessionStorage })))).not.toContain("QualityNew!123");
});

test("実DB: adminはイベントを作成・削除できるが通知設定へ入れない", async ({ page }) => {
  await assertDb(qualityDb.from("events").delete().eq("title", "Quality Created Event"));
  await loginAs(page, "Admin"); await page.goto("/admin/events");
  await page.locator(".create-panel > summary").click();
  const form = page.locator(".create-panel form");
  await form.locator('[name="title"]').fill("Quality Created Event");
  await form.locator('[name="location"]').fill("テスト会場");
  await form.locator('[name="starts_at"]').fill("2030-04-10T10:00");
  await form.locator('[name="ends_at"]').fill("2030-04-10T12:00");
  await form.locator('[name="capacity"]').fill("5");
  await form.getByRole("button", { name: "予定を作成" }).click();
  const created = page.locator(".admin-event").filter({ hasText: "Quality Created Event" });
  await expect(created).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept()); await created.getByRole("button", { name: "削除", exact: true }).click();
  await expect(created).toHaveCount(0);
  await page.goto("/admin/settings"); await expect(page).toHaveURL(/\/admin$/);
});

test("実DB: memberの管理画面アクセスと古いセッションを拒否する", async ({ page }) => {
  await loginAs(page); await page.goto("/admin/events"); await expect(page).toHaveURL(/\/login$/);
  await loginAs(page, "Admin");
  const session = await page.context().cookies();
  await assertDb(qualityDb.rpc("set_user_role", { p_user_id: adminId, p_role: "member" }));
  try {
    await page.context().addCookies(session); await page.goto("/admin/events"); await expect(page).toHaveURL(/\/login$/);
  } finally { await assertDb(qualityDb.rpc("set_user_role", { p_user_id: adminId, p_role: "admin" })); }
});

test("実DB: super_adminの通知先設定は保存・監査される", async ({ page }) => {
  await loginAs(page, "Owner"); await page.goto("/admin/settings");
  await page.getByLabel("通知先メールアドレス").fill("quality-ops@example.com");
  await page.getByLabel("障害・復旧を通知する").check();
  await page.getByRole("button", { name: "通知設定を保存" }).click();
  await expect(page.getByRole("status")).toContainText("監視通知の設定を保存しました");
  const { data } = await assertDb(qualityDb.from("ops_notification_settings").select("email,health_enabled").eq("id", 1).single());
  expect(data).toMatchObject({ email: "quality-ops@example.com", health_enabled: true });
  const audit = await assertDb(qualityDb.from("audit_logs").select("action").eq("action", "ops.notification.settings.update"));
  expect(audit.data!.length).toBeGreaterThan(0);
  await page.getByLabel("障害・復旧を通知する").uncheck(); await page.getByRole("button", { name: "通知設定を保存" }).click();
  await expect.poll(async () => (await assertDb(qualityDb.from("ops_notification_settings").select("health_enabled").eq("id", 1).single())).data?.health_enabled).toBe(false);
});

test("主要レスポンスに安全ヘッダー、HealthはDB実測・認証必須設定は非公開", async ({ request }) => {
  const live = await request.get("/api/health"); expect(await live.json()).toEqual({ status: "ok" });
  const health = await request.get("/api/health", { headers: { authorization: "Bearer quality-monitor-secret" } }); expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ok", database: "ok" });
  for (const path of ["/login", "/register", "/api/health"]) {
    const result = await request.get(path);
    expect(result.headers()["x-content-type-options"]).toBe("nosniff");
    expect(result.headers()["x-frame-options"]).toBe("DENY");
    expect(result.headers()["strict-transport-security"]).toBe("max-age=31536000");
    expect(result.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(result.headers()["x-powered-by"]).toBeUndefined();
  }
  expect((await request.get("/api/ops/monitor-config")).status()).toBe(401);
  const settings = await request.get("/api/ops/monitor-config", { headers: { authorization: "Bearer quality-monitor-secret" } });
  expect(settings.status()).toBe(200); expect(settings.headers()["cache-control"]).toBe("no-store");
});

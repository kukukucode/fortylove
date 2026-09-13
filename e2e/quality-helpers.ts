import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";

const jwtSecret = "local-quality-only-postgrest-jwt-secret-at-least-32";
const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const payload = Buffer.from(JSON.stringify({ role: "service_role", exp: 4102444800 })).toString("base64url");
const key = `${header}.${payload}.${createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url")}`;
// Intentionally not configurable: a typo in CI must never make these tests mutate production.
export const qualityDb = createClient("http://127.0.0.1:54331", key, { auth: { persistSession: false } });
export const memberId = "70000000-0000-4000-8000-000000000001";
export const adminId = "70000000-0000-4000-8000-000000000002";
export const superAdminId = "70000000-0000-4000-8000-000000000003";
export const eventId = "71000000-0000-4000-8000-000000000001";
export async function loginAs(page: Page, role: "Member" | "Admin" | "Owner" = "Member") {
  await page.goto("/login");
  await page.locator('input[name="name"]').fill(`Quality ${role}`);
  await page.locator('input[name="password"]').fill("QualityTest!123");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(role === "Member" ? /\/home$/ : /\/admin$/);
  await expect(page.locator("h1")).toBeVisible();
}
export async function assertDb<T extends { error: unknown }>(promise: PromiseLike<T>): Promise<T> {
  const result = await promise; expect(result.error).toBeNull(); return result;
}

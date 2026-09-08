import { z } from "zod";

export const notificationSettingsSchema = z.object({
  email: z.string().trim().max(254).email().or(z.literal("")),
  health_enabled: z.boolean(),
  errors_enabled: z.boolean(),
}).refine((value) => !value.health_enabled && !value.errors_enabled || !!value.email, {
  message: "通知を有効にする場合はメールアドレスが必要です。", path: ["email"],
});

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

// Only static route names may leave the application. Never send path parameters or query strings.
const routes = new Set(["/", "/login", "/register", "/home", "/faq", "/profile", "/admin", "/admin/events", "/admin/participation", "/admin/faqs", "/admin/settings", "/admin/chatbot", "/admin/members", "/admin/admins", "/admin/withdrawals", "/api/health", "/api/chatbot/preview", "/api/admin/chatbot/import"]);
export function safeRoute(path: string) { return routes.has(path.split("?")[0]) ? path.split("?")[0] : "other"; }

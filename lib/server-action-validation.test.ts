import { describe, expect, it } from "vitest";
import {
  chatbotAudienceSourcesInputSchema,
  createEventInputSchema,
  createFaqInputSchema,
  resetPasswordInputSchema,
  updateRoleInputSchema,
  withdrawalIdsInputSchema,
} from "./server-action-validation";

const userId = "550e8400-e29b-41d4-a716-446655440000";

describe("Server Action input validation", () => {
  it("coerces bounded event values and rejects invalid capacity", () => {
    const valid = {
      title: "練習会",
      starts_at: "2026-09-10T10:00",
      ends_at: "2026-09-10T12:00",
      location: "早稲田大学",
      capacity: "20",
      description: "初心者歓迎",
      event_type: "tennis",
    };
    expect(createEventInputSchema.parse(valid).capacity).toBe(20);
    expect(createEventInputSchema.safeParse({ ...valid, capacity: "0" }).success).toBe(false);
    expect(createEventInputSchema.safeParse({ ...valid, event_type: "other" }).success).toBe(false);
  });

  it("rejects unsupported role values", () => {
    expect(updateRoleInputSchema.safeParse({ user_id: userId, role: "owner" }).success).toBe(false);
  });

  it("validates FAQ bounds and chatbot source limits", () => {
    expect(createFaqInputSchema.safeParse({
      question: "集合場所は？",
      answer: "正門前です。",
      category: "参加案内",
      sort_order: "1",
      is_published: "true",
    }).success).toBe(true);
    expect(chatbotAudienceSourcesInputSchema.safeParse({
      audience: "member",
      source_names: Array.from({ length: 51 }, (_, index) => `source-${index}.md`),
    }).success).toBe(false);
  });

  it("validates passwords and positive withdrawal IDs", () => {
    expect(resetPasswordInputSchema.safeParse({ user_id: userId, temporary_password: "short" }).success).toBe(false);
    expect(resetPasswordInputSchema.safeParse({ user_id: userId, temporary_password: "safe-pass" }).success).toBe(true);
    expect(withdrawalIdsInputSchema.safeParse({ withdrawal_ids: ["1", "2"] }).success).toBe(true);
    expect(withdrawalIdsInputSchema.safeParse({ withdrawal_ids: ["0"] }).success).toBe(false);
  });
});

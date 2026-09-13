import { z } from "zod";
import { uuidSchema } from "@/lib/input-validation";
import { isValidNewPassword } from "@/lib/password-policy";

const trimmedText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

export const booleanFormValueSchema = z.enum(["true", "false"]).transform((value) => value === "true");
export const audienceSchema = z.enum(["admin", "member"]);
export const userRoleSchema = z.enum(["member", "admin", "super_admin"]);
export const assignableAdminRoleSchema = z.enum(["admin", "super_admin"]);
export const positiveIntegerIdSchema = z.coerce.number().int().positive();
export const temporaryPasswordSchema = z.string().max(256).refine(isValidNewPassword);

const eventFields = {
  title: trimmedText(1, 160),
  starts_at: trimmedText(1, 64),
  ends_at: trimmedText(1, 64),
  location: trimmedText(1, 160),
  capacity: z.coerce.number().int().min(1).max(10_000),
  description: z.string().trim().max(5_000),
  event_type: z.enum(["tennis", "event"]).default("tennis"),
};

export const createEventInputSchema = z.object(eventFields);
export const updateEventInputSchema = z.object({
  event_id: uuidSchema,
  ...eventFields,
  remove_document: booleanFormValueSchema.default("false"),
});
export const eventIdInputSchema = z.object({ event_id: uuidSchema });

const faqFields = {
  question: trimmedText(1, 500),
  answer: trimmedText(1, 5_000),
  category: trimmedText(1, 100),
  sort_order: z.coerce.number().int().min(-10_000).max(10_000),
  is_published: booleanFormValueSchema,
};

export const faqQuestionInputSchema = z.object({ question: trimmedText(5, 500) });
export const createFaqInputSchema = z.object(faqFields);
export const answerFaqInputSchema = z.object({ submission_id: uuidSchema, ...faqFields });
export const updateFaqInputSchema = z.object({ faq_id: uuidSchema, ...faqFields });
export const faqIdInputSchema = z.object({ faq_id: uuidSchema });
export const faqSubmissionIdInputSchema = z.object({ submission_id: uuidSchema });
export const faqCategoryInputSchema = z.object({
  name: trimmedText(1, 100),
  sort_order: z.coerce.number().int().min(-10_000).max(10_000),
});
export const deleteFaqCategoryInputSchema = z.object({
  category_id: uuidSchema,
  category_name: trimmedText(1, 100),
});

export const updateRoleInputSchema = z.object({ user_id: uuidSchema, role: userRoleSchema });
export const updateRolesInputSchema = z.object({
  user_ids: z.array(uuidSchema).min(1).max(500),
  role: assignableAdminRoleSchema,
});
export const resetPasswordInputSchema = z.object({
  user_id: uuidSchema,
  temporary_password: temporaryPasswordSchema,
});
export const userIdInputSchema = z.object({ user_id: uuidSchema });
export const restoreWithdrawalInputSchema = z.object({
  withdrawal_id: positiveIntegerIdSchema,
  temporary_password: temporaryPasswordSchema,
});
export const userIdsInputSchema = z.object({ user_ids: z.array(uuidSchema).min(1).max(500) });
export const withdrawalIdsInputSchema = z.object({
  withdrawal_ids: z.array(positiveIntegerIdSchema).min(1).max(500),
});

export const recruitingStatusInputSchema = z.object({ recruiting_open: booleanFormValueSchema });
export const chatbotAudienceAccessInputSchema = z.object({
  audience: audienceSchema,
  enabled: booleanFormValueSchema,
});
export const chatbotAudienceSourcesInputSchema = z.object({
  audience: audienceSchema,
  source_names: z.array(trimmedText(1, 255)).max(50),
});
export const escalationEmailSchema = z.union([z.literal(""), z.string().trim().email().max(254)]);
export const markdownSourceNameSchema = trimmedText(1, 255);

"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/server/action-context";
import { parseActionInput } from "@/lib/server/action-input";
import { writeAuditLog } from "@/lib/server/audit-log";
import { formText } from "@/lib/server/form-data";
import { isMissingColumnError } from "@/lib/supabase-errors";
import {
  chatbotAudienceAccessInputSchema,
  chatbotAudienceSourcesInputSchema,
  escalationEmailSchema,
  markdownSourceNameSchema,
} from "@/lib/server-action-validation";

export async function updateChatbotAudienceAccess(formData: FormData) {
  const user = await requireSuperAdmin();
  const { audience, enabled } = parseActionInput(
    chatbotAudienceAccessInputSchema,
    { audience: formText(formData, "audience"), enabled: formText(formData, "enabled") },
    "/admin/chatbot?error=access-validation",
  );
  const client = db();
  const updates =
    audience === "admin" ? { chatbot_admin_enabled: enabled } : { chatbot_member_enabled: enabled };
  const { error } = await client.from("app_settings").update(updates).eq("id", 1);
  if (error) redirect("/admin/chatbot?error=access-save");
  await writeAuditLog(client, {
    actorId: user.id,
    action: `chatbot.access.${audience}.${enabled ? "enable" : "disable"}`,
    targetType: "app_settings",
  });
  redirect(`/admin/chatbot?access_updated=${audience}-${enabled ? "on" : "off"}`);
}

export async function updateChatbotAudienceSources(formData: FormData) {
  const user = await requireSuperAdmin();
  const sourceNames = [
    ...new Set(
      formData
        .getAll("source_names")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
  const { audience, source_names: validatedSourceNames } = parseActionInput(
    chatbotAudienceSourcesInputSchema,
    { audience: formText(formData, "audience"), source_names: sourceNames },
    "/admin/chatbot?error=sources-validation",
  );
  const client = db();
  if (validatedSourceNames.length) {
    const { data: available, error: sourceError } = await client.rpc("chatbot_source_inventory");
    const availableNames = new Set(
      (available ?? []).map((item: { source_name: string }) => item.source_name),
    );
    if (sourceError) {
      console.error("Failed to verify chatbot Markdown sources", {
        code: sourceError.code,
        message: sourceError.message,
        details: sourceError.details,
      });
      redirect("/admin/chatbot?error=sources-read");
    }
    if (validatedSourceNames.some((name) => !availableNames.has(name)))
      redirect("/admin/chatbot?error=sources-validation");
  }
  const updates =
    audience === "admin"
      ? { chatbot_admin_sources: validatedSourceNames }
      : { chatbot_member_sources: validatedSourceNames };
  const { error } = await client.from("app_settings").update(updates).eq("id", 1);
  if (error) {
    console.error("Failed to save chatbot Markdown sources", {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    const missingColumns = ["chatbot_admin_sources", "chatbot_member_sources"];
    redirect(
      `/admin/chatbot?error=${isMissingColumnError(error, missingColumns) ? "sources-migration" : "sources-save"}`,
    );
  }
  await writeAuditLog(client, {
    actorId: user.id,
    action: `chatbot.sources.${audience}.update`,
    targetType: "app_settings",
  });
  redirect(`/admin/chatbot?sources_updated=${audience}`);
}

export async function updateChatbotEscalationEmail(formData: FormData) {
  const user = await requireSuperAdmin();
  const email = parseActionInput(
    escalationEmailSchema,
    formText(formData, "escalation_email"),
    "/admin/chatbot?error=email-validation",
  );
  const client = db();
  const { error } = await client
    .from("app_settings")
    .update({ chatbot_escalation_email: email || null })
    .eq("id", 1);
  if (error) redirect("/admin/chatbot?error=email-save");
  await writeAuditLog(client, {
    actorId: user.id,
    action: "chatbot.escalation_email.update",
    targetType: "app_settings",
  });
  redirect("/admin/chatbot?email_updated=1");
}

export async function deleteChatbotMarkdownSource(formData: FormData) {
  const user = await requireSuperAdmin();
  const sourceName = parseActionInput(
    markdownSourceNameSchema,
    formText(formData, "source_name"),
    "/admin/chatbot?error=markdown-source",
  );
  const client = db();
  const { error } = await client.rpc("delete_chatbot_document", {
    p_actor: user.id,
    p_name: sourceName,
  });
  if (error) redirect("/admin/chatbot?error=markdown-delete");
  redirect("/admin/chatbot?source_deleted=1");
}

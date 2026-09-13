"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { parseActionInput } from "@/lib/server/action-input";
import { requireAdmin, requireSuperAdmin } from "@/lib/server/action-context";
import { writeAuditLog } from "@/lib/server/audit-log";
import { removeAvatarFiles } from "@/lib/server/avatar-service";
import { formText } from "@/lib/server/form-data";
import { archiveAndDeleteMember } from "@/lib/server/member-account-service";
import {
  resetPasswordInputSchema,
  restoreWithdrawalInputSchema,
  updateRoleInputSchema,
  updateRolesInputSchema,
  userIdInputSchema,
  userIdsInputSchema,
  withdrawalIdsInputSchema,
} from "@/lib/server-action-validation";

export async function updateUserRole(formData: FormData) {
  const actor = await requireSuperAdmin();
  const parsed = updateRoleInputSchema.safeParse({ user_id: formText(formData, "user_id"), role: formText(formData, "role") });
  if (!parsed.success || parsed.data.user_id === actor.id) return;
  const { user_id: userId, role } = parsed.data;

  const client = db();
  const { data: updated, error } = await client.rpc("set_user_role_atomic", {
    p_actor: actor.id,
    p_user_id: userId,
    p_role: role,
  });
  if (error || !updated) redirect("/admin/admins?error=role-update");
  redirect("/admin/admins?role_updated=1");
}

export async function updateUsersRole(formData: FormData) {
  const actor = await requireSuperAdmin();
  const { user_ids: userIds, role } = parseActionInput(updateRolesInputSchema, {
    user_ids: [...new Set(formData.getAll("user_ids").map(String))].filter((id) => id !== actor.id),
    role: formText(formData, "role"),
  }, "/admin/admins?error=selection");

  const client = db();
  const { data: updated, error } = await client.rpc("set_members_role_atomic", {
    p_actor: actor.id,
    p_user_ids: userIds,
    p_role: role,
  });
  if (error || updated !== userIds.length) redirect("/admin/admins?error=role-update");
  redirect(`/admin/admins?role_updated=${userIds.length}`);
}

export async function resetUserPassword(formData: FormData) {
  const actor = await requireSuperAdmin();
  const { user_id: userId, temporary_password: temporaryPassword } = parseActionInput(
    resetPasswordInputSchema,
    { user_id: formText(formData, "user_id"), temporary_password: formText(formData, "temporary_password") },
    "/admin?error=password",
  );

  const client = db();
  const { data: updated, error } = await client.rpc("replace_user_password", {
    p_user_id: userId,
    p_password_hash: await bcrypt.hash(temporaryPassword, 12),
  });
  if (error || !updated) redirect("/admin?error=password-update");
  await writeAuditLog(client, {
    actorId: actor.id, action: "user.password.reset", targetType: "user", targetId: userId,
  });
  redirect("/admin?password_reset=1");
}

export async function registerJoinedMember(formData: FormData) {
  const actor = await requireAdmin();
  const { user_id: userId } = parseActionInput(
    userIdInputSchema,
    { user_id: formText(formData, "user_id") },
    "/admin/members?error=membership-register",
  );

  const client = db();
  const { error } = await client.from("membership_applications").upsert(
    { user_id: userId, status: "approved", applied_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) redirect("/admin/members?error=membership-register");
  await writeAuditLog(client, {
    actorId: actor.id, action: "membership.register.direct", targetType: "user", targetId: userId,
  });
  redirect("/admin/members?membership_registered=1");
}

export async function deleteMemberAccount(formData: FormData) {
  const actor = await requireAdmin();
  const { user_id: userId } = parseActionInput(
    userIdInputSchema,
    { user_id: formText(formData, "user_id") },
    "/admin/members?error=delete",
  );
  if (!await archiveAndDeleteMember(userId, actor.id, "admin")) redirect("/admin/members?error=delete");
  await removeAvatarFiles(userId);
  redirect("/admin/members?deleted=1");
}

export async function deleteReceptionAccount(formData: FormData) {
  const actor = await requireSuperAdmin();
  const { user_id: userId } = parseActionInput(
    userIdInputSchema,
    { user_id: formText(formData, "user_id") },
    "/admin?error=delete",
  );
  if (!await archiveAndDeleteMember(userId, actor.id, "admin")) redirect("/admin?error=delete");
  await removeAvatarFiles(userId);
  redirect("/admin?deleted=1");
}

export async function restoreWithdrawalAccount(formData: FormData) {
  const actor = await requireSuperAdmin();
  const { withdrawal_id: withdrawalId, temporary_password: temporaryPassword } = parseActionInput(
    restoreWithdrawalInputSchema,
    { withdrawal_id: formText(formData, "withdrawal_id"), temporary_password: formText(formData, "temporary_password") },
    "/admin/withdrawals?error=password",
  );

  const client = db();
  const { data: archived, error: archiveError } = await client.from("membership_withdrawals")
    .select("*").eq("id", withdrawalId).single();
  if (archiveError || !archived) redirect("/admin/withdrawals?error=restore");
  const { error: restoreError } = await client.from("users").insert({
    id: archived.former_user_id,
    name: archived.name,
    password_hash: await bcrypt.hash(temporaryPassword, 12),
    university: archived.university,
    faculty: archived.faculty,
    department: archived.department,
    grade: archived.grade ?? 1,
    instagram_id: archived.instagram_id,
    line_display_name: archived.line_display_name,
    tennis_experience: archived.tennis_experience,
    has_racket: archived.has_racket,
    role: "member",
  });
  if (restoreError) redirect("/admin/withdrawals?error=restore");
  const { error: deleteError } = await client.from("membership_withdrawals").delete().eq("id", withdrawalId);
  if (deleteError) {
    await client.from("users").delete().eq("id", archived.former_user_id);
    redirect("/admin/withdrawals?error=restore");
  }
  await writeAuditLog(client, {
    actorId: actor.id, action: "account.restore.withdrawal", targetType: "user", targetId: archived.former_user_id,
  });
  redirect("/admin/withdrawals?restored=1");
}

export async function deleteMemberAccounts(formData: FormData) {
  const actor = await requireSuperAdmin();
  const { user_ids: userIds } = parseActionInput(
    userIdsInputSchema,
    { user_ids: [...new Set(formData.getAll("user_ids").map(String))] },
    "/admin/members?error=selection",
  );

  let deleted = 0;
  for (const userId of userIds) {
    if (!await archiveAndDeleteMember(userId, actor.id, "admin")) continue;
    await removeAvatarFiles(userId);
    deleted += 1;
  }
  if (!deleted) redirect("/admin/members?error=delete");
  redirect(`/admin/members?deleted=${deleted}`);
}

export async function deleteWithdrawalRecords(formData: FormData) {
  const actor = await requireSuperAdmin();
  const { withdrawal_ids: ids } = parseActionInput(
    withdrawalIdsInputSchema,
    { withdrawal_ids: [...new Set(formData.getAll("withdrawal_ids").map(String))] },
    "/admin/withdrawals?error=selection",
  );

  const client = db();
  const { error } = await client.from("membership_withdrawals").delete().in("id", ids);
  if (error) redirect("/admin/withdrawals?error=delete");
  await writeAuditLog(client, {
    actorId: actor.id, action: "withdrawal.archive.delete", targetType: "membership_withdrawals",
  });
  redirect(`/admin/withdrawals?deleted=${ids.length}`);
}

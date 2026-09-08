"use server";

import { redirect } from "next/navigation";
import { clearSession, setSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { memberProfileInputSchema, uuidSchema } from "@/lib/input-validation";
import { requireMember, requireParticipant } from "@/lib/server/action-context";
import { parseActionInput } from "@/lib/server/action-input";
import { formText } from "@/lib/server/form-data";
import { removeAvatarFiles, uploadAvatar } from "@/lib/server/avatar-service";
import { archiveAndDeleteMember } from "@/lib/server/member-account-service";
import { configuredSupabaseRole } from "@/lib/server/supabase-diagnostics";

export type ReservationResult = { error?: "reservation" | "full" | "cancel-deadline" };

export async function reserve(formData: FormData): Promise<ReservationResult> {
  const user = await requireParticipant();
  const parsed = uuidSchema.safeParse(formText(formData, "event_id"));
  if (!parsed.success) return { error: "reservation" };
  const eventId = parsed.data;

  const { data, error } = await db().rpc("reserve_event", { p_user_id: user.id, p_event_id: eventId });
  if (error) return { error: "reservation" };
  if (data === "full") return { error: "full" };
  if (!["reserved", "already_reserved"].includes(String(data))) return { error: "reservation" };
  return {};
}

export async function cancelReservation(formData: FormData): Promise<ReservationResult> {
  const user = await requireParticipant();
  const parsed = uuidSchema.safeParse(formText(formData, "event_id"));
  if (!parsed.success) return { error: "reservation" };
  const eventId = parsed.data;

  const { data, error } = await db().rpc("cancel_event_reservation", { p_user_id: user.id, p_event_id: eventId });
  if (error) return { error: "reservation" };
  if (data === "deadline_passed") return { error: "cancel-deadline" };
  if (data !== "cancelled") return { error: "reservation" };
  return {};
}

export async function deleteOwnAccount() {
  const user = await requireMember();
  if (!await archiveAndDeleteMember(user.id, user.id, "self")) redirect("/profile?error=delete");
  await removeAvatarFiles(user.id);
  await clearSession();
  redirect("/login?deleted=1");
}

export async function updateProfile(formData: FormData) {
  const user = await requireMember();
  const input = parseActionInput(memberProfileInputSchema, {
    name: formText(formData, "name"),
    university: formText(formData, "university"),
    faculty: formText(formData, "faculty"),
    department: formText(formData, "department"),
    grade: formText(formData, "grade"),
    instagram_id: formText(formData, "instagram_id"),
    line_display_name: formText(formData, "line_display_name"),
    tennis_experience: formText(formData, "tennis_experience"),
    has_racket: formText(formData, "has_racket"),
  }, "/profile?error=validation");

  const avatar = formData.get("avatar");
  const avatarResult = avatar instanceof File && avatar.size > 0
    ? await uploadAvatar(user.id, avatar)
    : undefined;
  if (avatarResult?.error) redirect(`/profile?error=${avatarResult.error}`);

  const updates = {
    name: input.name,
    university: input.university,
    faculty: input.faculty,
    department: input.department,
    grade: input.grade,
    instagram_id: input.instagram_id || null,
    line_display_name: input.line_display_name || null,
    tennis_experience: input.tennis_experience,
    has_racket: input.has_racket === "true",
    ...(avatarResult?.avatarUrl ? { avatar_url: avatarResult.avatarUrl } : {}),
  };
  const { error } = await db().from("users").update(updates).eq("id", user.id);
  if (error) {
    console.error("Profile database error", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      configuredKeyRole: configuredSupabaseRole(),
    });
    if (error.message.includes("avatar_url")) redirect("/profile?error=avatar-column");
    redirect("/profile?error=update");
  }
  await setSession({ ...user, name: input.name });
  redirect("/profile?saved=1");
}

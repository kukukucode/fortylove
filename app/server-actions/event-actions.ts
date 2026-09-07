"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { tokyoLocalToIso } from "@/lib/datetime";
import { requireAdmin } from "@/lib/server/action-context";
import { parseActionInput } from "@/lib/server/action-input";
import { writeAuditLog } from "@/lib/server/audit-log";
import { formText } from "@/lib/server/form-data";
import { isOwnedEventDocumentUploadPath, isValidEventDocumentName } from "@/lib/event-document-policy";
import { attachUploadedEventDocument, EVENT_DOCUMENT_BUCKET, removeEventDocument, removeUploadedEventDocument } from "@/lib/server/event-documents";
import {
  attendanceInputSchema,
  createEventInputSchema,
  eventIdInputSchema,
  updateEventInputSchema,
} from "@/lib/server-action-validation";

const eventFormInput = (formData: FormData) => ({
  title: formText(formData, "title"),
  starts_at: formText(formData, "starts_at"),
  ends_at: formText(formData, "ends_at"),
  location: formText(formData, "location"),
  capacity: formText(formData, "capacity"),
  description: formText(formData, "description"),
  event_type: formText(formData, "event_type") || undefined,
});

function uploadedDocument(formData: FormData, actorId: string) {
  const state = formText(formData, "document_upload_state");
  const path = formText(formData, "document_path");
  const name = formText(formData, "document_name");
  if (state === "uploading") return { error: "pending" } as const;
  if (state === "error") return { error: "upload" } as const;
  if (!path && !name) return { document: null } as const;
  if (state !== "ready" || !isOwnedEventDocumentUploadPath(path, actorId) || !isValidEventDocumentName(name)) {
    return { error: "upload" } as const;
  }
  return { document: { path, name } } as const;
}

export async function createEvent(formData: FormData) {
  const user = await requireAdmin();
  const uploaded = uploadedDocument(formData, user.id);
  if ("error" in uploaded) redirect(`/admin/events?error=document-${uploaded.error}`);
  const parsed = createEventInputSchema.safeParse(eventFormInput(formData));
  if (!parsed.success) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=create");
  }
  const input = parsed.data;
  const client = db();
  const startsAt = tokyoLocalToIso(input.starts_at);
  const endsAt = tokyoLocalToIso(input.ends_at);
  if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=create");
  }
  const { data, error } = await client.from("events").insert({
    title: input.title, starts_at: startsAt, ends_at: endsAt,
    location: input.location, capacity: input.capacity, description: input.description,
    event_type: input.event_type,
  }).select("id").single();
  if (error) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=create");
  }
  if (data?.id && uploaded.document) {
    const documentError = await attachUploadedEventDocument(data.id, user.id, uploaded.document.path, uploaded.document.name);
    if (documentError) {
      await client.from("events").delete().eq("id", data.id);
      await removeUploadedEventDocument(uploaded.document.path, user.id);
      redirect(`/admin/events?error=document-${documentError}`);
    }
  }
  await writeAuditLog(client, { actorId: user.id, action: "event.create", targetType: "event", targetId: data?.id });
  revalidatePath("/admin/events");
}

export async function updateEvent(formData: FormData) {
  const user = await requireAdmin();
  const uploaded = uploadedDocument(formData, user.id);
  if ("error" in uploaded) redirect(`/admin/events?error=document-${uploaded.error}`);
  const parsed = updateEventInputSchema.safeParse({
    event_id: formText(formData, "event_id"),
    ...eventFormInput(formData),
    remove_document: formText(formData, "remove_document") || "false",
  });
  const startsAt = parsed.success ? tokyoLocalToIso(parsed.data.starts_at) : null;
  const endsAt = parsed.success ? tokyoLocalToIso(parsed.data.ends_at) : null;
  if (!parsed.success || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=update");
  }
  const { event_id: eventId, capacity } = parsed.data;
  const client = db();
  const { count } = await client.from("reservations").select("*", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "reserved");
  if (capacity < (count ?? 0)) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=capacity");
  }
  const { error } = await client.from("events").update({
    title: parsed.data.title, starts_at: startsAt, ends_at: endsAt,
    location: parsed.data.location, capacity, description: parsed.data.description,
    event_type: parsed.data.event_type,
  }).eq("id", eventId);
  if (error) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=update");
  }
  if (uploaded.document) {
    const documentError = await attachUploadedEventDocument(eventId, user.id, uploaded.document.path, uploaded.document.name);
    if (documentError) {
      await removeUploadedEventDocument(uploaded.document.path, user.id);
      redirect(`/admin/events?error=document-${documentError}`);
    }
  } else if (parsed.data.remove_document && !await removeEventDocument(eventId)) {
    redirect("/admin/events?error=document-delete");
  }
  await writeAuditLog(client, { actorId: user.id, action: "event.update", targetType: "event", targetId: eventId });
  revalidatePath("/home");
  redirect("/admin/events?updated=1");
}

export async function deleteEvent(formData: FormData) {
  const user = await requireAdmin();
  const { event_id: eventId } = parseActionInput(
    eventIdInputSchema,
    { event_id: formText(formData, "event_id") },
    "/admin/events?error=selection",
  );
  const client = db();
  const { data: document } = await client.from("event_documents").select("file_path").eq("event_id", eventId).maybeSingle();
  const { error } = await client.from("events").delete().eq("id", eventId);
  if (error) {
    console.error("Event delete error", { message: error.message, code: error.code, details: error.details });
    redirect("/admin/events?error=delete");
  }
  if (document?.file_path) await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([document.file_path]);
  await writeAuditLog(client, { actorId: user.id, action: "event.delete", targetType: "event", targetId: eventId });
  revalidatePath("/admin/events");
  redirect("/admin/events?deleted=1");
}

export async function updateAttendance(formData: FormData) {
  const user = await requireAdmin();
  const { id: reservationId, status } = parseActionInput(
    attendanceInputSchema,
    { id: formText(formData, "id"), status: formText(formData, "status") },
    "/admin/events?error=attendance",
  );
  const client = db();
  const { error } = await client.from("reservations").update({ status }).eq("id", reservationId);
  if (error) redirect("/admin/events?error=attendance");
  await writeAuditLog(client, { actorId: user.id, action: "reservation.attendance.update", targetType: "reservation", targetId: reservationId });
  redirect("/admin/events?attendance_updated=1");
}

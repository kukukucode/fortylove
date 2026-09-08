import type { MemberEventItem } from "@/components/member-event-browser";
import { db } from "@/lib/db";

export async function loadReservableEvents(userId: string): Promise<MemberEventItem[]> {
  const client = db();
  const [{ data: events }, { data: reservations }, { data: documents }] = await Promise.all([
    client.from("events").select("*,reservations(id,status)").gte("ends_at", new Date().toISOString()).order("starts_at"),
    client.from("reservations").select("event_id,status").eq("user_id", userId),
    client.from("event_documents").select("event_id,file_path,file_name"),
  ]);

  const documentByEvent = new Map<string, { url: string; fileName: string }>();
  if (documents?.length) {
    const { data: signedDocuments } = await client.storage
      .from("event-documents")
      .createSignedUrls(documents.map((document) => document.file_path), 3600);
    signedDocuments?.forEach((signed) => {
      const document = documents.find((item) => item.file_path === signed.path);
      if (document && signed.signedUrl) {
        documentByEvent.set(document.event_id, { url: signed.signedUrl, fileName: document.file_name });
      }
    });
  }

  const status = new Map(reservations?.map((reservation) => [reservation.event_id, reservation.status]));
  return (events ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    location: event.location,
    capacity: event.capacity,
    reservedCount: event.reservations.filter((reservation: { status: string }) => reservation.status === "reserved").length,
    description: event.description,
    eventType: event.event_type === "event" ? "event" : "tennis",
    booked: status.get(event.id) === "reserved",
    document: documentByEvent.get(event.id),
  }));
}

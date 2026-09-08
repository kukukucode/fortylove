import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { MemberHeader } from "@/components/member-header";
import { MemberEventBrowser, type MemberEventItem } from "@/components/member-event-browser";
import { SiteFooter } from "@/components/site-footer";
import { ChatbotWidget } from "@/components/chatbot-widget";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const client = db();
  const [{ data: events }, { data: reservations }, { data: profile }, { data: documents }, { data: settings }] = await Promise.all([
    client.from("events").select("*,reservations(id,status)").gte("ends_at", new Date().toISOString()).order("starts_at"),
    client.from("reservations").select("event_id,status").eq("user_id", session.id),
    client.from("users").select("avatar_url").eq("id", session.id).maybeSingle(),
    client.from("event_documents").select("event_id,file_path,file_name"),
    client.from("app_settings").select("chatbot_member_enabled").eq("id", 1).maybeSingle(),
  ]);

  const documentByEvent = new Map<string, { url: string; fileName: string }>();
  if (documents?.length) {
    const { data: signedDocuments } = await client.storage.from("event-documents").createSignedUrls(documents.map((document) => document.file_path), 3600);
    signedDocuments?.forEach((signed) => {
      const document = documents.find((item) => item.file_path === signed.path);
      if (document && signed.signedUrl) documentByEvent.set(document.event_id, { url: signed.signedUrl, fileName: document.file_name });
    });
  }

  const status = new Map(reservations?.map((reservation) => [reservation.event_id, reservation.status]));
  const items: MemberEventItem[] = (events ?? []).map((event) => ({
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

  return <main className="member-shell events-page">
    <MemberHeader active="events" name={session.name} avatarUrl={profile?.avatar_url} />
    <section className="events-hero"><p className="eyebrow">UPCOMING EVENTS</p><h1>次の楽しみを見つけよう。</h1><p>練習もイベントも、気になる予定を選んで詳細を確認できます。</p></section>
    <section className="events-content">
      <div className="section-head"><div><p className="eyebrow green">DISCOVER</p><h2>イベント一覧</h2></div><span className="count">{items.length}件</span></div>
      <MemberEventBrowser events={items} />
    </section>
    <SiteFooter />
    {settings?.chatbot_member_enabled === true && <ChatbotWidget mode="member" />}
  </main>;
}

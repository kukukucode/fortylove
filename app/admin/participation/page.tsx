import { redirect } from "next/navigation";
import { MemberEventBrowser } from "@/components/member-event-browser";
import { getSession } from "@/lib/auth";
import { loadReservableEvents } from "@/lib/server/reservable-events";

export const dynamic = "force-dynamic";

export default async function AdminParticipationPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "super_admin") redirect("/admin");
  const events = await loadReservableEvents(session.id);

  return <section className="admin-page admin-participation-page">
    <div className="page-title"><div><p className="eyebrow green">JOIN EVENTS</p><h1>イベントに参加</h1><p>最高管理者として、公開中の練習・イベントを確認して予約できます。</p></div></div>
    <div className="section-head"><div><p className="eyebrow green">UPCOMING</p><h2>開催予定</h2></div><span className="count">{events.length}件</span></div>
    <MemberEventBrowser events={events} />
  </section>;
}

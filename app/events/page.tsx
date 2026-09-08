import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { MemberHeader } from "@/components/member-header";
import { MemberEventBrowser } from "@/components/member-event-browser";
import { SiteFooter } from "@/components/site-footer";
import { ChatbotWidget } from "@/components/chatbot-widget";
import { loadReservableEvents } from "@/lib/server/reservable-events";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "member") redirect(session.role === "super_admin" ? "/admin/participation" : "/admin");
  const client = db();
  const [{ data: profile }, { data: settings }, items] = await Promise.all([
    client.from("users").select("avatar_url").eq("id", session.id).maybeSingle(),
    client.from("app_settings").select("chatbot_member_enabled").eq("id", 1).maybeSingle(),
    loadReservableEvents(session.id),
  ]);

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

import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ClearRegistrationDraft } from "@/components/registration-draft";
import { SiteFooter } from "@/components/site-footer";
import { ParticipationCalendar } from "@/components/participation-calendar";
import { ChatbotWidget } from "@/components/chatbot-widget";
import { MemberHeader } from "@/components/member-header";
import { tokyoParts, tokyoTimeLabel } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; reserved?: string; cancelled?: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { error, reserved, cancelled } = await searchParams;
  const client = db();
  const [{ data: events }, { data: reservations }, { data: profile }, { data: settings }] = await Promise.all([
    client.from("events").select("id,title,location,starts_at,ends_at,event_type").gte("ends_at", new Date().toISOString()).order("starts_at"),
    client.from("reservations").select("event_id,status").eq("user_id", user.id),
    client.from("users").select("avatar_url").eq("id", user.id).maybeSingle(),
    client.from("app_settings").select("chatbot_member_enabled").eq("id", 1).maybeSingle(),
  ]);
  const status = new Map(reservations?.map((reservation) => [reservation.event_id, reservation.status]));
  const participationEvents = (events ?? [])
    .filter((event) => ["reserved", "attended"].includes(status.get(event.id) ?? ""))
    .map((event) => ({ id: event.id, title: event.title, location: event.location, starts_at: event.starts_at, ends_at: event.ends_at, event_type: event.event_type }));
  const nextEvent = participationEvents[0];
  const nextDate = nextEvent ? tokyoParts(nextEvent.starts_at) : undefined;

  return <main className="member-shell">
    <ClearRegistrationDraft />
    <MemberHeader active="home" name={user.name} avatarUrl={profile?.avatar_url} />
    <section className="welcome">
      <div><p className="eyebrow green">WELCOME BACK</p><h1>{user.name}さん、こんにちは。</h1><p>参加予定を確認して、次のFortyloveを楽しみましょう。</p></div>
      <div className="mini-court" aria-hidden="true">
        <span className="court-singles" />
        <span className="court-service-box" />
        <span className="court-net" />
        <i className="court-ball" />
      </div>
    </section>
    <section className="member-content home-content">
      {error === "full" && <div className="alert">申し訳ございません。定員がいっぱいになってしまっています。</div>}
      {error === "reservation" && <div className="alert">予約を登録できませんでした。もう一度お試しください。</div>}
      {error === "cancel-deadline" && <div className="alert">開始2時間前を過ぎた予定は、画面からキャンセルできません。</div>}
      {reserved && <div className="success-message">参加予約を登録し、カレンダーへ反映しました。</div>}
      {cancelled && <div className="success-message">参加予約をキャンセルしました。</div>}

      <ParticipationCalendar events={participationEvents} focusEventId={reserved} />

      <section className="home-next-event" aria-labelledby="next-event-heading">
        <div className="section-head"><div><p className="eyebrow green">NEXT UP</p><h2 id="next-event-heading">次の参加予定</h2></div><Link href="/events">イベントを探す<ArrowRight /></Link></div>
        {nextEvent && nextDate ? <Link className="next-event-card" href={`/events#event-${nextEvent.id}`}>
          <span className="next-event-date"><strong>{nextDate.day}</strong><small>{nextDate.month}月・{nextDate.weekday}</small></span>
          <span className="next-event-main"><small>{nextEvent.event_type === "tennis" ? "テニス" : "イベント"}</small><strong>{nextEvent.title}</strong><span><Clock3 />{tokyoTimeLabel(nextEvent.starts_at)}–{tokyoTimeLabel(nextEvent.ends_at)} <MapPin />{nextEvent.location}</span></span>
          <ArrowRight />
        </Link> : <div className="next-event-empty"><CalendarDays /><div><strong>参加予定はまだありません</strong><p>イベント一覧から気になる予定を探してみましょう。</p></div><Link className="primary" href="/events">イベントを見る</Link></div>}
      </section>
    </section>
    <SiteFooter />
    {settings?.chatbot_member_enabled === true && <ChatbotWidget mode="member" />}
  </main>;
}

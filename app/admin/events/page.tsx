import { FormFeedback } from "@/components/form-feedback";
import Link from "next/link";
import { createEvent, deleteEvent } from "@/app/server-actions/event-actions";
import { db } from "@/lib/db";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { AdminEventEdit } from "@/components/admin-event-edit";
import { EventDocumentUploadInput } from "@/components/event-document-upload-input";
import { toTokyoDatetimeLocal, tokyoDateKey, tokyoParts, tokyoTimeLabel } from "@/lib/datetime";
import { EVENT_DOCUMENT_MAX_LABEL } from "@/lib/event-document-policy";
import { visibleDepartment } from "@/lib/profile";

export const dynamic = "force-dynamic";

const eventDateLabel = (startsAt: string, endsAt: string) => {
  const start = tokyoParts(startsAt);
  const end = tokyoParts(endsAt);
  const startLabel = `${start.month}月${start.day}日`;
  const endLabel = `${end.month}月${end.day}日`;
  return tokyoDateKey(startsAt) === tokyoDateKey(endsAt) ? startLabel : `${startLabel} ～ ${endLabel}`;
};

type Reservation = {
  id: string;
  status: string;
  user: {
    name: string;
    university: string;
    faculty: string;
    department: string;
    grade: number;
    line_display_name?: string | null;
    tennis_experience?: string | null;
    has_racket: boolean;
  } | null;
};

export default async function Events({ searchParams }: { searchParams: Promise<{ view?: string; deleted?: string; updated?: string; attendance_updated?: string; error?: string }> }) {
  const { view: requestedView, deleted, updated, attendance_updated, error } = await searchParams;
  const view = requestedView === "past" ? "past" : "upcoming";
  const now = new Date().toISOString();
  const query = db().from("events")
    .select("*,reservations(id,status,user:users(name,university,faculty,department,grade,line_display_name,tennis_experience,has_racket))");
  const { data } = view === "past"
    ? await query.lt("ends_at", now).order("starts_at", { ascending: false })
    : await query.gte("ends_at", now).order("starts_at", { ascending: true });

  return <section className="admin-page">
    <div className="page-title"><div><p className="eyebrow green">EVENTS</p><h1>イベント管理</h1><p>練習・イベントの作成と参加者確認ができます。</p></div></div>
    {deleted && <div className="success-message">イベントを削除しました。</div>}
    {updated && <div className="success-message">イベントの内容を変更しました。</div>}
    {attendance_updated && <div className="success-message">参加状況を更新しました。</div>}
    {error && <div className="alert">{error === "capacity" ? "定員は現在の予約人数より少なくできません。" : error === "update" || error === "create" ? "イベントを保存できませんでした。日時や入力内容をご確認ください。" : error === "document-type" ? "PDF形式のファイルを選択してください。" : error === "document-size" ? `PDFは${EVENT_DOCUMENT_MAX_LABEL}以下にしてください。` : error === "document-pending" ? "PDFのアップロード完了を待ってから保存してください。" : error?.startsWith("document-") ? "PDFを保存できませんでした。通信状態とSupabaseのStorage設定を確認して、もう一度お試しください。" : "イベントを削除できませんでした。もう一度お試しください。"}</div>}

    <details className="create-panel"><summary>＋ 新しい予定を作成</summary><form action={createEvent} className="grid-form"><FormFeedback /><label className="full">種別<select name="event_type" defaultValue="tennis"><option value="tennis">テニス</option><option value="event">イベント</option></select></label><label>タイトル<input name="title" required /></label><label>場所<input name="location" required /></label><label>開始日時<input type="datetime-local" name="starts_at" required /></label><label>終了日時<input type="datetime-local" name="ends_at" required /></label><label>定員<input type="number" name="capacity" min="1" required /></label><label className="full">説明<textarea name="description" /></label><EventDocumentUploadInput optional /><button className="primary full">予定を作成</button></form></details>

    <nav className="event-status-tabs" aria-label="イベントの表示切り替え">
      <Link className={view === "upcoming" ? "active" : ""} href="/admin/events?view=upcoming">開催予定</Link>
      <Link className={view === "past" ? "active" : ""} href="/admin/events?view=past">終了済み</Link>
    </nav>

    <div className="admin-cards">{data?.map((event) => {
      const active = (event.reservations as Reservation[]).filter((reservation) => reservation.status !== "cancelled");
      const reserved = active.filter((reservation) => reservation.status === "reserved");
      const rackets = reserved.filter((reservation) => !reservation.user?.has_racket).length;
      return <article className="admin-event" key={event.id}>
        <div><span className="event-chip">{eventDateLabel(event.starts_at, event.ends_at)}・{event.event_type === "tennis" ? "テニス" : "イベント"}</span><h3>{event.title}</h3><p>{event.location}・{tokyoTimeLabel(event.starts_at)}</p></div>
        <div className="admin-event-stats"><span><strong>{reserved.length}/{event.capacity}</strong><small>予約済み／定員</small></span><span><strong>{Math.max(event.capacity - reserved.length, 0)}</strong><small>残り枠</small></span>{event.event_type === "tennis" && <span><strong>{rackets}</strong><small>貸出ラケット</small></span>}<div className="admin-event-actions"><AdminEventEdit event={{ id: event.id, title: event.title, location: event.location, startsAt: toTokyoDatetimeLocal(event.starts_at), endsAt: toTokyoDatetimeLocal(event.ends_at), capacity: event.capacity, description: event.description ?? "", eventType: event.event_type }} /><form action={deleteEvent}><FormFeedback /><input type="hidden" name="event_id" value={event.id} /><ConfirmSubmitButton className="danger event-delete" message={`「${event.title}」を削除しますか？参加予約もすべて削除され、元に戻せません。`}>削除</ConfirmSubmitButton></form></div></div>
        <details><summary>参加者の属性を表示（{active.length}名）</summary>{active.length ? <ul className="attendance-list">{active.map((reservation) => {
          const person = reservation.user;
          return <li key={reservation.id}>
            <div className="attendance-person"><strong>{person?.name ?? "削除済みユーザー"}</strong><span>{reservation.status === "attended" ? "参加済み" : "予約中"}</span></div>
            <div className="attendance-attributes">
              <div><small>所属</small><span>{person?.university}・{person?.faculty}{visibleDepartment(person?.department) ? `・${visibleDepartment(person?.department)}` : ""}</span></div>
              <div><small>学年</small><span>{Number(person?.grade) >= 5 ? "4年以上" : `${person?.grade ?? "未登録"}年`}</span></div>
              <div><small>テニス経験</small><span>{person?.tennis_experience || "未記入"}</span></div>
              <div><small>LINE表示名</small><span>{person?.line_display_name || "未登録"}</span></div>
            </div>
          </li>;
        })}</ul> : <p className="attendance-empty">現在、参加予約者はいません。</p>}</details>
      </article>;
    })}{!data?.length && <p className="event-status-empty">{view === "past" ? "終了済みのイベントはありません。" : "開催予定のイベントはありません。"}</p>}</div>
  </section>;
}

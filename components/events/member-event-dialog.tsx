import { CalendarDays, Clock3, FileText, MapPin, UsersRound, X } from "lucide-react";
import { tokyoTimeLabel } from "@/lib/datetime";
import { PdfViewer } from "../pdf-viewer";
import { ReservationForm } from "../reservation-form";
import { eventDate, type MemberEventItem } from "./types";

type MemberEventDialogProps = {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  event?: MemberEventItem;
  onClose: () => void;
};

export function MemberEventDialog({ dialogRef, event, onClose }: MemberEventDialogProps) {
  return <dialog
    ref={dialogRef}
    className="event-detail-dialog"
    aria-label={event ? `${event.title}の詳細` : "イベント詳細"}
    onCancel={(cancelEvent) => {
      cancelEvent.preventDefault();
      onClose();
    }}
    onClick={(clickEvent) => {
      if (clickEvent.target === clickEvent.currentTarget) onClose();
    }}
  >
    {event && <article className="event-detail">
      <header className={`event-detail-hero ${event.eventType}`}>
        <div><span className="event-type-chip">{event.eventType === "tennis" ? "テニス" : "イベント"}</span><h2>{event.title}</h2></div>
        <button type="button" onClick={onClose} aria-label="イベント詳細を閉じる"><X /></button>
        <span className="event-court-lines" aria-hidden="true" />
      </header>
      <div className="event-detail-content">
        <dl className="event-detail-facts">
          <div><dt><CalendarDays />開催日</dt><dd>{eventDate(event).full}</dd></div>
          <div><dt><Clock3 />時間</dt><dd>{tokyoTimeLabel(event.startsAt)}–{tokyoTimeLabel(event.endsAt)}</dd></div>
          <div><dt><MapPin />場所</dt><dd>{event.location}</dd></div>
          <div><dt><UsersRound />予約状況</dt><dd>{event.reservedCount}/{event.capacity}名</dd></div>
        </dl>
        <section className="event-detail-description"><h3>イベントについて</h3><p>{event.description?.trim() || "詳細は管理者からの案内をご確認ください。"}</p></section>
        {event.document && <section className="event-detail-document"><div><FileText /><span><strong>案内資料</strong><small>{event.document.fileName}</small></span></div><PdfViewer title={event.title} fileName={event.document.fileName} url={event.document.url} /></section>}
      </div>
      <footer className="event-detail-actions">
        <div><small>{event.booked ? "現在このイベントを予約しています" : "内容を確認して参加予約へ進んでください"}</small><strong>{Math.max(event.capacity - event.reservedCount, 0) === 0 && !event.booked ? "満員です" : event.booked ? "予約済み" : `残り${Math.max(event.capacity - event.reservedCount, 0)}名`}</strong></div>
        <ReservationForm eventId={event.id} title={event.title} booked={event.booked} full={event.reservedCount >= event.capacity} />
      </footer>
    </article>}
  </dialog>;
}

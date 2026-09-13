import { ArrowUpRight, Clock3, MapPin } from "lucide-react";
import { tokyoTimeLabel } from "@/lib/datetime";
import { eventDate, type MemberEventItem } from "./types";

type MemberEventCardProps = {
  event: MemberEventItem;
  onOpen: (event: MemberEventItem) => void;
};

export function MemberEventCard({ event, onOpen }: MemberEventCardProps) {
  const date = eventDate(event);
  const remaining = Math.max(event.capacity - event.reservedCount, 0);

  return <button
    className="event-gallery-card"
    id={`event-${event.id}`}
    type="button"
    onClick={() => onOpen(event)}
    aria-haspopup="dialog"
  >
    <span className={`event-card-visual ${event.eventType}`}>
      <span className="event-type-chip">{event.eventType === "tennis" ? "テニス" : "イベント"}</span>
      <span className="event-card-date"><strong>{date.month}/{date.day}</strong><small>{date.weekday}</small></span>
      <span className="event-court-lines" aria-hidden="true" />
    </span>
    <span className="event-card-body">
      <strong>{event.title}</strong>
      <span><MapPin />{event.location}</span>
      <span><Clock3 />{tokyoTimeLabel(event.startsAt)}–{tokyoTimeLabel(event.endsAt)}</span>
    </span>
    <span className="event-card-footer">
      <small className={remaining === 0 ? "full" : ""}>{remaining === 0 ? "満員" : `残り${remaining}名`}</small>
      <span>{event.booked ? "予約済み" : "詳細を見る"}<ArrowUpRight /></span>
    </span>
  </button>;
}

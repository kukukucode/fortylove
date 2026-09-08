"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, Clock3, FileText, MapPin, UsersRound, X } from "lucide-react";
import { tokyoParts, tokyoTimeLabel } from "@/lib/datetime";
import { PdfViewer } from "./pdf-viewer";
import { ReservationForm } from "./reservation-form";

export type MemberEventItem = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  capacity: number;
  reservedCount: number;
  description?: string | null;
  eventType: "tennis" | "event";
  booked: boolean;
  document?: { url: string; fileName: string };
};

type EventFilter = "all" | MemberEventItem["eventType"];

function eventDate(event: MemberEventItem) {
  const start = tokyoParts(event.startsAt);
  const end = tokyoParts(event.endsAt);
  const sameDay = start.year === end.year && start.month === end.month && start.day === end.day;
  return {
    month: start.month,
    day: start.day,
    weekday: start.weekday,
    full: sameDay
      ? `${start.year}年${start.month}月${start.day}日（${start.weekday}）`
      : `${start.year}年${start.month}月${start.day}日（${start.weekday}）〜${end.month}月${end.day}日（${end.weekday}）`,
  };
}

export function MemberEventBrowser({ events }: { events: MemberEventItem[] }) {
  const [filter, setFilter] = useState<EventFilter>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selected = events.find((event) => event.id === selectedId);
  const visibleEvents = useMemo(() => filter === "all" ? events : events.filter((event) => event.eventType === filter), [events, filter]);

  useEffect(() => {
    function selectHashEvent() {
      const id = window.location.hash.startsWith("#event-") ? window.location.hash.slice(7) : "";
      if (events.some((event) => event.id === id)) setSelectedId(id);
    }
    selectHashEvent();
    window.addEventListener("hashchange", selectHashEvent);
    return () => window.removeEventListener("hashchange", selectHashEvent);
  }, [events]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  function openEvent(event: MemberEventItem) {
    window.history.replaceState(null, "", `#event-${event.id}`);
    setSelectedId(event.id);
  }

  function closeEvent() {
    setSelectedId(undefined);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  return <>
    <div className="event-filter" role="group" aria-label="イベントを絞り込む">
      {([
        ["all", "すべて"],
        ["tennis", "テニス"],
        ["event", "イベント"],
      ] as const).map(([value, label]) => <button type="button" className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{label}</button>)}
    </div>

    {visibleEvents.length ? <div className="event-gallery">
      {visibleEvents.map((event) => {
        const date = eventDate(event);
        const remaining = Math.max(event.capacity - event.reservedCount, 0);
        return <button className="event-gallery-card" id={`event-${event.id}`} type="button" onClick={() => openEvent(event)} aria-haspopup="dialog" key={event.id}>
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
      })}
    </div> : <div className="event-gallery-empty"><CalendarDays /><h2>該当するイベントはありません</h2><p>別の種別を選ぶか、新しい予定の公開をお待ちください。</p></div>}

    <dialog ref={dialogRef} className="event-detail-dialog" aria-label={selected ? `${selected.title}の詳細` : "イベント詳細"} onCancel={(event) => { event.preventDefault(); closeEvent(); }} onClick={(event) => { if (event.target === event.currentTarget) closeEvent(); }}>
      {selected && <article className="event-detail">
        <header className={`event-detail-hero ${selected.eventType}`}>
          <div><span className="event-type-chip">{selected.eventType === "tennis" ? "テニス" : "イベント"}</span><h2>{selected.title}</h2></div>
          <button type="button" onClick={closeEvent} aria-label="イベント詳細を閉じる"><X /></button>
          <span className="event-court-lines" aria-hidden="true" />
        </header>
        <div className="event-detail-content">
          <dl className="event-detail-facts">
            <div><dt><CalendarDays />開催日</dt><dd>{eventDate(selected).full}</dd></div>
            <div><dt><Clock3 />時間</dt><dd>{tokyoTimeLabel(selected.startsAt)}–{tokyoTimeLabel(selected.endsAt)}</dd></div>
            <div><dt><MapPin />場所</dt><dd>{selected.location}</dd></div>
            <div><dt><UsersRound />予約状況</dt><dd>{selected.reservedCount}/{selected.capacity}名</dd></div>
          </dl>
          <section className="event-detail-description"><h3>イベントについて</h3><p>{selected.description?.trim() || "詳細は管理者からの案内をご確認ください。"}</p></section>
          {selected.document && <section className="event-detail-document"><div><FileText /><span><strong>案内資料</strong><small>{selected.document.fileName}</small></span></div><PdfViewer title={selected.title} fileName={selected.document.fileName} url={selected.document.url} /></section>}
        </div>
        <footer className="event-detail-actions">
          <div><small>{selected.booked ? "現在このイベントを予約しています" : "内容を確認して参加予約へ進んでください"}</small><strong>{Math.max(selected.capacity - selected.reservedCount, 0) === 0 && !selected.booked ? "満員です" : selected.booked ? "予約済み" : `残り${Math.max(selected.capacity - selected.reservedCount, 0)}名`}</strong></div>
          <ReservationForm eventId={selected.id} title={selected.title} booked={selected.booked} full={selected.reservedCount >= selected.capacity} />
        </footer>
      </article>}
    </dialog>
  </>;
}

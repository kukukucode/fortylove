"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { MemberEventCard } from "./member-event-card";
import { MemberEventDialog } from "./member-event-dialog";
import type { EventFilter, MemberEventItem } from "./types";

export function MemberEventBrowser({ events }: { events: MemberEventItem[] }) {
  const [filter, setFilter] = useState<EventFilter>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selected = events.find((event) => event.id === selectedId);
  const visibleEvents = useMemo(
    () => filter === "all" ? events : events.filter((event) => event.eventType === filter),
    [events, filter],
  );

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
      ] as const).map(([value, label]) => <button
        type="button"
        className={filter === value ? "active" : ""}
        aria-pressed={filter === value}
        onClick={() => setFilter(value)}
        key={value}
      >{label}</button>)}
    </div>

    {visibleEvents.length
      ? <div className="event-gallery">
        {visibleEvents.map((event) => <MemberEventCard key={event.id} event={event} onOpen={openEvent} />)}
      </div>
      : <div className="event-gallery-empty"><CalendarDays /><h2>該当するイベントはありません</h2><p>別の種別を選ぶか、新しい予定の公開をお待ちください。</p></div>}

    <MemberEventDialog dialogRef={dialogRef} event={selected} onClose={closeEvent} />
  </>;
}

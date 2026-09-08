"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { eachTokyoDateKey, tokyoDateKey, tokyoParts, tokyoTimeLabel } from "@/lib/datetime";

type CalendarEvent = {
  id: string;
  title: string;
  location: string;
  starts_at: string;
  ends_at: string;
  event_type?: string | null;
};

type CalendarEntry = { event: CalendarEvent; timeLabel: string };
const utcDateKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
const monthFromEvent = (event?: CalendarEvent) => {
  const value = event ? tokyoParts(event.starts_at) : tokyoParts(new Date());
  return new Date(Date.UTC(value.year, value.month - 1, 1));
};

export function ParticipationCalendar({ events, focusEventId }: { events: CalendarEvent[]; focusEventId?: string }) {
  const focusedEvent = events.find((event) => event.id === focusEventId);
  const [month, setMonth] = useState(() => monthFromEvent(focusedEvent ?? events[0]));
  const previousEventIds = useRef(new Set(events.map((event) => event.id)));

  useEffect(() => {
    const focused = events.find((event) => event.id === focusEventId);
    if (focused) {
      setMonth(monthFromEvent(focused));
      previousEventIds.current = new Set(events.map((event) => event.id));
      return;
    }
    const added = events.find((event) => !previousEventIds.current.has(event.id));
    if (added) setMonth(monthFromEvent(added));
    previousEventIds.current = new Set(events.map((event) => event.id));
  }, [events, focusEventId]);

  const eventMap = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    events.forEach((event) => {
      const keys = eachTokyoDateKey(event.starts_at, event.ends_at);
      keys.forEach((key, index) => {
        const timeLabel = keys.length === 1
          ? tokyoTimeLabel(event.starts_at)
          : index === 0
            ? `開始 ${tokyoTimeLabel(event.starts_at)}`
            : index === keys.length - 1
              ? `終了 ${tokyoTimeLabel(event.ends_at)}`
              : "開催中";
        map.set(key, [...(map.get(key) ?? []), { event, timeLabel }]);
      });
    });
    return map;
  }, [events]);

  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((mondayOffset + lastDay.getUTCDate()) / 7) * 7 }, (_, index) => {
    const day = index - mondayOffset + 1;
    return day > 0 && day <= lastDay.getUTCDate() ? new Date(Date.UTC(year, monthIndex, day)) : null;
  });
  const todayKey = tokyoDateKey(new Date());

  return <section className="participation-calendar">
    <div className="calendar-heading"><div><p className="eyebrow green">MY SCHEDULE</p><h2>参加日程</h2></div><div className="calendar-controls"><button type="button" aria-label="前の月" onClick={() => setMonth(new Date(Date.UTC(year, monthIndex - 1, 1)))}><ChevronLeft /></button><strong>{year}年{monthIndex + 1}月</strong><button type="button" aria-label="次の月" onClick={() => setMonth(new Date(Date.UTC(year, monthIndex + 1, 1)))}><ChevronRight /></button></div></div>
    <div className="calendar-scroll"><div className="calendar-grid calendar-weekdays">{["月", "火", "水", "木", "金", "土", "日"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid calendar-days">{cells.map((date, index) => {
      const key = date ? utcDateKey(date) : "";
      const dayEvents = date ? eventMap.get(key) ?? [] : [];
      return <div className={`calendar-day${!date ? " empty-day" : ""}${key === todayKey ? " today" : ""}`} key={date?.toISOString() ?? `empty-${index}`}>
        {date && <><span className="calendar-date">{date.getUTCDate()}</span><div className="calendar-events">{dayEvents.map(({ event, timeLabel }) => <a href={`/events#event-${event.id}`} className={event.event_type === "tennis" ? "tennis-event" : "general-event"} key={event.id} title={`${event.title}｜${event.location}`}><time>{timeLabel}</time><span className="calendar-event-title">{event.title}</span><span className="calendar-event-location">{event.location}</span></a>)}</div></>}
      </div>;
    })}</div></div>
    {!events.length && <p className="calendar-empty">予約すると、ここに参加日程が表示されます。</p>}
  </section>;
}

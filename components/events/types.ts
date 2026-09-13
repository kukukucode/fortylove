import { tokyoParts } from "@/lib/datetime";

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

export type EventFilter = "all" | MemberEventItem["eventType"];

export function eventDate(event: MemberEventItem) {
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

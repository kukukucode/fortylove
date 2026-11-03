const DAY = 86_400_000;
const JST = 9 * 3_600_000;

export function eventQuery(question: string, timestamp = Date.now()) {
  const q = question.normalize("NFKC");
  const now = new Date(timestamp + JST);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - JST;
  const date = q.match(/(?:(\d{4})年)?(\d{1,2})月(?:(\d{1,2})日)?/);
  const dayOnly = !date ? q.match(/(?:^|\D)(\d{1,2})日/) : null;
  let start: number | undefined, end: number | undefined;
  let invalid = false;
  if (date || /今月|来月/.test(q) || dayOnly) {
    const year = date?.[1] ? Number(date[1]) : now.getUTCFullYear();
    const month = date ? Number(date[2]) - 1 : now.getUTCMonth() + Number(q.includes("来月"));
    const day = date?.[3] ? Number(date[3]) : dayOnly ? Number(dayOnly[1]) : undefined;
    start = Date.UTC(year, month, day ?? 1) - JST;
    end = day ? start + DAY : Date.UTC(year, month + 1, 1) - JST;
    const resolved = new Date(start + JST);
    invalid =
      Boolean(date && (month < 0 || month > 11)) ||
      Boolean(day !== undefined && (day < 1 || resolved.getUTCDate() !== day));
  } else if (/今日|明日|明後日/.test(q)) {
    const offset = q.includes("明後日") ? 2 : q.includes("明日") ? 1 : 0;
    start = today + offset * DAY;
    end = start + DAY;
  } else if (/今週|来週/.test(q)) {
    start = today - ((now.getUTCDay() + 6) % 7) * DAY + (q.includes("来週") ? 7 * DAY : 0);
    end = start + 7 * DAY;
  }
  const weekday = q.match(/([月火水木金土日])曜/)?.[1];
  const named = q.match(
    /(?:^|[\s、「『])([^\s、。？?「」『』]*?(?:イベント|練習会|合宿|大会|飲み会|食事会))/,
  )?.[1];
  const specific = named?.replace(
    /^(?:(?:次|次回|直近|今月|来月|今週|来週|今日|明日|明後日|今年|来年)の|(?:\d{4}年)?\d{1,2}月(?:\d{1,2}日)?の?)+/,
    "",
  );
  const title =
    q.match(/[「『](.+?)[」』]/)?.[1] ??
    (specific && !["イベント", "練習会", "テニス練習会"].includes(specific)
      ? specific
      : undefined) ??
    (q.includes("新歓") ? "新歓" : undefined);
  const location = q.match(/(?:^|[\s、])([^\s、「」]+?)(?:で開催|での|にある)/)?.[1];
  const eventType = /練習|テニス会/.test(q) ? "tennis" : /交流/.test(q) ? "event" : undefined;
  const list =
    /一覧|全部|予定を/.test(q) || Boolean(start !== undefined && !/場所|どこ|空席|空き/.test(q));
  return {
    start,
    end,
    invalid,
    title,
    location,
    eventType,
    list,
    weekday: weekday ? "日月火水木金土".indexOf(weekday) : undefined,
    next: /次の|次回|直近/.test(q),
  };
}

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

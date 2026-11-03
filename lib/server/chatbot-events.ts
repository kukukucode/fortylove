import { db } from "@/lib/db";
import { formatEventAnswer, type ChatbotEvent } from "@/lib/chatbot";
import { eventQuery, escapeLike } from "@/lib/chatbot-event-query";

export async function answerEvents(question: string) {
  const filter = eventQuery(question);
  if (filter.invalid) return "日付を確認してください。何月何日のイベントについて知りたいですか？";
  if (
    (!filter.title && /限定|以外|除く|中止|変更|雨|女性|男性|女子|男子|初心者/.test(question)) ||
    /\d[/-]\d/.test(question)
  ) {
    return "イベント名を「」で囲み、日付は何年何月何日の形式で指定してください。条件が不明なまま別の予定は案内しません。";
  }
  let query = db()
    .from("events")
    .select("id,title,starts_at,ends_at,location,capacity,description,reservations(status)")
    .gte("ends_at", new Date().toISOString());
  if (filter.start !== undefined)
    query = query.gte("starts_at", new Date(filter.start).toISOString());
  if (filter.end !== undefined) query = query.lt("starts_at", new Date(filter.end).toISOString());
  if (filter.title) query = query.ilike("title", `%${escapeLike(filter.title)}%`);
  if (filter.location) query = query.ilike("location", `%${escapeLike(filter.location)}%`);
  if (filter.eventType) query = query.eq("event_type", filter.eventType);
  // Do not guess at weekday/time restrictions we cannot completely query.
  if (filter.weekday !== undefined || /午前|午後|夜|\d{1,2}時/.test(question)) {
    return "開催日を年月日で指定してください。時間帯はイベント画面でも確認できます。";
  }
  const { data, error } = await query.order("starts_at").order("id").limit(11);
  if (error) throw new Error("イベントを取得できませんでした。");
  const matches = (data ?? []) as ChatbotEvent[];
  if (!matches.length)
    return "指定した条件に合う開催予定は現在登録されていません。別の予定への置き換えはせず、運営スタッフへお問い合わせください。";
  if (!filter.next && !filter.list && matches.length > 1) {
    return `候補が複数あります。イベント名を「」で囲むか、日付を指定してください。\n${matches
      .slice(0, 3)
      .map((event) => `・${event.title}`)
      .join("\n")}`;
  }
  return (
    matches
      .slice(0, filter.list ? 10 : 1)
      .map((event) => formatEventAnswer(question, event))
      .join("\n\n") +
    (filter.list && matches.length > 10 ? "\n\n続きはイベント画面で確認できます。" : "")
  );
}

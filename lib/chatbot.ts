export type ChatbotKnowledge = {
  id: string;
  title: string;
  content: string;
  category: string;
  keywords: string[];
  priority: number;
  is_active: boolean;
  source_name?: string | null;
};

export type ChatbotEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  capacity: number;
  description: string | null;
  reservations?: { status: string }[];
};

export function normalizeChatText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/[\s\p{P}\p{S}]/gu, "");
}

function bigrams(value: string) {
  const normalized = normalizeChatText(value);
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
}

function diceSimilarity(left: string, right: string) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

export type RankedKnowledge = {
  record: ChatbotKnowledge;
  score: number;
  semantic: number;
  keywordHits: number;
  similarity: number;
};

export type KnowledgeDecision =
  | { kind: "none" }
  | { kind: "direct"; record: ChatbotKnowledge }
  | { kind: "choices"; records: ChatbotKnowledge[] }
  | { kind: "synthesize"; records: ChatbotKnowledge[] };

export const KNOWLEDGE_THRESHOLDS = { medium: 0.38, high: 0.82, semanticMedium: 0.68, semanticHigh: 0.88 };

export function rankKnowledgeAnswers(question: string, records: ChatbotKnowledge[], semanticScores: Record<string, number> = {}): RankedKnowledge[] {
  const normalized = normalizeChatText(question);
  return records.map((record) => {
    const keywordHits = record.keywords.filter((word) => normalizeChatText(word).length >= 2 && normalized.includes(normalizeChatText(word))).length;
    const similarity = diceSimilarity(question, record.title);
    const semantic = semanticScores[record.id] ?? 0;
    const exact = normalized === normalizeChatText(record.title);
    // One common word is a candidate, never sufficient evidence for a direct answer.
    const lexical = exact ? 1 : Math.min(0.95, Math.max(keywordHits ? 0.42 : 0, similarity * 0.65 + Math.min(keywordHits, 2) * 0.2));
    const score = Math.max(lexical, semantic >= KNOWLEDGE_THRESHOLDS.semanticMedium ? semantic : 0);
    return { record, score, keywordHits, similarity, semantic };
  }).filter((item) => item.score >= KNOWLEDGE_THRESHOLDS.medium)
    .sort((left, right) => right.score - left.score);
}

export function decideKnowledgeResponse(question: string, records: ChatbotKnowledge[], semanticScores: Record<string, number> = {}): KnowledgeDecision {
  const seen = new Set<string>();
  const ranked = rankKnowledgeAnswers(question, records, semanticScores).filter(({ record }) => {
    const key = record.content.normalize("NFKC").replace(/\s+/g," ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const best = ranked[0];
  if (!best) return { kind: "none" };
  if (normalizeChatText(question) === normalizeChatText(best.record.title)) return { kind: "direct", record: best.record };
  const close = ranked.filter((item) => best.score - item.score < 0.08);
  const multiple = ranked.length > 1 && /(?:、|と|も|けど|ながら|それに|さらに|両方)/.test(question);
  const high = best.semantic >= KNOWLEDGE_THRESHOLDS.semanticHigh || best.score >= KNOWLEDGE_THRESHOLDS.high;
  if (high && close.length === 1 && !multiple) return { kind: "direct", record: best.record };
  if (close.length > 1 && !multiple) return { kind: "choices", records: close.slice(0, 3).map((item) => item.record) };
  return { kind: "synthesize", records: ranked.slice(0, 3).map((item) => item.record) };
}

export function findKnowledgeAnswer(question: string, records: ChatbotKnowledge[]) {
  const decision = decideKnowledgeResponse(question, records);
  return decision.kind === "direct" ? decision.record : null;
}

const eventSubjectWords = ["新歓", "イベント", "練習", "予定"];
const eventDetailWords = ["開催", "次回", "次の", "いつ", "何時", "日程", "どこ", "場所", "空き", "空席", "定員", "入れる", "一覧", "今月", "来月", "月の"];

export function isEventQuestion(question: string) {
  const normalized = normalizeChatText(question);
  const asksRecruitingPeriod = ["いつまで", "募集期間", "受付期間", "新歓期間"]
    .some((word) => normalized.includes(normalizeChatText(word)));
  if (asksRecruitingPeriod) return false;
  const hasSubject = eventSubjectWords.some((word) => normalized.includes(normalizeChatText(word)));
  const hasDetail = eventDetailWords.some((word) => normalized.includes(normalizeChatText(word))) || /\d{1,2}月/.test(normalized);
  return hasDetail && (hasSubject || ["空き", "空席", "定員", "入れる"].some((word) => normalized.includes(normalizeChatText(word))));
}

export function formatEventAnswer(question: string, event: ChatbotEvent) {
  const reserved = event.reservations?.filter((reservation) => reservation.status === "reserved").length ?? 0;
  const seats = Math.max(0, event.capacity - reserved);
  const startsAt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(event.starts_at));
  const normalized = normalizeChatText(question);
  if (["空き", "空席", "定員", "入れる"].some((word) => normalized.includes(normalizeChatText(word)))) {
    return `${event.title}は、回答時点であと${seats}名分の空きがあります。参加枠は予約時に改めて確定します。`;
  }
  if (["どこ", "場所"].some((word) => normalized.includes(normalizeChatText(word)))) {
    return `${event.title}は${event.location}で開催します。開始は${startsAt}です。`;
  }
  return `次の予定は「${event.title}」です。${startsAt}から、${event.location}で開催します。${event.description ? `内容は「${event.description}」です。` : ""}`;
}

// General answers are limited to clearly general topics. Club-specific decisions are never inferred.
export function allowsGeneralAnswer(question: string) {
  const q = normalizeChatText(question);
  if (/fortylove|フォーティ|このサークル|そちら|会費|参加費|料金|入会|参加条件|日程|退会|連絡先|個人情報|受付|新歓|予約|規則|ルール変更/.test(q)) return false;
  return /テニスのルール|テニスの得点|ラケットの選び方|テニスの持ち物|テニス用語|サーブの練習|フォアハンド|バックハンド|勉強と部活の両立/.test(q);
}

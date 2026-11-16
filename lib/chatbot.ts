export type ChatbotKnowledge = {
  id: string;
  title: string;
  content: string;
  category: string;
  keywords: string[];
  priority: number;
  is_active: boolean;
  source_name?: string | null;
  source_kind?: "faq" | "markdown";
  source_section?: string | null;
  document_id?: string | null;
  source_version?: number | null;
  updated_at?: string;
  lexical_score?: number;
  semantic_score?: number;
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
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function bigrams(value: string) {
  const normalized = normalizeChatText(value);
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  return new Set(
    Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)),
  );
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

export const KNOWLEDGE_THRESHOLDS = {
  medium: 0.38,
  high: 0.82,
  semanticMedium: 0.68,
  semanticHigh: 0.88,
};

export function rankKnowledgeAnswers(
  question: string,
  records: ChatbotKnowledge[],
  semanticScores: Record<string, number> = {},
): RankedKnowledge[] {
  const normalized = normalizeChatText(question);
  // Same-topic FAQ is authoritative; otherwise prefer the newest revision.
  const topics = new Map<string, ChatbotKnowledge>();
  for (const record of records.filter((item) => item.is_active)) {
    const key = normalizeChatText(record.title);
    const previous = topics.get(key);
    if (
      !previous ||
      (record.source_kind === "faq" && previous.source_kind !== "faq") ||
      (record.source_kind === previous.source_kind &&
        (record.updated_at ?? "") > (previous.updated_at ?? ""))
    )
      topics.set(key, record);
  }
  const candidates = [...topics.values()]
    .map((record) => {
      const keywordHits = record.keywords.filter(
        (word) =>
          normalizeChatText(word).length >= 2 && normalized.includes(normalizeChatText(word)),
      ).length;
      const similarity = diceSimilarity(question, record.title);
      const semantic = semanticScores[record.id] ?? record.semantic_score ?? 0;
      const exact = normalized === normalizeChatText(record.title);
      // One common word is a candidate, never sufficient evidence for a direct answer.
      const lexical =
        record.lexical_score ??
        (exact
          ? 1
          : Math.min(
              0.95,
              Math.max(keywordHits ? 0.42 : 0, similarity * 0.65 + Math.min(keywordHits, 2) * 0.2),
            ));
      const score = Math.max(
        lexical,
        semantic >= KNOWLEDGE_THRESHOLDS.semanticMedium ? semantic : 0,
      );
      return { record, score, keywordHits, similarity, semantic, lexical };
    })
    .filter((item) => item.score >= KNOWLEDGE_THRESHOLDS.medium);
  const tie = (a: (typeof candidates)[number], b: (typeof candidates)[number]) =>
    b.record.priority - a.record.priority ||
    (b.record.updated_at ?? "").localeCompare(a.record.updated_at ?? "") ||
    a.record.id.localeCompare(b.record.id);
  const lexical = [...candidates]
    .filter((item) => item.lexical >= KNOWLEDGE_THRESHOLDS.medium)
    .sort((a, b) => b.lexical - a.lexical || tie(a, b));
  const semantic = [...candidates]
    .filter((item) => item.semantic >= KNOWLEDGE_THRESHOLDS.semanticMedium)
    .sort((a, b) => b.semantic - a.semantic || tie(a, b));
  const fused = (item: (typeof candidates)[number]) =>
    [lexical, semantic].reduce((sum, list) => {
      const rank = list.indexOf(item);
      return sum + (rank < 0 ? 0 : 1 / (60 + rank + 1));
    }, 0);
  return candidates.sort(
    (a, b) =>
      Number(normalized === normalizeChatText(b.record.title)) -
        Number(normalized === normalizeChatText(a.record.title)) ||
      fused(b) - fused(a) ||
      b.record.priority - a.record.priority ||
      a.record.id.localeCompare(b.record.id),
  );
}

export function decideKnowledgeResponse(
  question: string,
  records: ChatbotKnowledge[],
  semanticScores: Record<string, number> = {},
): KnowledgeDecision {
  const seen = new Set<string>();
  const ranked = rankKnowledgeAnswers(question, records, semanticScores).filter(({ record }) => {
    const key = record.content.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const best = ranked[0];
  if (!best) return { kind: "none" };
  if (normalizeChatText(question) === normalizeChatText(best.record.title))
    return { kind: "direct", record: best.record };
  const close = ranked.filter((item) => Math.abs(best.score - item.score) < 0.08);
  const multiple =
    ranked.length > 1 && /(?:、|と|も|けど|ながら|それに|さらに|両方)/.test(question);
  // Similarity establishes relevance, never that a passage answers the question.
  // Only exact FAQ/section matches (or an explicitly selected candidate) bypass grounding.
  if (close.length > 1 && !multiple)
    return { kind: "choices", records: close.slice(0, 3).map((item) => item.record) };
  return { kind: "synthesize", records: ranked.slice(0, 3).map((item) => item.record) };
}

export function knowledgeSource(record: ChatbotKnowledge) {
  return `${record.source_kind === "faq" ? "公開FAQ" : (record.source_name ?? "Markdown")}${record.source_version ? ` / v${record.source_version}` : ""} / ${record.source_section ?? record.title}`;
}

export function knowledgeCitation(record: ChatbotKnowledge) {
  return {
    id: record.id,
    documentId: record.document_id ?? null,
    version: record.source_version ?? null,
    section: record.source_section ?? record.title,
    sourceName: record.source_name ?? null,
    kind: record.source_kind ?? "markdown",
  };
}

// History is untrusted search context, never authorization or authoritative evidence.
export function contextualizeQuestion(question: string, history: string[] = []) {
  const follows = (value: string) =>
    /^(それ|その|こちら|そこ|では|じゃあ|あと|ちなみに)|^(場所|日時|何時|いつ|費用|持ち物|空席|料金)(は|も|について|[？?])/.test(
      value.trim(),
    );
  if (!follows(question)) return question;
  const recent = history.slice(-4).filter((item) => item.trim());
  const anchor = recent.findLastIndex((item) => !follows(item));
  const context = recent
    .slice(anchor < 0 ? -1 : anchor)
    .map((item) => item.slice(0, 500))
    .join("\n");
  return context ? `${context}\n追加の質問: ${question}` : question;
}

export function findKnowledgeAnswer(question: string, records: ChatbotKnowledge[]) {
  const decision = decideKnowledgeResponse(question, records);
  return decision.kind === "direct" ? decision.record : null;
}

const eventSubjectWords = ["新歓", "イベント", "練習", "予定", "合宿", "大会", "交流会"];
const eventDetailWords = [
  "開催",
  "次回",
  "次の",
  "いつ",
  "何時",
  "日程",
  "どこ",
  "場所",
  "空き",
  "空席",
  "定員",
  "入れる",
  "一覧",
  "今月",
  "来月",
  "月の",
  "今週",
  "来週",
  "今日",
  "明日",
  "明後日",
];

export function isEventQuestion(question: string) {
  const normalized = normalizeChatText(question);
  const asksRecruitingPeriod = ["いつまで", "募集期間", "受付期間", "新歓期間"].some((word) =>
    normalized.includes(normalizeChatText(word)),
  );
  if (asksRecruitingPeriod) return false;
  const hasSubject = eventSubjectWords.some((word) => normalized.includes(normalizeChatText(word)));
  const hasDetail =
    eventDetailWords.some((word) => normalized.includes(normalizeChatText(word))) ||
    /\d{1,2}月/.test(normalized);
  return (
    hasDetail &&
    (hasSubject ||
      /[「『].+[」』]/.test(question) ||
      ["空き", "空席", "定員", "入れる"].some((word) =>
        normalized.includes(normalizeChatText(word)),
      ))
  );
}

export function formatEventAnswer(question: string, event: ChatbotEvent) {
  const reserved =
    event.reservations?.filter((reservation) => reservation.status === "reserved").length ?? 0;
  const seats = Math.max(0, event.capacity - reserved);
  const startsAt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(event.starts_at));
  const normalized = normalizeChatText(question);
  if (
    ["空き", "空席", "定員", "入れる"].some((word) => normalized.includes(normalizeChatText(word)))
  ) {
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
  if (
    /fortylove|フォーティ|このサークル|そちら|会費|参加費|料金|入会|参加条件|日程|退会|連絡先|個人情報|受付|新歓|予約|規則|ルール変更/.test(
      q,
    )
  )
    return false;
  return /テニスのルール|テニスの得点|ラケットの選び方|テニスの持ち物|テニス用語|サーブの練習|フォアハンド|バックハンド|勉強と部活の両立/.test(
    q,
  );
}

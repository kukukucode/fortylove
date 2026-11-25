import type { ChatbotKnowledge } from "./chatbot";

const segmenter = new Intl.Segmenter("ja", { granularity: "word" });

// These words can support a match but do not identify a topic on their own.
const broadTerms = new Set([
  "サークル", "テニス", "新歓", "練習", "イベント", "参加", "入会", "初心者", "経験者",
  "学生", "ラケット", "費用", "お金", "いくら", "どこ", "いつ", "何時", "何回", "どんな",
  "どう", "どれくらい",
]);
const broadLookupTerms = new Set([
  ...broadTerms, "場所", "時間", "日程", "頻度", "持ち物", "料金", "連絡先",
]);

export function normalizeChatbotLookupText(text: string) {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .trim()
    .replace(/^(?:(?:この)?サークル|fortylove|フォーティーラブ)の\s*/u, "")
    .replace(/入会金/g, "入会費")
    .replace(/借り(?:られ|れ)?(?:ます|る|たい)|貸出し?|レンタル/g, "貸し出し");
}

export function findChatbotKeywordAnswer(question: string, records: ChatbotKnowledge[]) {
  const lookup = normalizeChatbotLookupText(question)
    .replace(/[?!。]+$/u, "")
    .replace(/(?:を教えて(?:ください)?|について(?:教えて(?:ください)?|知りたい)?|とは)$/u, "")
    .trim();
  const costQuestion = lookup.match(/^(.+(?:費|代|料金|価格|金|予算))は?いくら(?:ですか|でしょうか)?$/u);
  const key = costQuestion?.[1] ?? lookup;
  if (key.length < 2 || broadLookupTerms.has(key)) return null;

  const matches = records.filter((record) => {
    const heading = normalizeChatbotLookupText(record.title);
    return (
      record.keywords.some((keyword) => normalizeChatbotLookupText(keyword) === key) ||
      (heading.startsWith(key) && /^(?:は|について)/u.test(heading.slice(key.length)))
    );
  });
  const entry = matches[0];
  return entry && matches.every((record) => record.content === entry.content) ? entry : null;
}

export function matchChatbotTopics(question: string, records: ChatbotKnowledge[]) {
  const text = normalizeChatbotLookupText(question);
  const words = [...segmenter.segment(text)].filter((word) => word.isWordLike);
  const starts = new Set(words.map((word) => word.index));
  const ends = new Set(words.map((word) => word.index + word.segment.length));
  const occurrences = records.flatMap((record) => {
    const headingTerms = [...segmenter.segment(normalizeChatbotLookupText(record.title))]
      .filter((word) => word.isWordLike && /[\p{Script=Han}\p{Script=Katakana}a-z\d]/u.test(word.segment))
      .map((word) => word.segment);
    const terms = new Set([...record.keywords.map(normalizeChatbotLookupText), ...headingTerms]);
    return [...terms].filter((term) => term.length >= 2 || /^\p{Script=Han}$/u.test(term)).flatMap((term) => {
      const matches = [];
      for (let start = text.indexOf(term); start !== -1; start = text.indexOf(term, start + 1)) {
        const end = start + term.length;
        if (starts.has(start) && ends.has(end)) matches.push({ record, term, start, end });
      }
      return matches;
    });
  });
  // Keep the longest match at each span, e.g. 参加費 over 参加 within that compound.
  const matchedTerms = new Map<ChatbotKnowledge, Set<string>>();
  let widestStart = -1;
  let widestEnd = -1;
  occurrences.sort((a, b) => a.start - b.start || b.end - a.end);
  for (const { record, term, start, end } of occurrences) {
    if (end > widestEnd) {
      widestStart = start;
      widestEnd = end;
    }
    if (start !== widestStart || end !== widestEnd) continue;
    const terms = matchedTerms.get(record) ?? new Set<string>();
    terms.add(term);
    matchedTerms.set(record, terms);
  }

  const supported = records
    .map((record) => ({ record, terms: matchedTerms.get(record) ?? new Set<string>() }))
    .filter(({ terms }) => [...terms].some((term) => !broadTerms.has(term)));

  // Drop shorter matches to a topic while preserving other topics asked in the same question.
  const distinct = supported
    .filter(({ terms }) => !supported.some(({ terms: other }) =>
      other.size > terms.size && [...terms].every((term) => other.has(term)),
    ));
  const covered = new Set<string>();
  const ranked: ChatbotKnowledge[] = [];
  while (distinct.length) {
    // Preserve the incoming rank on ties while favoring an uncovered topic.
    let best = 0;
    let bestCoverage = -1;
    distinct.forEach(({ terms }, index) => {
      const coverage = [...terms].filter((term) => !broadTerms.has(term) && !covered.has(term)).length;
      if (coverage > bestCoverage) {
        best = index;
        bestCoverage = coverage;
      }
    });
    const [{ record, terms }] = distinct.splice(best, 1);
    ranked.push(record);
    for (const term of terms) covered.add(term);
  }
  return ranked;
}

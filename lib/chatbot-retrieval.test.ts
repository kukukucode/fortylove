import { describe, expect, it } from "vitest";
import {
  contextualizeQuestion,
  decideKnowledgeResponse,
  rankKnowledgeAnswers,
  type ChatbotKnowledge,
} from "./chatbot";
import { eventQuery } from "./chatbot-event-query";

const record = (
  id: string,
  title: string,
  extra: Partial<ChatbotKnowledge> = {},
): ChatbotKnowledge => ({
  id,
  title,
  content: `${title}の説明`,
  category: "案内",
  keywords: [],
  priority: 0,
  is_active: true,
  source_kind: "markdown",
  ...extra,
});

describe("根拠付き検索の回帰セット", () => {
  const records = [
    record("fee", "会費はいくらですか", { content: "年会費は3000円です。", source_kind: "faq" }),
    record("old-fee", "会費はいくらですか", {
      content: "年会費は2000円です。",
      updated_at: "2030-01-01",
    }),
    record("beginner", "初心者でも参加できますか", { keywords: ["初心者"] }),
    record("disabled", "管理者の秘密", { is_active: false }),
  ];
  it.each([
    ["会費はいくらですか", "direct", "fee"],
    ["初心者でも参加できますか", "direct", "beginner"],
    ["初心者に道具は必要ですか", "synthesize", "beginner"],
    ["学食の営業時間", "none", null],
    ["管理者の秘密", "none", null],
  ])("%s", (question, kind, expected) => {
    const result = decideKnowledgeResponse(question, records);
    expect(result.kind).toBe(kind);
    if (result.kind === "direct") expect(result.record.id).toBe(expected);
    if (result.kind === "synthesize") expect(result.records[0].id).toBe(expected);
  });
  it("高い類似度があっても資料にない条件を直接回答しない", () => {
    expect(
      decideKnowledgeResponse("会費は分割払いできますか", records, { fee: 0.99 }).kind,
    ).not.toBe("direct");
  });
  it("両方の検索で支持された候補をRRFで優先する", () => {
    const ranked = rankKnowledgeAnswers("参加について", [
      record("lexical", "A", { lexical_score: 0.9 }),
      record("both", "B", { lexical_score: 0.7, semantic_score: 0.8 }),
      record("semantic", "C", { lexical_score: 0, semantic_score: 0.99 }),
    ]);
    expect(ranked[0].record.id).toBe("both");
  });
  it("同じ質問のFAQを優先し古いMarkdownを根拠に混ぜない", () => {
    expect(
      rankKnowledgeAnswers("会費はいくらですか", records).map((item) => item.record.id),
    ).not.toContain("old-fee");
  });
  it("文脈は追加質問だけに付け、別の話題へ引きずらない", () => {
    expect(contextualizeQuestion("それはどこですか", ["次の練習はいつ"])).toContain(
      "次の練習はいつ",
    );
    expect(contextualizeQuestion("会費はいくらですか", ["次の練習はいつ"])).toBe(
      "会費はいくらですか",
    );
  });
});

describe("イベント条件", () => {
  const now = Date.parse("2026-12-31T15:30:00Z"); // January 1 JST
  it("日本時間で明日・月日・来月を絞る", () => {
    expect(new Date(eventQuery("明日の練習", now).start!).toISOString()).toBe(
      "2027-01-01T15:00:00.000Z",
    );
    expect(new Date(eventQuery("来月のイベント", now).start!).toISOString()).toBe(
      "2027-01-31T15:00:00.000Z",
    );
    const day = eventQuery("2027年2月5日の練習", now);
    expect(day.end! - day.start!).toBe(86400000);
    expect(day.eventType).toBe("tennis");
  });
  it("不正日付と指定名称を無視しない", () => {
    expect(eventQuery("2月31日のイベント", now).invalid).toBe(true);
    expect(eventQuery("13月の練習", now).invalid).toBe(true);
    expect(eventQuery("「夏合宿」の場所", now).title).toBe("夏合宿");
    expect(eventQuery("次の交流イベント", now).eventType).toBe("event");
    expect(eventQuery("次の夏合宿はいつ", now).title).toBe("夏合宿");
    expect(eventQuery("次のBBQイベントはいつ", now).title).toBe("BBQイベント");
    expect(eventQuery("今月の新歓はどこ", now).title).toBe("新歓");
  });
});

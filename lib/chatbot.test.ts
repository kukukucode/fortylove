import { describe, expect, it } from "vitest";
import { decideKnowledgeResponse, findKnowledgeAnswer, formatEventAnswer, isEventQuestion, normalizeChatText } from "./chatbot";

const knowledge = [{
  id: "1", title: "初心者の参加", category: "参加条件", content: "初心者も歓迎しています。", keywords: ["初心者", "未経験", "テニス初めて"], priority: 10, is_active: true,
}];

describe("chatbot matching", () => {
  it("表記ゆれを正規化する", () => expect(normalizeChatText("テニス、 初心者！")).toBe("テニス初心者"));
  it("単一キーワードは候補にするが直接回答しない", () => expect(decideKnowledgeResponse("テニス未経験でも大丈夫？", knowledge).kind).toBe("synthesize"));
  it("旧回答単位の状態に関係なくMarkdown知識を使う", () => expect(findKnowledgeAnswer("初心者の参加", [{ ...knowledge[0], is_active: false }])?.id).toBe("1"));
  it("無関係な質問には回答しない", () => expect(findKnowledgeAnswer("会計担当者の電話番号は？", knowledge)).toBeNull());
  it("イベント質問を識別する", () => expect(isEventQuestion("次の新歓はいつ？")).toBe(true));
  it("新歓の募集期間はイベント日程よりFAQを優先する", () => expect(isEventQuestion("新歓はいつまでですか？")).toBe(false));
  it("参加条件の質問をイベント質問と誤判定しない", () => expect(isEventQuestion("新歓は初心者でも参加できますか？")).toBe(false));
  it("近い回答が複数ある曖昧な質問は最大3件の選択肢にする", () => {
    const records = [
      { ...knowledge[0], id: "fee", title: "会費", content: "会費の回答", keywords: ["費用"] },
      { ...knowledge[0], id: "annual", title: "年間費用", content: "年間費用の回答", keywords: ["費用"] },
      { ...knowledge[0], id: "event-fee", title: "イベント費", content: "イベント費の回答", keywords: ["費用"] },
    ];
    const decision = decideKnowledgeResponse("費用について知りたい", records);
    expect(decision.kind).toBe("choices");
    if (decision.kind === "choices") expect(decision.records).toHaveLength(3);
  });
  it("複数の関心を含む質問はGemini統合対象にする", () => {
    const records = [
      { ...knowledge[0], id: "beginner", title: "初心者", keywords: ["初心者"] },
      { ...knowledge[0], id: "work", title: "バイトとの両立", keywords: ["バイト"] },
      { ...knowledge[0], id: "frequency", title: "参加頻度", keywords: ["毎回参加"] },
    ];
    expect(decideKnowledgeResponse("初心者なんだけど、バイトも忙しくて毎回参加できない", records).kind).toBe("synthesize");
  });
  it("候補タイトルを選び直した場合はその回答を確定する", () => {
    const records = [
      { ...knowledge[0], id: "fee", title: "会費", keywords: ["費用"] },
      { ...knowledge[0], id: "annual", title: "年間費用", keywords: ["費用"] },
    ];
    expect(decideKnowledgeResponse("年間費用", records)).toMatchObject({ kind: "direct", record: { id: "annual" } });
  });
  it("空席数には回答時点である旨を含める", () => {
    const answer = formatEventAnswer("まだ空きある？", { id: "e", title: "新歓練習", starts_at: "2026-09-10T06:00:00Z", ends_at: "2026-09-10T08:00:00Z", location: "早稲田コート", capacity: 10, description: null, reservations: [{ status: "reserved" }, { status: "cancelled" }] });
    expect(answer).toContain("あと9名");
    expect(answer).toContain("回答時点");
  });
});

it("意味が高一致の一意な回答は直接返す", () => {
  expect(decideKnowledgeResponse("ラケットを握ったことがなくても大丈夫？", knowledge, { "1": 0.94 }).kind).toBe("direct");
});
it("中一致は生成対象、意味が低一致なら候補にしない", () => {
  expect(decideKnowledgeResponse("初参加について", knowledge, { "1": 0.75 }).kind).toBe("synthesize");
  expect(decideKnowledgeResponse("学食の営業時間", knowledge, { "1": 0.4 }).kind).toBe("none");
});
it("FAQとMarkdownの同一回答を重複させない", () => {
  const result = decideKnowledgeResponse("未経験です", [knowledge[0], { ...knowledge[0], id: "duplicate" }]);
  if (result.kind !== "synthesize") throw new Error("expected synthesis");
  expect(result.records).toHaveLength(1);
});

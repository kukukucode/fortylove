import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  db: vi.fn(),
  read: vi.fn(),
  embed: vi.fn(),
  generate: vi.fn(),
  events: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/server/knowledge-data", () => ({ readKnowledge: mocks.read }));
vi.mock("@/lib/embeddings", () => ({ embedTexts: mocks.embed }));
vi.mock("@/lib/gemini-chatbot", () => ({ generateGroundedAnswer: mocks.generate }));
vi.mock("@/lib/server/chatbot-events", () => ({ answerEvents: mocks.events }));
import { POST } from "./route";
import { issueGeneralTicket } from "@/lib/server/general-answer-ticket";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET", "test-only-secret");
  mocks.session.mockResolvedValue({ id: "member-1", role: "member" });
  mocks.db.mockReturnValue({
    rpc: mocks.rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { role: "member" } }),
          maybeSingle: async () => ({
            data:
              table === "app_settings"
                ? {
                    chatbot_member_enabled: true,
                    chatbot_member_sources: ["member.md"],
                    chatbot_admin_sources: ["private.md"],
                  }
                : null,
          }),
        }),
      }),
    }),
  });
  mocks.rpc.mockResolvedValue({ data: true });
  mocks.read.mockResolvedValue([]);
  mocks.embed.mockRejectedValue(new Error("Offline"));
  mocks.generate.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: object) =>
  new Request("http://localhost/api/chatbot/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
const combinedQuestion = "入会金はいくら？練習頻度は？";
const candidateBase = {
  category: "案内",
  priority: 0,
  is_active: true,
  lexical_score: 0.6,
};
const combinedQuestionCandidates = [
  { ...candidateBase, id: "fee", title: "入会金", content: "5000円です。", keywords: ["入会金"] },
  {
    ...candidateBase,
    id: "practice",
    title: "練習頻度",
    content: "週に2回です。",
    keywords: ["練習頻度"],
  },
];

it("スコアが近い異なる資料をGeminiでまとめて返す", async () => {
  const answer = "入会金は5000円で、練習は週に2回です。";
  mocks.read.mockResolvedValue(combinedQuestionCandidates);
  mocks.generate.mockResolvedValue(answer);
  const result = await POST(request({ message: combinedQuestion }));
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(mocks.generate).toHaveBeenCalledWith(combinedQuestion, combinedQuestionCandidates, {
    audience: "member",
  });
  const data = await result.json();
  expect(data).toMatchObject({ kind: "gemini", answer });
  expect(data.choices).toBeUndefined();
});
it("Geminiの回答を採用できなければ選択肢を返す", async () => {
  mocks.read.mockResolvedValue(combinedQuestionCandidates);
  const result = await POST(request({ message: combinedQuestion }));
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(await result.json()).toMatchObject({
    kind: "choices",
    choices: [
      { id: "fee", title: "入会金" },
      { id: "practice", title: "練習頻度" },
    ],
  });
});
it("入会金は入会費として検索し、一意の項目の本文を返す", async () => {
  mocks.read.mockResolvedValue([
    { ...candidateBase, id: "fee", title: "入会費はいくらですか？", content: "5000円です。", keywords: ["入会費"] },
    { ...candidateBase, id: "camp-fee", title: "合宿費はいくらですか？", content: "8000円です。", keywords: ["いくら"] },
  ]);
  const result = await POST(request({ message: "入会金はいくら？" }));
  expect(mocks.read).toHaveBeenCalledWith(["member.md"], "入会費はいくら?", undefined, undefined);
  expect(await result.json()).toMatchObject({ kind: "knowledge", answer: "5000円です。" });
  expect(mocks.embed).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("参加費の質問で参加だけが一致した項目は選択肢に含めない", async () => {
  mocks.read.mockResolvedValue([
    { ...candidateBase, id: "required", title: "毎回参加は必須ですか？", content: "任意です。", keywords: ["参加"] },
    { ...candidateBase, id: "entry", title: "大会の参加費", content: "参加費は別途かかります。", keywords: ["大会", "参加費"] },
  ]);
  const result = await POST(request({ message: "参加費の内訳を知りたい" }));
  const data = await result.json();
  expect(data.kind).toBe("choices");
  expect(data.choices).toEqual([{ id: "entry", label: "1", title: "大会の参加費" }]);
});
it("雨天の質問で練習だけが一致した候補は表示しない", async () => {
  mocks.read.mockResolvedValue([
    { ...candidateBase, id: "frequency", title: "練習頻度", content: "週に2回です。", keywords: ["練習"] },
    { ...candidateBase, id: "practice", title: "初心者の練習", content: "初心者も歓迎です。", keywords: ["練習"] },
  ]);
  const result = await POST(request({ message: "練習は雨でもやる？" }));
  const data = await result.json();
  expect(data.kind).toBe("fallback");
  expect(data.choices).toBeUndefined();
});
it("資料なしでは回答生成を呼ばず一般回答ボタンを提案", async () => {
  const result = await POST(request({ message: "ラケットの選び方" }));
  expect((await result.json()).generalTicket).toBeTruthy();
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("ボールの表面の質問は資料で答えられなくても一般回答に進める", async () => {
  const message = "ボールの表面けば立つのってなんで";
  const records = [{
    ...candidateBase,
    id: "ball-fee",
    title: "練習のボール代",
    content: "ボール代は会費に含まれています。",
    keywords: ["ボール"],
  }];
  mocks.read.mockResolvedValue(records);
  mocks.generate
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce("表面のフェルトは、ボールの速さや跳ね方などに影響します。");

  const fallback = await (await POST(request({ message }))).json();
  expect(fallback).toMatchObject({ kind: "fallback", generalTicket: expect.any(String) });
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(mocks.generate).toHaveBeenCalledWith(message, records, { audience: "member" });
  const general = await (await POST(request({ message, generalTicket: fallback.generalTicket }))).json();
  expect(general).toMatchObject({
    kind: "general",
    answer: expect.stringContaining("公式回答ではありません"),
  });
  expect(general.answer).toContain("フェルト");
  expect(mocks.generate).toHaveBeenLastCalledWith(message, [], { general: true, audience: "member" });
});

it("クラブ固有の質問へつながる場合は資料から回答できなくても一般回答に進めない", async () => {
  const message = "ちなみに、ボールの表面の素材は？";
  mocks.read.mockResolvedValue([{
    ...candidateBase,
    id: "equipment",
    title: "練習用具の案内",
    content: "練習用具は事前の案内をご確認ください。",
    keywords: ["ボール"],
  }]);
  const result = await POST(request({ message, history: ["Fortyloveで使う練習用具を教えて"] }));
  const data = await result.json();
  expect(data.kind).toBe("fallback");
  expect(data.generalTicket).toBeUndefined();
});
it("固有情報に一般回答を提案せず有人対応を案内", async () => {
  const data = await (await POST(request({ message: "会費はいくらですか" }))).json();
  expect(data.generalTicket).toBeUndefined();
  expect(data.offerEscalation).toBe(true);
});
it("memberがadmin対象を指定してもmember資料しか検索しない", async () => {
  await POST(request({ message: "質問です", audience: "admin" }));
  expect(mocks.read).toHaveBeenCalledWith(["member.md"], "質問です", undefined, undefined);
});
it("本人の一般回答ボタンからだけ生成し回数に含める", async () => {
  mocks.generate.mockResolvedValue("体格に合ったラケットを選びましょう。");
  const generalTicket = issueGeneralTicket("member-1", "member", "ラケットの選び方");
  const data = await (await POST(request({ message: "ラケットの選び方", generalTicket }))).json();
  expect(data.answer).toContain("公式回答ではありません");
  expect(mocks.rpc).toHaveBeenCalledWith("consume_chatbot_message", expect.anything());
  expect(
    (await POST(request({ message: "ラケットの選び方", generalTicket: "forged" }))).status,
  ).toBe(400);
});
it.each(["member", "super_admin"])("一般回答のGemini診断は最高管理者だけに表示する（%s）", async (role) => {
  const message = "ボールの表面はなぜ毛羽立つの？";
  const diagnostic = "Gemini APIの利用枠に達しました（HTTP 429）。";
  mocks.session.mockResolvedValue({ id: "test-user", role });
  mocks.generate.mockImplementation(async (_message, _records, options) => {
    options.onFailure?.(diagnostic);
    return null;
  });
  const generalTicket = issueGeneralTicket("test-user", "member", message);
  const response = await POST(request({ message, generalTicket }));
  const data = await response.json();
  expect(data.kind).toBe("general");
  expect(data.offerEscalation).toBe(true);
  expect(data.answer.includes(diagnostic)).toBe(role === "super_admin");
});
it("イベント質問は資料や生成処理に流さない", async () => {
  mocks.events.mockResolvedValue("予定は登録されていません。");
  await POST(request({ message: "次の練習はいつ" }));
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("上限到達後は一般回答も生成しない", async () => {
  mocks.rpc.mockResolvedValue({ data: false });
  const ticket = issueGeneralTicket("member-1", "member", "ラケットの選び方");
  expect((await POST(request({ message: "ラケットの選び方", generalTicket: ticket }))).status).toBe(
    429,
  );
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("通常質問のEmbeddingは再試行しない短時間設定を使う", async () => {
  await POST(request({ message: "質問です" }));
  expect(mocks.embed).toHaveBeenCalledWith(["質問です"], true, undefined, undefined, {
    maxAttempts: 1,
    requestTimeoutMs: 4000,
  });
});
it("追加質問では文脈を渡すが権限は会員のまま", async () => {
  await POST(
    request({ message: "それの料金は", history: ["ラケットの貸し出し"], audience: "admin" }),
  );
  expect(mocks.read).toHaveBeenCalledWith(
    ["member.md"],
    expect.stringContaining("ラケットの貸し出し"),
    undefined,
    undefined,
  );
});
it("長すぎる履歴は検索や利用回数消費の前に拒否する", async () => {
  expect(
    (await POST(request({ message: "質問", history: Array(5).fill("過去の質問") }))).status,
  ).toBe(400);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("選択されたIDでも現在の対象から消えた資料は返さない", async () => {
  const response = await POST(
    request({ message: "秘密", choiceId: "11111111-1111-4111-8111-111111111111" }),
  );
  expect(response.status).toBe(400);
  expect(mocks.generate).not.toHaveBeenCalled();
});

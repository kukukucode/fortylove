import { describe, expect, it, vi } from "vitest";
import { buildGeneralPrompt, buildGroundedPrompt, generateGroundedAnswer } from "./gemini-chatbot";

const records = [{ id: "1", title: "初心者", content: "初心者も歓迎しています。", category: "参加条件", keywords: ["初心者"], priority: 0, is_active: true, source_name: "member.md" }];

describe("Gemini grounded chatbot", () => {
  it("プロンプトに質問とMarkdownの内容を含める", () => {
    const prompt = buildGroundedPrompt("未経験でも参加できますか？", records);
    expect(prompt).toContain("member.md");
    expect(prompt).toContain("初心者も歓迎しています。");
    expect(prompt).toContain("未経験でも参加できますか？");
    expect(prompt).toContain("サークルの先輩が案内するように");
  });

  it("一般回答も親しみのある文体で答え、サークル固有の情報は推測しない", () => {
    const prompt = buildGeneralPrompt("ボールの表面はなぜけば立っていますか？");
    expect(prompt).toContain("自然で親しみのある「です・ます」調");
    expect(prompt).toContain("全角の「！」を1〜2箇所");
    expect(prompt).toContain("Fortyloveの会費・参加条件・日程・個人情報・運営判断は答えず");
  });

  it("複数FAQを統合するときも渡された回答だけを根拠にする", () => {
    const prompt = buildGroundedPrompt("初心者でもバイトと両立できますか？", [
      ...records,
      { ...records[0], id: "2", title: "参加頻度", content: "毎回の参加は必須ではありません。", keywords: ["参加頻度"] },
    ]);
    expect(prompt).toContain("初心者も歓迎しています。");
    expect(prompt).toContain("毎回の参加は必須ではありません。");
    expect(prompt).toContain("必ず __NO_ANSWER__ だけを返してください");
  });

  it("資料に答えがない応答は採用しない", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "__NO_ANSWER__" }] } }] }) });
    await expect(generateGroundedAnswer("質問", records, { config: { apiKey: "key" }, fetcher })).resolves.toBeNull();
  });

  it("根拠に基づく応答を返す", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "初心者も参加できます。" }] } }] }) });
    await expect(generateGroundedAnswer("質問", records, { config: { apiKey: "key" }, fetcher })).resolves.toBe("初心者も参加できます。");
  });

  it("生成された依頼の文末から「ね」を外し、感嘆符は残す", async () => {
    const result = "初心者も参加できます！ アプリから予約してくださいね！\n気軽にご参加くださいね";
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      candidates: [{ content: { parts: [{ text: result }] } }],
    }));
    await expect(generateGroundedAnswer("参加方法を教えて", records, {
      config: { apiKey: "key" }, fetcher,
    })).resolves.toBe("初心者も参加できます！ アプリから予約してください！\n気軽にご参加ください");
  });

  it("APIの失敗を機密情報を含まない診断に変換する", async () => {
    const onFailure = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(Response.json(
      { error: { message: "provider-response-body" } },
      { status: 429 },
    ));
    await expect(generateGroundedAnswer("質問", [], {
      config: { apiKey: "key" }, fetcher, general: true, onFailure,
    })).resolves.toBeNull();
    expect(onFailure).toHaveBeenCalledWith("Gemini APIの利用枠に達しました（HTTP 429）。");
  });

  it("モデルのパス表記を受け付け、回答文だけを取り出す", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      candidates: [{ content: { parts: [
        { thought: true, text: "内部の思考です。" },
        { text: "フェルトが空気抵抗や打球感に影響します。" },
      ] } }],
    }));
    await expect(generateGroundedAnswer("質問", [], {
      config: { apiKey: " key ", model: " models/gemini-3.5-flash-lite " },
      fetcher,
      general: true,
    })).resolves.toBe("フェルトが空気抵抗や打球感に影響します。");
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toMatch(/\/gemini-3\.5-flash-lite:generateContent$/);
    expect(request.headers["x-goog-api-key"]).toBe("key");
    expect(JSON.parse(request.body).generationConfig).toEqual({ maxOutputTokens: 300 });
  });
});

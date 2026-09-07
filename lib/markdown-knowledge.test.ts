import { describe, expect, it } from "vitest";
import { parseMarkdownKnowledge } from "./markdown-knowledge";

describe("Markdown knowledge import", () => {
  it("H1をカテゴリ、H2を回答データとして取り込む", () => {
    const result = parseMarkdownKnowledge("# 参加条件\n## 初心者でも参加できますか？\n初心者も歓迎です。\nキーワード: 初心者、未経験", "案内");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ category: "参加条件", title: "初心者でも参加できますか？", content: "初心者も歓迎です。" });
    expect(result[0].keywords).toContain("未経験");
  });

  it("見出しがない文書もファイル名で取り込む", () => {
    const result = parseMarkdownKnowledge("毎週水曜日に活動します。", "活動案内");
    expect(result[0]).toMatchObject({ title: "活動案内", content: "毎週水曜日に活動します。" });
  });

  it("コードブロックを回答本文から除外する", () => {
    const result = parseMarkdownKnowledge("## 連絡方法\n公開情報です。\n```\nSECRET=hidden\n```", "案内");
    expect(result[0].content).not.toContain("SECRET");
  });

  it("HTMLコメントとタグを境界で再構成せず除外する", () => {
    const result = parseMarkdownKnowledge(
      "## 安全な案内\n回答前<!-- <script>hidden</script> -->回答後<strong>強調</strong>",
      "案内",
    );
    expect(result[0].content).toContain("回答前 回答後 強調");
    expect(result[0].content).not.toContain("<!--");
    expect(result[0].content).not.toContain("<script");
    expect(result[0].content).not.toContain("<strong");
    expect(result[0].content).not.toContain("hidden");
  });

  it("閉じられていないコメントやタグより後を回答に含めない", () => {
    expect(parseMarkdownKnowledge("## 質問\n公開<!-- 非公開", "案内")[0].content).toBe("公開");
    expect(parseMarkdownKnowledge("## 質問\n公開<script 非公開", "案内")[0].content).toBe("公開");
  });
});

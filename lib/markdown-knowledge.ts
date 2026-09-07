export type MarkdownKnowledgeDraft = {
  title: string;
  category: string;
  content: string;
  keywords: string[];
  sourceSection: string;
};

type WorkingSection = { title: string; category: string; lines: string[]; order: number };

function removeDelimitedBlock(value: string, opener: string, closer: string) {
  let result = "";
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf(opener, cursor);
    if (start < 0) return result + value.slice(cursor);
    result += value.slice(cursor, start);
    const end = value.indexOf(closer, start + opener.length);
    if (end < 0) return result;
    result += " ";
    cursor = end + closer.length;
  }
  return result;
}

function removeMarkupTags(value: string) {
  let result = "";
  let insideTag = false;
  for (const character of value) {
    if (character === "<") {
      if (!insideTag) result += " ";
      insideTag = true;
    } else if (insideTag) {
      if (character === ">") insideTag = false;
    } else {
      result += character;
    }
  }
  return result;
}

function plainText(markdown: string) {
  return removeMarkupTags(removeDelimitedBlock(removeDelimitedBlock(markdown, "<!--", "-->"), "```", "```"))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "・")
    .replace(/^\s*\d+[.)]\s+/gm, "・")
    .replace(/[*_~]/g, "")
    .replace(/\|\s*:?-{3,}:?\s*(?=\|)/g, "|")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function derivedKeywords(title: string, explicit: string[]) {
  const titleParts = title.split(/[\s、,・/／:：()（）「」『』-]+/).map((value) => value.trim()).filter((value) => value.length >= 2);
  return [...new Set([...explicit, title, ...titleParts])].slice(0, 20);
}

function splitSection(section: WorkingSection): MarkdownKnowledgeDraft[] {
  const keywordLines: string[] = [];
  const bodyLines = section.lines.filter((line) => {
    const match = line.match(/^\s*(?:キーワード|keywords?)\s*[:：]\s*(.+)$/i);
    if (!match) return true;
    keywordLines.push(...match[1].split(/[、,]/).map((value) => value.trim()).filter(Boolean));
    return false;
  });
  const content = plainText(bodyLines.join("\n"));
  if (section.title.trim().length < 2 || content.length < 2) return [];
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > 2000) {
    let breakAt = Math.max(remaining.lastIndexOf("\n", 2000), remaining.lastIndexOf("。", 2000) + 1);
    if (breakAt < 500) breakAt = 2000;
    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.map((chunk, index) => ({
    title: (chunks.length > 1 ? `${section.title}（${index + 1}/${chunks.length}）` : section.title).slice(0, 100),
    category: section.category.slice(0, 50) || "基本情報",
    content: chunk,
    keywords: derivedKeywords(section.title, keywordLines),
    sourceSection: `${section.order + 1}:${section.title}${chunks.length > 1 ? `:${index + 1}` : ""}`,
  }));
}

export function parseMarkdownKnowledge(markdown: string, fallbackTitle: string) {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const sections: WorkingSection[] = [];
  let category = "基本情報";
  let current: WorkingSection | null = null;
  let insideFence = false;

  for (const line of normalized.split("\n")) {
    if (/^\s*```/.test(line)) {
      insideFence = !insideFence;
      current?.lines.push(line);
      continue;
    }
    const heading = !insideFence ? line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/) : null;
    if (!heading) {
      if (!current && line.trim()) current = { title: fallbackTitle, category, lines: [], order: sections.length };
      current?.lines.push(line);
      continue;
    }
    if (current) sections.push(current);
    const level = heading[1].length;
    const title = plainText(heading[2]);
    if (level === 1) category = title || "基本情報";
    current = { title, category: level === 1 ? "基本情報" : category, lines: [], order: sections.length };
  }
  if (current) sections.push(current);
  return sections.flatMap(splitSection);
}

export const MARKDOWN_MAX_FILES = 10;
export const MARKDOWN_MAX_BYTES = 1_000_000;
export const MARKDOWN_MAX_RECORDS = 1000;

export function validateMarkdownFiles(files: { name: string; size: number }[]) {
  if (!files.length || files.length > MARKDOWN_MAX_FILES) return "一度に選択できるのは1〜10ファイルです。";
  if (files.reduce((sum, file) => sum + file.size, 0) > MARKDOWN_MAX_BYTES) return "合計1MB（1,000,000バイト）まで選択できます。";
  if (files.some((file) => !/\.md$/i.test(file.name) || !file.size || file.name.length > 255)) return "名前が255文字以内の空でない.mdファイルを選択してください。";
  if (new Set(files.map((file) => file.name)).size !== files.length) return "同じ名前のファイルは同時に選択できません。";
  return null;
}

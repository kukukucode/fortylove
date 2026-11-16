"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { validateMarkdownFiles } from "@/lib/markdown-knowledge";

type Review = {
  hash: string;
  expectedVersion: number;
  legacy: boolean;
  changes: {
    added: string[];
    removed: string[];
    addedCount: number;
    removedCount: number;
    reordered: boolean;
  };
};
type Entry = { file: File; count: number; state: string; error?: string; review?: Review };
export function MarkdownImporter() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [approved, setApproved] = useState(false);
  const revision = useRef(0);
  const router = useRouter();
  useEffect(() => setReady(true), []);
  async function select(files: File[]) {
    const token = ++revision.current;
    setApproved(false);
    const invalid = validateMarkdownFiles(files);
    setError(invalid ?? "");
    if (invalid) {
      setEntries([]);
      return;
    }
    setBusy(true);
    setEntries(files.map((file) => ({ file, count: 0, state: "解析中" })));
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/admin/chatbot/import/preview", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "解析できませんでした。");
      if (revision.current === token)
        setEntries(
          files.map((file) => {
            const item = result.entries.find((entry: { name: string }) => entry.name === file.name);
            return {
              file,
              count: item?.count ?? 0,
              state: item?.error ? "エラー" : "確認待ち",
              error: item?.error,
              review: item?.hash ? item : undefined,
            };
          }),
        );
    } catch (issue) {
      if (revision.current === token) {
        setError(issue instanceof Error ? issue.message : "解析できませんでした。");
        setEntries([]);
      }
    } finally {
      if (revision.current === token) setBusy(false);
    }
  }
  async function upload() {
    if (busy || !approved) return;
    setBusy(true);
    setError("");
    const pending = entries.filter(
      (entry) => entry.state !== "完了" && entry.count > 0 && entry.count <= 1000,
    );
    try {
      const form = new FormData();
      pending.forEach(({ file }) => form.append("files", file));
      form.append(
        "reviews",
        JSON.stringify(
          pending.map((entry) => ({
            name: entry.file.name,
            hash: entry.review?.hash,
            expectedVersion: entry.review?.expectedVersion,
          })),
        ),
      );
      const response = await fetch("/api/admin/chatbot/import", { method: "POST", body: form });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "取り込めませんでした。");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("応答を取得できませんでした。");
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const update = JSON.parse(line) as {
            name: string;
            state: string;
            count?: number;
            error?: string;
          };
          setEntries((current) =>
            current.map((entry) =>
              entry.file.name === update.name
                ? {
                    ...entry,
                    state: update.state,
                    count: update.count ?? entry.count,
                    error: update.error,
                  }
                : entry,
            ),
          );
        }
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "通信に失敗しました。");
    } finally {
      setEntries((current) =>
        current.map((entry) =>
          !["完了", "エラー"].includes(entry.state)
            ? {
                ...entry,
                state: "エラー",
                error: "処理結果を確認できませんでした。一覧を確認後、再試行できます。",
              }
            : entry,
        ),
      );
      setBusy(false);
      router.refresh();
    }
  }
  return (
    <section className="import-panel" aria-busy={busy}>
      <h2>Markdownを読み込む</h2>
      <p>
        最大10ファイル・合計1MB。1ファイル1,000件まで。同名ファイルは成功したときだけ差し替えます。
      </p>
      <label
        className={`import-drop ${dragging ? "dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy) void select(Array.from(event.dataTransfer.files));
        }}
      >
        <Upload />
        <span>ファイルを選択、またはここへドロップ</span>
        <input
          type="file"
          multiple
          accept=".md"
          disabled={busy || !ready}
          onChange={(event) => {
            void select(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </label>
      <ul className="import-files" aria-live="polite">
        {entries.map((entry) => (
          <li key={entry.file.name}>
            <strong>{entry.file.name}</strong>
            <span>
              {entry.count.toLocaleString()}件 · {entry.state}
            </span>
            {entry.error && <p role="alert">{entry.error}</p>}
            {entry.review && (
              <details>
                <summary>
                  変更内容：追加{entry.review.changes.addedCount}行・削除
                  {entry.review.changes.removedCount}行
                </summary>
                <p>
                  {entry.review.legacy
                    ? "以前の原本は未保存です。今回から版を保存します。"
                    : `現在の版：${entry.review.expectedVersion} → 新しい版：${entry.review.expectedVersion + 1}`}
                </p>
                {entry.review.changes.reordered && <p>行の順序・改行に変更があります。</p>}
                <p>変更行を各100行まで表示します。行の移動は追加・削除に数えません。</p>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    maxHeight: 240,
                    overflow: "auto",
                  }}
                >
                  {entry.review.changes.removed
                    .map((line) => `− ${line}`)
                    .concat(entry.review.changes.added.map((line) => `＋ ${line}`))
                    .join("\n")}
                </pre>
              </details>
            )}
          </li>
        ))}
      </ul>
      {!!entries.length && (
        <p>
          {entries.length}ファイル / 合計
          {entries.reduce((sum, e) => sum + e.count, 0).toLocaleString()}件
        </p>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {!!entries.some((entry) => entry.review) && (
        <label>
          <input
            type="checkbox"
            checked={approved}
            disabled={busy}
            onChange={(event) => setApproved(event.target.checked)}
          />
          変更内容を確認し、この内容を回答に反映します
        </label>
      )}
      <button
        type="button"
        className="primary"
        disabled={
          busy ||
          !approved ||
          !entries.some((e) => e.review && e.state !== "完了" && e.count > 0 && e.count <= 1000)
        }
        onClick={upload}
      >
        {busy ? "処理中…" : "アップロード・再試行"}
      </button>
      <small>
        検索用データの作成に外部AIサービスを利用します。失敗したファイルは修正・再試行できます。
      </small>
    </section>
  );
}

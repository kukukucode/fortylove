"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Version = {
  id: string;
  version: number;
  created_at: string;
  created_by: string | null;
  source_hash: string;
};
export function DocumentHistory({ source }: { source: string }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeVersion, setActiveVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const router = useRouter();
  async function load(offset = 0) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/chatbot/documents?source=${encodeURIComponent(source)}&offset=${offset}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setVersions((current) => (offset ? [...current, ...data.versions] : data.versions));
      setActiveVersion(data.activeVersion);
      setHasMore(data.versions.length === 20);
      setLoaded(true);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "履歴を取得できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  async function restore(version: Version) {
    if (busy || !window.confirm(`「${source}」のv${version.version}を新しい版として復元しますか？`))
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/chatbot/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id, expectedVersion: activeVersion }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await load();
      router.refresh();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "復元できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="document-history" aria-busy={busy}>
      <button type="button" disabled={busy} onClick={() => void load()}>
        原本・版履歴を確認
      </button>
      {error && <p role="alert">{error}</p>}
      {loaded && !versions.length && (
        <p>原本の履歴はまだありません。Markdownを再取り込みすると保存されます。</p>
      )}
      {!!versions.length && (
        <ul>
          {versions.map((version) => (
            <li key={version.id}>
              <span>
                v{version.version}
                {version.version === activeVersion ? "（使用中）" : ""} ·{" "}
                {new Date(version.created_at).toLocaleString("ja-JP")}
              </span>
              <a href={`/api/admin/chatbot/documents?version=${version.id}`} download>
                原本をダウンロード
              </a>
              <button
                type="button"
                disabled={busy || version.version === activeVersion}
                onClick={() => void restore(version)}
              >
                この版を復元
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button type="button" disabled={busy} onClick={() => void load(versions.length)}>
          以前の版を表示
        </button>
      )}
    </div>
  );
}

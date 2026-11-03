"use client";
import { useState } from "react";
import { refreshFaqSearch } from "@/app/server-actions/faq-actions";
export function FaqSearchRefresh() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function refresh() {
    setBusy(true);
    let count = 0;
    try {
      for (;;) {
        const result = await refreshFaqSearch();
        if (result.error) {
          setStatus(result.error);
          break;
        }
        count += result.updated;
        setStatus(`${count}件の検索データを更新しました。`);
        if (!result.more) break;
      }
    } catch {
      setStatus("更新に失敗しました。再試行できます。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="faq-search-refresh">
      <button type="button" className="secondary" disabled={busy} onClick={refresh}>
        {busy ? "検索データ更新中…" : "FAQの検索データを更新・再試行"}
      </button>
      <p role="status">{status}</p>
      <small>公開FAQの検索データを作成します。未作成でもキーワード検索で回答候補になります。</small>
    </div>
  );
}

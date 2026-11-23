"use client";

import { useState } from "react";
import { deleteChatbotMarkdownSource } from "@/app/server-actions/chatbot-actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";

export function DeleteChatbotSourceForm({ source }: { source: string }) {
  const [failed, setFailed] = useState(false);

  async function remove(formData: FormData) {
    setFailed(false);
    try {
      const { error } = await deleteChatbotMarkdownSource(formData);
      const query = error ? new URLSearchParams({ error }) : new URLSearchParams({ source_deleted: "1" });
      window.location.assign(`/admin/chatbot?${query}`);
    } catch {
      setFailed(true);
    }
  }

  return (
    <form action={remove}>
      <input type="hidden" name="source_name" value={source} />
      <ConfirmSubmitButton
        className="danger"
        message={`「${source}」の原本・全版履歴・取り込んだ回答を削除しますか？`}
      >
        削除
      </ConfirmSubmitButton>
      {failed && <p role="alert">Markdownを削除できませんでした。再試行してください。</p>}
    </form>
  );
}

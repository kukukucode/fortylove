"use client";

import { FormEvent, useId } from "react";
import { Bot, Send, ShieldCheck, X } from "lucide-react";
import { ChatbotMessageView } from "./chatbot-message";
import type { ChatbotMode } from "./types";
import { useChatbotConversation } from "./use-chatbot-conversation";

type ChatbotPreviewProps = {
  mode?: ChatbotMode;
  onClose?: () => void;
  active?: boolean;
};

export function ChatbotPreview({ mode = "preview", onClose, active = true }: ChatbotPreviewProps) {
  const titleId = useId();
  const inputId = useId();
  const conversation = useChatbotConversation(mode, active);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await conversation.submitMessage();
  }

  return <section className="chatbot-preview" aria-labelledby={titleId}>
    <header>
      <span className="chatbot-icon"><Bot /></span>
      <div>
        <h2 id={titleId}>{mode === "preview" ? "動作確認チャット" : "Fortylove チャットBot"}</h2>
        <p><ShieldCheck />{mode === "preview" ? "super_adminは常時テスト可能" : mode === "admin" ? "管理者向け" : "メンバー向け"}</p>
      </div>
      {onClose && <button className="chatbot-close" type="button" onClick={onClose} aria-label="チャットを閉じる"><X /></button>}
    </header>
    {mode === "preview" && <div className="chatbot-test-audience">
      <span>テスト対象</span>
      <div>
        <button type="button" className={conversation.testAudience === "admin" ? "active" : ""} disabled={conversation.sending || conversation.escalating} onClick={() => conversation.changeTestAudience("admin")}>管理者</button>
        <button type="button" className={conversation.testAudience === "member" ? "active" : ""} disabled={conversation.sending || conversation.escalating} onClick={() => conversation.changeTestAudience("member")}>一般ユーザー</button>
      </div>
    </div>}
    <div ref={conversation.messagesRef} className="chatbot-messages" aria-live="polite">
      {conversation.messages.map((item, index) => <ChatbotMessageView
        key={`${item.role}-${index}`}
        item={item}
        index={index}
        mode={mode}
        sending={conversation.sending}
        escalating={conversation.escalating}
        onChoose={(choice) => conversation.requestAnswer(`${choice.label}. ${choice.title}`, choice.title, choice.id)}
        onChooseOther={conversation.chooseOther}
        onGeneralAnswer={(selectedMessage) => conversation.requestAnswer("一般的な回答を見る", selectedMessage.question, undefined, selectedMessage.generalTicket)}
        onEscalate={conversation.requestEscalation}
        onDecline={conversation.declineEscalation}
      />)}
      {conversation.sending && <div className="chat-message bot"><p>回答を確認しています…</p></div>}
    </div>
    <form onSubmit={send} autoComplete="off">
      <label className="sr-only" htmlFor={inputId}>質問</label>
      <textarea
        ref={conversation.inputRef}
        id={inputId}
        value={conversation.message}
        onChange={(event) => conversation.setMessage(event.target.value)}
        maxLength={500}
        placeholder={conversation.pendingChoices.length ? `1〜${conversation.pendingChoices.length + 1}から選択、または質問を入力` : "例：次の新歓はいつ？"}
        rows={1}
        autoComplete="off"
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
        aria-autocomplete="none"
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
      />
      <button type="submit" disabled={conversation.sending || !conversation.message.trim()} aria-label="送信"><Send /></button>
    </form>
    <details className="chatbot-privacy-note"><summary>利用について</summary><p>回答のため外部AIサービスを利用する場合があります。個人情報は入力しないでください。</p></details>
  </section>;
}

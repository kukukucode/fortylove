import { UserRoundCheck } from "lucide-react";
import type { ChatbotChoice, ChatbotMessage, ChatbotMode } from "./types";

type ChatbotMessageProps = {
  item: ChatbotMessage;
  index: number;
  mode: ChatbotMode;
  sending: boolean;
  escalating: boolean;
  onChoose: (choice: ChatbotChoice) => void;
  onChooseOther: () => void;
  onGeneralAnswer: (item: ChatbotMessage) => void;
  onEscalate: (index: number, question: string) => void;
  onDecline: (index: number) => void;
};

export function ChatbotMessageView({
  item,
  index,
  mode,
  sending,
  escalating,
  onChoose,
  onChooseOther,
  onGeneralAnswer,
  onEscalate,
  onDecline,
}: ChatbotMessageProps) {
  return <div className={`chat-message ${item.role}`}>
    <p>{item.text}</p>
    {mode === "preview" && item.source && <small>根拠：{item.source}</small>}
    {!!item.choices?.length && <div className="chatbot-choice-list" aria-label="回答候補">
      {item.choices.map((choice) => <button
        type="button"
        key={choice.id}
        disabled={sending}
        onClick={() => onChoose(choice)}
      >
        <span>{choice.label}</span>{choice.title}
      </button>)}
      <button type="button" disabled={sending} onClick={onChooseOther}>
        <span>{item.choices.length + 1}</span>その他（チャットに入力）
      </button>
      <small>ボタンを押すか、番号を入力してください。「その他」では質問を詳しく入力できます。</small>
    </div>}
    {item.generalTicket && <button
      type="button"
      className="general-answer-button"
      disabled={sending}
      onClick={() => onGeneralAnswer(item)}
    >一般的な回答を見る{mode !== "preview" && "（利用回数1件）"}</button>}
    {item.offerEscalation && !item.decided && <div className="escalation-choice">
      <strong><UserRoundCheck />有人対応を希望しますか？</strong>
      <div>
        <button type="button" onClick={() => onEscalate(index, item.question ?? "")} disabled={escalating}>はい</button>
        <button type="button" onClick={() => onDecline(index)} disabled={escalating}>いいえ</button>
      </div>
      <small>「はい」を選んだ場合のみ、管理者の対応待ちへ登録されます。</small>
    </div>}
  </div>;
}

import { useEffect, useRef, useState } from "react";
import type { ChatbotChoice, ChatbotMessage, ChatbotMode, ChatbotResponse } from "./types";

function initialMessage(mode: ChatbotMode): ChatbotMessage {
  return {
    role: "bot",
    text: mode === "preview"
      ? "動作確認用チャットです。公開設定に関係なくいつでもテストできます。"
      : "Fortyloveについて知りたいことを質問してください。",
  };
}

export function useChatbotConversation(mode: ChatbotMode, active: boolean) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const history = useRef<Partial<Record<"admin" | "member", ChatbotMessage[]>>>({});
  const requestLock = useRef(false);
  const [testAudience, setTestAudience] = useState<"admin" | "member">("member");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatbotMessage[]>([initialMessage(mode)]);
  const [pendingChoices, setPendingChoices] = useState<ChatbotChoice[]>([]);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = messagesRef.current;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, sending, escalating, active]);

  useEffect(() => {
    if (!active) setMessage("");
  }, [active]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container || !active) return;
    const observer = new ResizeObserver(() => container.scrollTo({ top: container.scrollHeight, behavior: "instant" }));
    observer.observe(container);
    return () => observer.disconnect();
  }, [active]);

  async function requestAnswer(displayText: string, requestMessage = displayText, choiceId?: string, generalTicket?: string) {
    if (!displayText.trim() || requestLock.current) return;
    requestLock.current = true;
    setMessages((current) => [
      ...current.map((item) => item.choices ? { ...item, choices: undefined } : item),
      { role: "user", text: displayText },
    ]);
    setPendingChoices([]);
    setMessage("");
    setSending(true);
    try {
      const response = await fetch("/api/chatbot/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: requestMessage,
          ...(generalTicket ? { generalTicket } : {}),
          ...(choiceId ? { choiceId } : {}),
          ...(mode === "preview" ? { audience: testAudience } : {}),
        }),
      });
      const result = await response.json() as ChatbotResponse;
      const choices = result.choices ?? [];
      setPendingChoices(choices);
      setMessages((current) => [...current, {
        role: "bot",
        text: result.answer ?? result.error ?? "回答を取得できませんでした。",
        source: result.source,
        generalTicket: result.generalTicket,
        offerEscalation: result.offerEscalation,
        question: requestMessage,
        choices,
      }]);
    } catch {
      setMessages((current) => [...current, { role: "bot", text: "通信に失敗しました。時間をおいてお試しください。" }]);
    } finally {
      requestLock.current = false;
      setSending(false);
    }
  }

  async function submitMessage() {
    const value = message.trim();
    const selected = /^\d$/.test(value) ? pendingChoices[Number(value) - 1] : undefined;
    if (pendingChoices.length && Number(value) === pendingChoices.length + 1) {
      chooseOther();
      return;
    }
    await requestAnswer(value, selected?.title ?? value, selected?.id);
  }

  function chooseOther() {
    setPendingChoices([]);
    setMessage("");
    setMessages((current) => [
      ...current.map((item) => item.choices ? { ...item, choices: undefined } : item),
      { role: "bot", text: "知りたい内容をもう少し具体的に入力してください。" },
    ]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function declineEscalation(index: number) {
    setMessages((current) => current
      .map((item, itemIndex) => itemIndex === index ? { ...item, decided: true } : item)
      .concat({ role: "bot", text: "承知しました。今回は管理者へ通知しません。" }));
  }

  async function requestEscalation(index: number, question: string) {
    if (escalating) return;
    setEscalating(true);
    try {
      const response = await fetch("/api/chatbot/preview/escalate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const result = await response.json() as { message?: string; error?: string };
      setMessages((current) => current
        .map((item, itemIndex) => itemIndex === index ? { ...item, decided: true } : item)
        .concat({ role: "bot", text: result.message ?? result.error ?? "管理者へ通知できませんでした。" }));
    } catch {
      setMessages((current) => [...current, { role: "bot", text: "管理者へ通知できませんでした。時間をおいてお試しください。" }]);
    } finally {
      setEscalating(false);
    }
  }

  function changeTestAudience(audience: "admin" | "member") {
    if (sending || escalating || audience === testAudience) return;
    history.current[testAudience] = messages;
    setTestAudience(audience);
    setMessage("");
    const previous = history.current[audience];
    setPendingChoices(previous?.at(-1)?.choices ?? []);
    setMessages(previous ?? [{
      role: "bot",
      text: `${audience === "admin" ? "管理者" : "一般ユーザー"}向けの参照元へ切り替えました。質問を入力してください。`,
    }]);
  }

  return {
    messagesRef,
    inputRef,
    testAudience,
    message,
    setMessage,
    messages,
    pendingChoices,
    sending,
    escalating,
    requestAnswer,
    submitMessage,
    chooseOther,
    requestEscalation,
    declineEscalation,
    changeTestAudience,
  };
}

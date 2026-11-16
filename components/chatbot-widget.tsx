"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { ChatbotPreview } from "./chatbot-preview";

export function ChatbotWidget({ mode }: { mode: "preview" | "admin" | "member" }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pointer = useRef<{ x: number; y: number; outside: boolean } | null>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function outside(x: number, y: number) {
    const rect = dialog.current?.getBoundingClientRect();
    return !!rect && (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom);
  }
  return (
    <div className={`chatbot-widget ${open ? "open" : ""}`}>
      <dialog
        ref={dialog}
        className="chatbot-widget-dialog"
        aria-label={mode === "preview" ? "チャットBot TEST" : "Fortylove チャットBot"}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onPointerDown={(event) => {
          pointer.current = {
            x: event.clientX,
            y: event.clientY,
            outside: outside(event.clientX, event.clientY),
          };
        }}
        onPointerUp={(event) => {
          const down = pointer.current;
          pointer.current = null;
          if (
            down?.outside &&
            outside(event.clientX, event.clientY) &&
            Math.hypot(event.clientX - down.x, event.clientY - down.y) < 8
          )
            close();
        }}
      >
        <ChatbotPreview mode={mode} active={open} onClose={close} />
      </dialog>
      <span className="chatbot-widget-label">
        {mode === "preview" ? "チャットBotをテスト" : "chatbotはこちら"}
      </span>
      <button
        ref={trigger}
        className="chatbot-widget-button"
        type="button"
        onClick={() => setOpen(true)}
        aria-label="チャットを開く"
        aria-expanded={open}
      >
        <MessageCircle />
        {mode === "preview" && <small className="test-badge">TEST</small>}
      </button>
    </div>
  );
}

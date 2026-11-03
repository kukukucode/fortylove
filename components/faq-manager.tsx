"use client";
import { FormFeedback } from "@/components/form-feedback";
import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { deleteFaq, reorderFaqs, updateFaq } from "@/app/server-actions/faq-actions";
import { ConfirmSubmitButton } from "./confirm-submit-button";

type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  is_published: boolean;
};
export function FaqManager({
  faqs,
  categories,
}: {
  faqs: Faq[];
  categories: { id: string; name: string }[];
}) {
  const [items, setItems] = useState(faqs);
  const [saved, setSaved] = useState(faqs.map((f) => f.id).join());
  const [lifted, setLifted] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [swipe, setSwipe] = useState<{ id: string; offset: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const gesture = useRef<{
    id: string;
    x: number;
    y: number;
    drag: boolean;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);
  const dirty = items.map((f) => f.id).join() !== saved;
  function move(id: string, target: number) {
    setItems((current) => {
      const from = current.findIndex((f) => f.id === id);
      if (from < 0 || target < 0 || target >= current.length || from === target) return current;
      const result = [...current];
      result.splice(target, 0, ...result.splice(from, 1));
      return result;
    });
  }
  async function save() {
    const ids = items.map((f) => f.id);
    startTransition(async () => {
      try {
        const result = await reorderFaqs(ids);
        setNotice(result.error ?? "並び順を保存しました。");
        if (!result.error) {
          setSaved(ids.join());
          setItems((current) => current.map((item, index) => ({ ...item, sort_order: index })));
        }
      } catch {
        setNotice("保存できませんでした。再試行してください。");
      }
    });
  }
  return (
    <section className="faq-manager" aria-label="FAQ一覧">
      <div className="faq-order-bar">
        <p>持ち手を長押しして移動。横スワイプで削除ボタンを表示できます。</p>
        <button type="button" className="primary" disabled={!dirty || pending} onClick={save}>
          {pending ? "保存中…" : "変更を確定"}
        </button>
      </div>
      <p role="status">{notice || (dirty ? "並び順はまだ保存されていません。" : "")}</p>
      <div className="faq-admin-list">
        {items.map((faq, index) => (
          <article
            data-faq-id={faq.id}
            className={`faq-admin-card ${lifted === faq.id ? "lifted" : ""}`}
            key={faq.id}
          >
            <div className="faq-row-tools">
              <button
                type="button"
                className="faq-drag-handle"
                aria-label={`${faq.question}を並び替え`}
                disabled={pending}
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const state = {
                    id: faq.id,
                    x: event.clientX,
                    y: event.clientY,
                    drag: event.pointerType === "mouse",
                    timer: undefined as ReturnType<typeof setTimeout> | undefined,
                  };
                  gesture.current = state;
                  if (state.drag) setLifted(faq.id);
                  else
                    state.timer = setTimeout(() => {
                      state.drag = true;
                      setLifted(faq.id);
                    }, 350);
                }}
                onPointerMove={(event) => {
                  const state = gesture.current;
                  if (!state) return;
                  if (
                    !state.drag &&
                    Math.hypot(event.clientX - state.x, event.clientY - state.y) > 8
                  ) {
                    clearTimeout(state.timer);
                    return;
                  }
                  if (state.drag) {
                    const target = document
                      .elementFromPoint(event.clientX, event.clientY)
                      ?.closest<HTMLElement>("[data-faq-id]")?.dataset.faqId;
                    const to = items.findIndex((f) => f.id === target);
                    if (to >= 0) move(state.id, to);
                    if (event.clientY < 80) window.scrollBy(0, -12);
                    if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 12);
                  }
                }}
                onPointerUp={() => {
                  clearTimeout(gesture.current?.timer);
                  gesture.current = null;
                  setLifted(null);
                }}
                onPointerCancel={() => {
                  clearTimeout(gesture.current?.timer);
                  gesture.current = null;
                  setLifted(null);
                }}
              >
                <GripVertical />
              </button>
              <span>{faq.is_published ? "公開中" : "下書き"}</span>
              <button
                type="button"
                aria-label={`${faq.question}を上へ`}
                disabled={pending || index === 0}
                onClick={() => move(faq.id, index - 1)}
              >
                <ArrowUp />
              </button>
              <button
                type="button"
                aria-label={`${faq.question}を下へ`}
                disabled={pending || index === items.length - 1}
                onClick={() => move(faq.id, index + 1)}
              >
                <ArrowDown />
              </button>
              <button
                type="button"
                onClick={() => setRevealed(revealed === faq.id ? null : faq.id)}
              >
                削除操作
              </button>
            </div>
            <details>
              <summary
                className="faq-swipe-target"
                style={{
                  transform: swipe?.id === faq.id ? `translateX(${swipe.offset}px)` : undefined,
                }}
                onClick={(event) => {
                  if (Date.now() < suppressClickUntil.current) event.preventDefault();
                }}
                onPointerDown={(event) => {
                  if (event.pointerType !== "mouse")
                    gesture.current = {
                      id: faq.id,
                      x: event.clientX,
                      y: event.clientY,
                      drag: false,
                    };
                }}
                onPointerMove={(event) => {
                  const down = gesture.current;
                  if (
                    down?.id === faq.id &&
                    !down.drag &&
                    Math.abs(event.clientX - down.x) > 12 &&
                    Math.abs(event.clientY - down.y) < 25
                  )
                    setSwipe({
                      id: faq.id,
                      offset: Math.max(-64, Math.min(64, event.clientX - down.x)),
                    });
                }}
                onPointerUp={(event) => {
                  const down = gesture.current;
                  gesture.current = null;
                  setSwipe(null);
                  if (
                    down &&
                    Math.abs(event.clientX - down.x) > 60 &&
                    Math.abs(event.clientY - down.y) < 25
                  ) {
                    event.preventDefault();
                    suppressClickUntil.current = Date.now() + 350;
                    setRevealed(faq.id);
                  }
                }}
                onPointerCancel={() => {
                  gesture.current = null;
                  setSwipe(null);
                }}
              >
                {faq.question}
              </summary>
              <form action={updateFaq} className="faq-admin-form">
                <FormFeedback />
                <input type="hidden" name="faq_id" value={faq.id} />
                <input type="hidden" name="sort_order" value={faq.sort_order} />
                <label>
                  カテゴリ
                  <select name="category" defaultValue={faq.category}>
                    {!categories.some((c) => c.name === faq.category) && (
                      <option>{faq.category}</option>
                    )}
                    {categories.map((c) => (
                      <option key={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  公開状態
                  <select name="is_published" defaultValue={String(faq.is_published)}>
                    <option value="true">公開</option>
                    <option value="false">下書き</option>
                  </select>
                </label>
                <label className="full">
                  質問
                  <input name="question" defaultValue={faq.question} required maxLength={500} />
                </label>
                <label className="full">
                  回答
                  <textarea name="answer" defaultValue={faq.answer} required maxLength={5000} />
                </label>
                <ConfirmSubmitButton className="dark" message="FAQを更新しますか？">
                  変更を保存
                </ConfirmSubmitButton>
              </form>
            </details>
            {revealed === faq.id && (
              <form action={deleteFaq} className="faq-delete-form">
                <FormFeedback />
                <input type="hidden" name="faq_id" value={faq.id} />
                <ConfirmSubmitButton
                  className="danger"
                  message={`「${faq.question}」を削除しますか？`}
                >
                  削除
                </ConfirmSubmitButton>
              </form>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { updateEvent } from "@/app/server-actions/event-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { EventDocumentUploadInput } from "@/components/event-document-upload-input";

type EditableEvent = {
  id: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  description: string;
  eventType: string;
};

export function AdminEventEdit({ event }: { event: EditableEvent }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className="secondary event-edit-trigger"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        編集
      </button>
      <dialog
        className="event-edit-dialog"
        ref={dialogRef}
        onClick={(clickEvent) => {
          if (clickEvent.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        <div className="event-edit-modal">
          <div className="event-edit-heading">
            <div>
              <p className="eyebrow green">EDIT EVENT</p>
              <h2>予定を編集</h2>
            </div>
            <button type="button" aria-label="閉じる" onClick={() => dialogRef.current?.close()}>
              <X />
            </button>
          </div>
          <form action={updateEvent} className="grid-form">
            <input type="hidden" name="event_id" value={event.id} />
            <label className="full">
              種別
              <select name="event_type" defaultValue={event.eventType}>
                <option value="tennis">テニス</option>
                <option value="event">イベント</option>
              </select>
            </label>
            <label>
              タイトル
              <input name="title" defaultValue={event.title} required />
            </label>
            <label>
              場所
              <input name="location" defaultValue={event.location} required />
            </label>
            <label>
              開始日時
              <input
                type="datetime-local"
                name="starts_at"
                defaultValue={event.startsAt}
                required
              />
            </label>
            <label>
              終了日時
              <input type="datetime-local" name="ends_at" defaultValue={event.endsAt} required />
            </label>
            <label>
              定員
              <input type="number" name="capacity" min="1" defaultValue={event.capacity} required />
            </label>
            <label className="full">
              説明
              <textarea name="description" defaultValue={event.description} />
            </label>
            <EventDocumentUploadInput />
            <div className="event-edit-actions full">
              <button
                className="secondary"
                type="button"
                onClick={() => dialogRef.current?.close()}
              >
                キャンセル
              </button>
              <ConfirmSubmitButton
                className="primary"
                message={`「${event.title}」の変更内容を保存しますか？`}
              >
                変更を保存
              </ConfirmSubmitButton>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReservationResult } from "@/app/server-actions/member-actions";

const errorMessage = (error: ReservationResult["error"]) =>
  error === "full"
    ? "申し訳ございません。定員がいっぱいになりました。"
    : error === "cancel-deadline"
      ? "開始2時間前を過ぎた予定は、画面からキャンセルできません。"
      : "予約を更新できませんでした。もう一度お試しください。";

export function ReservationForm({
  eventId,
  title,
  booked,
  full,
}: {
  eventId: string;
  title: string;
  booked: boolean;
  full: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [isBooked, setIsBooked] = useState(booked);
  const [error, setError] = useState<ReservationResult["error"]>();
  useEffect(() => setIsBooked(booked), [booked]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !window.confirm(
        isBooked ? `「${title}」の予約をキャンセルしますか？` : `「${title}」に参加予約しますか？`,
      )
    )
      return;
    setError(undefined);
    setPending(true);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, operation: isBooked ? "cancel" : "reserve" }),
      });
      const result = (await response.json()) as ReservationResult;
      if (!response.ok || result.error) setError(result.error ?? "reservation");
      else {
        setIsBooked((current) => !current);
        router.refresh();
      }
    } catch {
      setError("reservation");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <input type="hidden" name="event_id" value={eventId} />
      <button
        type="submit"
        className={isBooked ? "booked" : "reserve"}
        disabled={pending || (!isBooked && full)}
        aria-busy={pending}
      >
        {pending ? "処理中…" : isBooked ? "予約済み" : full ? "満員" : "予約する"}
      </button>
      {error && (
        <small className="form-error" role="alert">
          {errorMessage(error)}
        </small>
      )}
    </form>
  );
}

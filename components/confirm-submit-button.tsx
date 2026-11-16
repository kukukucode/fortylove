"use client";

import { useFormStatus } from "react-dom";
import type { MouseEvent, ReactNode } from "react";

export function ConfirmSubmitButton({
  message,
  className,
  disabled,
  children,
}: {
  message: string;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  function confirmSubmission(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(message)) event.preventDefault();
  }

  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={confirmSubmission}
    >
      {pending ? "処理中…" : children}
    </button>
  );
}

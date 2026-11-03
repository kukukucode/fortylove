"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
export function FormFeedback({ successMessage }: { successMessage?: string }) {
  const router = useRouter();
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      setComplete(false);
    } else if (wasPending.current) {
      wasPending.current = false;
      setComplete(true);
      router.refresh();
    }
  }, [pending, router]);
  if (pending)
    return (
      <span className="form-pending" role="status">
        処理中です…
      </span>
    );
  return complete && successMessage ? (
    <span className="form-success" role="status">
      {successMessage}
    </span>
  ) : null;
}

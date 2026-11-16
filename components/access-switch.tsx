"use client";
import { useFormStatus } from "react-dom";
export function AccessSwitch({ enabled, label }: { enabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="access-switch"
      role="switch"
      aria-checked={enabled}
      aria-label={`${label}のチャットBot利用`}
      disabled={pending}
    >
      <span />
      <i className="sr-only">{pending ? "変更中" : enabled ? "ON" : "OFF"}</i>
    </button>
  );
}

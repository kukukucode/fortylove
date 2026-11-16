"use client";

import { type FormEvent, useState, useTransition } from "react";
import { updateNotificationSettings } from "@/app/server-actions/settings-actions";

export function NotificationSettingsForm({
  initialEmail,
  initialHealthEnabled,
  initialErrorsEnabled,
}: {
  initialEmail: string;
  initialHealthEnabled: boolean;
  initialErrorsEnabled: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [healthEnabled, setHealthEnabled] = useState(initialHealthEnabled);
  const [errorsEnabled, setErrorsEnabled] = useState(initialErrorsEnabled);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"saved" | "error" | null>(null);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      try {
        await updateNotificationSettings(data);
        setResult("saved");
      } catch {
        setResult("error");
      }
    });
  }

  return (
    <form onSubmit={save} aria-busy={pending}>
      {pending ? (
        <span className="form-pending" role="status">
          処理中です…
        </span>
      ) : result === "saved" ? (
        <span className="form-success" role="status">
          監視通知の設定を保存しました。
        </span>
      ) : result === "error" ? (
        <span className="alert" role="alert">
          通知設定を保存できませんでした。再試行してください。
        </span>
      ) : null}
      <label htmlFor="ops-email">通知先メールアドレス</label>
      <input
        id="ops-email"
        name="email"
        type="email"
        maxLength={254}
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={pending}
      />
      <label>
        <input
          type="checkbox"
          name="health_enabled"
          checked={healthEnabled}
          onChange={(event) => setHealthEnabled(event.target.checked)}
          disabled={pending}
        />
        障害・復旧を通知する
      </label>
      <label>
        <input
          type="checkbox"
          name="errors_enabled"
          checked={errorsEnabled}
          onChange={(event) => setErrorsEnabled(event.target.checked)}
          disabled={pending}
        />
        アプリケーションエラーを通知する
      </label>
      <button className="primary" disabled={pending}>
        通知設定を保存
      </button>
    </form>
  );
}

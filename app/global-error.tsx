"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="ja">
      <body>
        <main>
          <h1>画面を表示できませんでした</h1>
          <p>時間をおいて再度お試しください。</p>
          <button onClick={reset}>再試行</button>
          <a href="/login">ログイン画面へ</a>
        </main>
      </body>
    </html>
  );
}

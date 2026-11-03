import { FormFeedback } from "@/components/form-feedback";
import Link from "next/link";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { login } from "@/app/actions";
import { TimeGreeting } from "@/components/time-greeting";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  const { error, deleted } = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-art">
        <Brand />
        <div className="ball ball-one" />
        <div className="ball ball-two" />
        <div className="auth-message">
          <p className="eyebrow">WELCOME TO THE COURT</p>
          <h1>
            最高の日々を、
            <br />
            ここから。
          </h1>
          <p>
            練習の予定も、仲間との出会いも。
            <br />
            Fortyのすべてをひとつの場所で。
          </p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-box">
          <div className="mobile-brand">
            <Brand />
          </div>
          <p className="eyebrow green">MEMBER LOGIN</p>
          <TimeGreeting />
          <p className="muted">登録した名前とパスワードでログインしてください。</p>
          {error && (
            <div className="alert">
              {error === "server"
                ? "データベースへ接続できませんでした。運営担当者に設定の確認を依頼してください。"
                : error === "rate-limit"
                  ? "ログイン試行回数が上限に達しました。10分後にもう一度お試しください。"
                  : "名前またはパスワードが違います。"}
            </div>
          )}
          {deleted && (
            <div className="success-message">退会手続きが完了し、アカウントを削除しました。</div>
          )}
          <form action={login}>
            <FormFeedback />
            <label>
              名前
              <div className="input-wrap">
                <UserRound />
                <input name="name" autoComplete="username" placeholder="山田 太郎" required />
              </div>
            </label>
            <label>
              パスワード
              <div className="input-wrap">
                <LockKeyhole />
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
              </div>
            </label>
            <button className="primary" type="submit">
              ログイン <ArrowRight />
            </button>
          </form>
          <div className="divider">
            <span>初めての方</span>
          </div>
          <Link className="secondary" href="/register">
            新規登録する
          </Link>
          <p className="help">パスワードを忘れた場合は、運営スタッフにお問い合わせください。</p>
        </div>
      </section>
    </main>
  );
}

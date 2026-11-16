import { FormFeedback } from "@/components/form-feedback";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { UniversityFields } from "@/components/university-fields";
import { RegistrationDraftKeeper } from "@/components/registration-draft";
import { register } from "@/app/actions";
import { db } from "@/lib/db";

export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { data: settings } = await db()
    .from("app_settings")
    .select("recruiting_open")
    .eq("id", 1)
    .maybeSingle();
  const recruitingOpen = settings?.recruiting_open ?? true;
  if (!recruitingOpen)
    return (
      <main className="registration-closed">
        <Brand />
        <div className="closed-orbit" aria-hidden="true">
          ♡
        </div>
        <p className="eyebrow green">THANK YOU</p>
        <h1>今年度の新歓は終了しました！</h1>
        <p>たくさんのご参加ありがとうございました！</p>
        <Link className="primary" href="/login">
          登録済みの方はこちら
        </Link>
      </main>
    );
  return (
    <main className="form-page">
      <header>
        <Brand />
        <Link href="/login">ログインへ</Link>
      </header>
      <section className="form-card">
        <p className="eyebrow green">EXPERIENCE Fortylove</p>
        <h1>新歓受付登録</h1>
        <p className="muted">
          {recruitingOpen
            ? "基本情報を入力すると、すぐに練習を予約できます。"
            : "現在は新規登録を受け付けていません。"}
        </p>
        {!recruitingOpen && (
          <div className="alert">
            現在、新歓受付登録を停止しています。受付再開までお待ちください。
          </div>
        )}
        {recruitingOpen && error && (
          <div className="alert">
            {error === "closed"
              ? "新歓受付は終了しました。"
              : error === "duplicate"
                ? "同じ名前とパスワードの登録があります。別のパスワードを設定してください。"
                : error === "password"
                  ? "パスワードは8文字以上で設定してください。"
                  : error === "rate-limit"
                    ? "短時間の登録試行が上限に達しました。1時間後にもう一度お試しください。"
                    : "登録できませんでした。入力内容をご確認ください。"}
          </div>
        )}
        {recruitingOpen && (
          <form id="registration-form" action={register} className="grid-form">
            <FormFeedback />
            <RegistrationDraftKeeper />
            <label className="full">
              名前
              <input name="name" placeholder="山田 太郎" required />
            </label>
            <UniversityFields />
            <label>
              学年
              <select name="grade" required>
                <option value="1">1年</option>
                <option value="2">2年</option>
                <option value="3">3年</option>
                <option value="4">4年</option>
                <option value="5">4年以上</option>
              </select>
            </label>
            <label>
              ラケット所持状況
              <select name="has_racket" defaultValue="" required>
                <option value="" disabled>
                  選択してください
                </option>
                <option value="true">持っている</option>
                <option value="false">持っていない</option>
              </select>
              <small>貸出ラケット準備の参考にします</small>
            </label>
            <label>
              Instagram ID（任意）
              <input name="instagram_id" placeholder="@を除いて入力" autoComplete="off" />
            </label>
            <label>
              LINEの表示名（任意）
              <input
                name="line_display_name"
                placeholder="LINEで表示されている名前"
                autoComplete="off"
              />
            </label>
            <label className="full">
              テニス経験
              <textarea
                name="tennis_experience"
                placeholder="例：中学で軟式テニスを3年間、大学から硬式を始めたい など"
              />
            </label>
            <label>
              パスワード
              <input
                name="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
              <small>8文字以上で設定してください</small>
            </label>
            <button className="primary full" type="submit">
              新歓受付に登録する
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

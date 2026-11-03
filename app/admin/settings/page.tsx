import { FormFeedback } from "@/components/form-feedback";
import { NotificationSettingsForm } from "@/components/notification-settings-form";
import {
  testNotificationDelivery,
  updateRecruitingStatus,
} from "@/app/server-actions/settings-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/server/action-context";

export const dynamic = "force-dynamic";

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; error?: string }>;
}) {
  await requireSuperAdmin();
  const { data: settings } = await db()
    .from("app_settings")
    .select("recruiting_open")
    .eq("id", 1)
    .maybeSingle();
  const recruitingOpen = settings?.recruiting_open ?? true;
  const { data: notifications, error: notificationsError } = await db()
    .from("ops_notification_settings")
    .select("email,health_enabled,errors_enabled")
    .eq("id", 1)
    .single();
  const { updated, error } = await searchParams;

  return (
    <section className="admin-page">
      <div className="page-title">
        <div>
          <p className="eyebrow green">SETTINGS</p>
          <h1>運用設定</h1>
          <p>新歓受付の公開状態を管理します。</p>
        </div>
        <span className="stat">
          <strong>{recruitingOpen ? "受付中" : "停止中"}</strong>
        </span>
      </div>
      {updated && (
        <div className="success-message" role="status">
          {updated === "notifications"
            ? "監視通知の設定を保存しました。"
            : updated === "notification-test"
              ? "保存済みの通知先へテストメールを送信しました。"
              : updated === "open"
                ? "新歓受付を再開しました。"
                : "新歓受付を停止しました。"}
        </div>
      )}
      {error && (
        <div className="alert" role="alert">
          {error.startsWith("notification")
            ? "通知の設定・送信に失敗しました。入力内容、追加SQL、メール設定を確認してください。テスト送信は1分に1回までです。"
            : error === "validation"
              ? "設定内容を確認してください。"
              : "受付状態を変更できませんでした。"}
        </div>
      )}
      <div className="settings-card">
        <h2>監視・エラー通知</h2>
        <p>
          障害・復旧とアプリのエラー通知を受け取るメールアドレスです。チャットBotの有人対応通知先とは別に管理します。
        </p>
        {notificationsError ? (
          <p role="alert">
            通知設定を取得できません。追加マイグレーションと接続を確認してください。
          </p>
        ) : (
          <>
            <NotificationSettingsForm
              initialEmail={notifications?.email ?? ""}
              initialHealthEnabled={notifications?.health_enabled ?? false}
              initialErrorsEnabled={notifications?.errors_enabled ?? false}
            />
            <form action={testNotificationDelivery}>
              <FormFeedback />
              <button type="submit">保存済みの通知先にテスト送信</button>
            </form>
          </>
        )}
        <small>
          外部監視・Sentry・メール連携の初期設定が別途必要です。宛先変更は次回の正常な監視設定取得後に反映され、障害中は最後に取得した宛先を使用します。
        </small>
      </div>
      <div className="settings-card">
        <h2>新歓受付</h2>
        <p>
          {recruitingOpen
            ? "現在、新入生からの新歓受付登録を受け付けています。"
            : "現在、新入生からの新歓受付登録を停止しています。"}
        </p>
        <form action={updateRecruitingStatus}>
          <FormFeedback />
          <input type="hidden" name="recruiting_open" value={String(!recruitingOpen)} />
          {recruitingOpen ? (
            <ConfirmSubmitButton className="danger" message="新歓受付を停止しますか？">
              新歓受付を停止する
            </ConfirmSubmitButton>
          ) : (
            <ConfirmSubmitButton className="primary" message="新歓受付を再開しますか？">
              新歓受付を再開する
            </ConfirmSubmitButton>
          )}
        </form>
        <small>この操作は最高管理者のみ実行でき、操作履歴が保存されます。</small>
      </div>
    </section>
  );
}

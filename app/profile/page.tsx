import { FormFeedback } from "@/components/form-feedback";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteOwnAccount, logout, updateProfile } from "@/app/actions";
import { MemberHeader } from "@/components/member-header";
import { UniversityFields } from "@/components/university-fields";
import { AvatarInput } from "@/components/avatar-input";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ChatbotWidget } from "@/components/chatbot-widget";
import { visibleDepartment } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function Profile({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { saved, error } = await searchParams;
  const client = db();
  const [{ data: user }, { data: settings }] = await Promise.all([
    client.from("users").select("*").eq("id", session.id).single(),
    client.from("app_settings").select("chatbot_member_enabled").eq("id", 1).maybeSingle(),
  ]);
  return <main className="member-shell">
    <MemberHeader active="profile" name={session.name} avatarUrl={user?.avatar_url} />
    <section className="profile-card">
      <div className={`profile-avatar${user?.avatar_url ? " has-image" : ""}`}>{user?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Public Supabase avatar URLs are already resized by CSS and must support the configured project host.
        <img src={user.avatar_url} alt="" />
      ) : session.name[0]}</div>
      <h1>{session.name}</h1>
      <p>{user?.university}・{user?.faculty}{visibleDepartment(user?.department) ? `・${visibleDepartment(user?.department)}` : ""}・{Number(user?.grade) >= 5 ? "4年以上" : `${user?.grade}年`}</p>
      {saved && <div className="success-message">プロフィールを更新しました。</div>}
      {error && <div className="alert">{error === "avatar-size" ? "画像は2MB以下にしてください。" : error === "avatar-type" ? "JPEG・PNG・WebP・GIF画像を選択してください。" : error === "avatar-upload" ? "画像をアップロードできませんでした。" : error === "avatar-column" ? "Supabaseに画像保存用の設定がありません。管理者に確認してください。" : error === "delete" ? "退会処理ができませんでした。" : "更新できませんでした。もう一度お試しください。"}</div>}
      <form action={updateProfile} className="profile-edit-form"><FormFeedback />
        <AvatarInput />
        <label className="full">名前<input name="name" defaultValue={user?.name} required /></label>
        <UniversityFields initialUniversity={user?.university} initialFaculty={user?.faculty} initialDepartment={user?.department} restoreDraft={false} />
        <label>学年
          <select name="grade" defaultValue={Number(user?.grade) >= 5 ? 5 : user?.grade} required>
            <option value="1">1年</option><option value="2">2年</option><option value="3">3年</option>
            <option value="4">4年</option><option value="5">4年以上</option>
          </select>
        </label>
        <label>Instagram ID（任意）<input name="instagram_id" defaultValue={user?.instagram_id ?? ""} placeholder="@を除いて入力" /></label>
        <label>LINEの表示名（任意）<input name="line_display_name" defaultValue={user?.line_display_name ?? ""} placeholder="LINEで表示されている名前" /></label>
        <label className="full">テニス経験<textarea name="tennis_experience" defaultValue={user?.tennis_experience ?? ""} /></label>
        <label>ラケットの所持状況
          <select name="has_racket" defaultValue={String(user?.has_racket ?? false)}>
            <option value="true">所持している</option>
            <option value="false">所持していない</option>
          </select>
        </label>
        <button className="primary full">プロフィールを保存</button>
      </form>
      <section className="withdraw-panel"><strong>退会手続き</strong><form action={deleteOwnAccount}><FormFeedback /><ConfirmSubmitButton className="danger" message="退会するとアカウントと予約情報が削除され、元に戻せません。本当に退会しますか？">退会してアカウントを削除</ConfirmSubmitButton></form></section>
      <form action={logout}><FormFeedback /><ConfirmSubmitButton className="secondary" message="ログアウトしますか？">ログアウト</ConfirmSubmitButton></form>
    </section>{settings?.chatbot_member_enabled === true && <ChatbotWidget mode="member" />}
  </main>;
}

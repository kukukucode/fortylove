import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateUserRole } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { AdminRoleAssignmentForm } from "@/components/admin-role-assignment-form";
import { InstagramLink } from "@/components/instagram-link";

export const dynamic = "force-dynamic";

export default async function Administrators({
  searchParams,
}: {
  searchParams: Promise<{ role_updated?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { data: currentUser } = await db()
    .from("users")
    .select("role")
    .eq("id", session.id)
    .single();
  if (currentUser?.role !== "super_admin") redirect("/admin");
  const { role_updated, error } = await searchParams;
  const { data: users } = await db()
    .from("users")
    .select("id,name,university,faculty,instagram_id,line_display_name,role,created_at")
    .order("name");
  const data = users?.filter((user) => user.role === "admin" || user.role === "super_admin");

  return (
    <section className="admin-page">
      <div className="page-title">
        <div>
          <p className="eyebrow green">ADMINISTRATORS</p>
          <h1>管理者一覧</h1>
          <p>この情報は最高情報責任者のみ閲覧できます。</p>
        </div>
        <span className="stat">
          <strong>{data?.length ?? 0}</strong>名
        </span>
      </div>
      {role_updated && (
        <div className="success-message">{role_updated}名の権限属性を更新しました。</div>
      )}
      {error && (
        <div className="alert">
          {error === "selection"
            ? "対象ユーザーを選択してください。"
            : "権限属性を更新できませんでした。"}
        </div>
      )}
      <details className="create-panel">
        <summary>＋ 管理者権限を付与</summary>
        <AdminRoleAssignmentForm users={users?.filter((user) => user.role === "member") ?? []} />
      </details>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>氏名</th>
              <th>権限属性</th>
              <th>所属</th>
              <th>連絡先</th>
              <th>登録日</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((admin) => (
              <tr key={admin.id}>
                <td>
                  <span className="table-name">
                    <i>{admin.name[0]}</i>
                    {admin.name}
                  </span>
                </td>
                <td>
                  {admin.id === session.id ? (
                    <strong>最高情報責任者（自分）</strong>
                  ) : (
                    <form action={updateUserRole} className="inline-role-form">
                      <input type="hidden" name="user_id" value={admin.id} />
                      <select name="role" defaultValue={admin.role}>
                        <option value="member">一般ユーザー</option>
                        <option value="admin">管理者</option>
                        <option value="super_admin">最高情報責任者</option>
                      </select>
                      <ConfirmSubmitButton
                        className="table-action"
                        message={`${admin.name}さんの権限を変更しますか？`}
                      >
                        変更
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </td>
                <td>
                  {admin.university}・{admin.faculty}
                </td>
                <td>
                  <InstagramLink id={admin.instagram_id} />
                  <small>
                    {admin.line_display_name && `LINE表示名: ${admin.line_display_name}`}
                  </small>
                </td>
                <td>{new Date(admin.created_at).toLocaleDateString("ja-JP")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.length && (
          <div className="empty">
            <p>管理者が登録されていません</p>
          </div>
        )}
      </div>
    </section>
  );
}

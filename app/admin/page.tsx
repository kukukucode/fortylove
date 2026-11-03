import { Search, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PasswordResetForm } from "@/components/password-reset-form";
import { InstagramLink } from "@/components/instagram-link";
import { deleteReceptionAccount } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { visibleDepartment } from "@/lib/profile";
export const dynamic = "force-dynamic";
export default async function Members({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    university?: string;
    page?: string;
    error?: string;
    password_reset?: string;
    deleted?: string;
  }>;
}) {
  const {
    q = "",
    university = "",
    page = "1",
    error,
    password_reset,
    deleted,
  } = await searchParams;
  const size = 20;
  const from = (Number(page) - 1) * size;
  const session = await getSession();
  const { data: currentUser } = session
    ? await db().from("users").select("role").eq("id", session.id).single()
    : { data: null };
  const isSuperAdmin = currentUser?.role === "super_admin";
  let query = db()
    .from("users")
    .select("*", { count: "exact" })
    .eq("role", "member")
    .range(from, from + size - 1)
    .order("created_at", { ascending: false });
  if (q) query = query.ilike("name", `%${q}%`);
  if (university) query = query.eq("university", university);
  const { data, count } = await query;
  data?.forEach((member) => {
    member.department = visibleDepartment(member.department);
  });
  const { data: passwordUsers } = isSuperAdmin
    ? await db().from("users").select("id,name,university,instagram_id,role").order("name")
    : { data: null };
  return (
    <section className="admin-page">
      <div className="page-title">
        <div>
          <p className="eyebrow green">MEMBERS</p>
          <h1>新入生名簿</h1>
          <p>登録者の情報を検索・確認できます。</p>
        </div>
        <span className="stat">
          <strong>{count ?? 0}</strong>名 登録中
        </span>
      </div>
      {password_reset && <div className="success-message">仮パスワードへ再設定しました。</div>}
      {deleted && <div className="success-message">新歓受付登録アカウントを削除しました。</div>}
      {error && (
        <div className="alert">
          {error === "password"
            ? "仮パスワードは8文字以上で入力してください。"
            : error === "membership-register"
              ? "入会者として登録できませんでした。"
              : error === "delete"
                ? "アカウントを削除できませんでした。"
                : "パスワードを更新できませんでした。"}
        </div>
      )}
      {isSuperAdmin && (
        <details className="create-panel">
          <summary>＋ パスワードを再設定</summary>
          <PasswordResetForm users={passwordUsers ?? []} />
        </details>
      )}
      <form className="filters">
        <div className="search">
          <Search />
          <input name="q" defaultValue={q} placeholder="名前で検索" />
        </div>
        <select name="university" defaultValue={university}>
          <option value="">すべての大学</option>
          <option>早稲田大学</option>
          <option>日本女子大学</option>
          <option>東京女子大学</option>
        </select>
        <button className="dark">絞り込む</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>氏名</th>
              <th>大学</th>
              <th>学部・学科</th>
              <th>学年</th>
              <th>テニス経験</th>
              <th>ラケット</th>
              <th>SNS・連絡先</th>
              <th>登録日</th>
              {isSuperAdmin && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {data?.map((m) => (
              <tr key={m.id}>
                <td>
                  <span className="table-name">
                    <i>{m.name[0]}</i>
                    {m.name}
                  </span>
                </td>
                <td>{m.university}</td>
                <td>
                  {m.faculty}
                  <small>{m.department}</small>
                </td>
                <td>{Number(m.grade) >= 5 ? "4年以上" : `${m.grade}年`}</td>
                <td>{m.tennis_experience || "未記入"}</td>
                <td>
                  <span className={m.has_racket ? "status-owned" : "status-needed"}>
                    {m.has_racket ? "所持" : "未所持"}
                  </span>
                </td>
                <td>
                  <InstagramLink id={m.instagram_id} />
                  <small>{m.line_display_name && `LINE表示名: ${m.line_display_name}`}</small>
                </td>
                <td>{new Date(m.created_at).toLocaleDateString("ja-JP")}</td>
                {isSuperAdmin && (
                  <td>
                    <form action={deleteReceptionAccount}>
                      <input type="hidden" name="user_id" value={m.id} />
                      <ConfirmSubmitButton
                        className="danger table-withdraw"
                        message={`${m.name}さんのアカウントと予約情報を削除します。退会者台帳から復旧できます。実行しますか？`}
                      >
                        削除
                      </ConfirmSubmitButton>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.length && (
          <div className="empty">
            <UserPlus />
            <p>該当するメンバーはいません</p>
          </div>
        )}
      </div>
    </section>
  );
}

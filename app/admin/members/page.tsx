import { deleteMemberAccount, deleteMemberAccounts } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SelectAllCheckbox } from "@/components/select-all-checkbox";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { InstagramLink } from "@/components/instagram-link";
import { DirectMembershipForm } from "@/components/direct-membership-form";
import { visibleDepartment } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function ActiveMembers({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; membership_registered?: string; error?: string }>;
}) {
  const session = await getSession();
  const { data: currentUser } = session
    ? await db().from("users").select("role").eq("id", session.id).single()
    : { data: null };
  const isSuperAdmin = currentUser?.role === "super_admin";
  const { deleted, membership_registered, error } = await searchParams;
  const { data } = await db()
    .from("membership_applications")
    .select(
      "id,applied_at,user:users(id,name,university,faculty,department,grade,instagram_id,line_display_name)",
    )
    .eq("status", "approved")
    .order("applied_at", { ascending: false });
  data?.forEach((member) => {
    const person = Array.isArray(member.user) ? member.user[0] : member.user;
    if (person) person.department = visibleDepartment(person.department);
  });
  const joinedIds = new Set(
    (data ?? [])
      .map((member) => {
        const person = Array.isArray(member.user) ? member.user[0] : member.user;
        return person?.id;
      })
      .filter(Boolean),
  );
  const { data: receptionUsers } = await db()
    .from("users")
    .select(
      "id,name,university,faculty,department,grade,instagram_id,line_display_name,tennis_experience,has_racket",
    )
    .eq("role", "member")
    .order("name");
  receptionUsers?.forEach((person) => {
    person.department = visibleDepartment(person.department);
  });
  const membershipCandidates = (receptionUsers ?? []).filter(
    (candidate) => !joinedIds.has(candidate.id),
  );

  const table = (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {isSuperAdmin && (
              <th className="check-column">
                <SelectAllCheckbox formId="bulk-member-delete" name="user_ids" />
              </th>
            )}
            <th>氏名</th>
            <th>所属</th>
            <th>学年</th>
            <th>連絡先</th>
            <th>入会日</th>
            {!isSuperAdmin && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {data?.map((member) => {
            const person = Array.isArray(member.user) ? member.user[0] : member.user;
            return (
              <tr key={member.id}>
                {isSuperAdmin && (
                  <td className="check-column">
                    <input
                      type="checkbox"
                      name="user_ids"
                      value={person?.id}
                      aria-label={`${person?.name}を選択`}
                    />
                  </td>
                )}
                <td>{person?.name}</td>
                <td>
                  {person?.university}・{person?.faculty}
                  <small>{person?.department}</small>
                </td>
                <td>{Number(person?.grade) >= 5 ? "4年以上" : `${person?.grade}年`}</td>
                <td>
                  <InstagramLink id={person?.instagram_id} />
                  <small>
                    {person?.line_display_name && `LINE表示名: ${person.line_display_name}`}
                  </small>
                </td>
                <td>{new Date(member.applied_at).toLocaleDateString("ja-JP")}</td>
                {!isSuperAdmin && (
                  <td>
                    <form action={deleteMemberAccount}>
                      <input type="hidden" name="user_id" value={person?.id} />
                      <ConfirmSubmitButton
                        className="danger table-withdraw"
                        message={`${person?.name}さんのアカウントと予約情報を削除します。元に戻せません。実行しますか？`}
                      >
                        退会・削除
                      </ConfirmSubmitButton>
                    </form>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!data?.length && (
        <div className="empty">
          <p>現在入会中のメンバーはいません</p>
        </div>
      )}
    </div>
  );

  return (
    <section className="admin-page">
      <div className="page-title">
        <div>
          <p className="eyebrow green">ACTIVE MEMBERS</p>
          <h1>入会者リスト</h1>
          <p>現在入会中のメンバーを確認・管理できます。</p>
        </div>
        <span className="stat">
          <strong>{data?.length ?? 0}</strong>名
        </span>
      </div>
      {membership_registered && (
        <div className="success-message">新歓受付名簿から入会者として登録しました。</div>
      )}
      {deleted && (
        <div className="success-message">{deleted}名を退会処理し、アカウントを削除しました。</div>
      )}
      {error && (
        <div className="alert">
          {error === "selection"
            ? "退会処理する入会者を選択してください。"
            : error === "membership-register"
              ? "入会者として登録できませんでした。もう一度お試しください。"
              : "退会処理を実行できませんでした。"}
        </div>
      )}
      <details className="create-panel membership-register-panel">
        <summary>＋ 新歓受付名簿から入会者を登録</summary>
        <p className="panel-description">
          名前や所属で新歓生を検索し、登録情報を確認してから入会者に追加できます。
        </p>
        <DirectMembershipForm users={membershipCandidates} />
      </details>
      {isSuperAdmin ? (
        <form id="bulk-member-delete" action={deleteMemberAccounts}>
          <div className="bulk-toolbar">
            <span>対象者を複数選択できます</span>
            <ConfirmSubmitButton
              className="danger table-withdraw"
              message="選択した入会者のアカウントと予約情報を削除します。元に戻せません。実行しますか？"
            >
              選択した入会者を退会・削除
            </ConfirmSubmitButton>
          </div>
          {table}
        </form>
      ) : (
        table
      )}
    </section>
  );
}

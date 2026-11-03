"use client";

import { useMemo, useState } from "react";
import { registerJoinedMember } from "@/app/actions";
import { ConfirmSubmitButton } from "./confirm-submit-button";
import { visibleDepartment } from "@/lib/profile";

type Candidate = {
  id: string;
  name: string;
  university: string;
  faculty?: string | null;
  department?: string | null;
  grade?: number | null;
  instagram_id?: string | null;
  line_display_name?: string | null;
  tennis_experience?: string | null;
  has_racket?: boolean | null;
};

export function DirectMembershipForm({ users }: { users: Candidate[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const results = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ja");
    if (!keyword || selected) return [];
    return users
      .filter((user) =>
        [
          user.name,
          user.university,
          user.faculty,
          visibleDepartment(user.department),
          user.instagram_id,
        ].some((value) => value?.toLocaleLowerCase("ja").includes(keyword)),
      )
      .slice(0, 8);
  }, [query, selected, users]);

  return (
    <form action={registerJoinedMember} className="direct-membership-form">
      <label className="user-search">
        新歓受付名簿から検索
        <input
          value={query}
          placeholder="名前・大学・学部・Instagram IDで検索"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
          }}
        />
        <input type="hidden" name="user_id" value={selected?.id ?? ""} />
        {results.length > 0 && (
          <div className="user-search-results">
            {results.map((user) => (
              <button
                type="button"
                key={user.id}
                onClick={() => {
                  setSelected(user);
                  setQuery(`${user.name}・${user.university}`);
                }}
              >
                <strong>{user.name}</strong>
                <small>
                  {user.university}・{user.faculty}
                  {visibleDepartment(user.department)
                    ? `・${visibleDepartment(user.department)}`
                    : ""}
                  {user.instagram_id ? `・@${user.instagram_id.replace(/^@/, "")}` : ""}
                </small>
              </button>
            ))}
          </div>
        )}
        {query && !selected && results.length === 0 && (
          <small>一致する未入会の新歓生がいません</small>
        )}
      </label>
      {selected && (
        <div className="membership-candidate-summary">
          <div>
            <small>氏名</small>
            <strong>{selected.name}</strong>
          </div>
          <div>
            <small>所属</small>
            <strong>
              {selected.university}・{selected.faculty || "未登録"}
              {visibleDepartment(selected.department)
                ? `・${visibleDepartment(selected.department)}`
                : ""}
            </strong>
          </div>
          <div>
            <small>学年</small>
            <strong>
              {Number(selected.grade) >= 5 ? "4年以上" : `${selected.grade ?? "未登録"}年`}
            </strong>
          </div>
          <div>
            <small>テニス経験</small>
            <strong>{selected.tennis_experience || "未記入"}</strong>
          </div>
          <div>
            <small>ラケット</small>
            <strong>{selected.has_racket ? "所持" : "未所持"}</strong>
          </div>
          <div>
            <small>SNS・連絡先</small>
            <strong>
              {selected.instagram_id
                ? `@${selected.instagram_id.replace(/^@/, "")}`
                : "Instagram未登録"}
              {selected.line_display_name ? `／LINE表示名 ${selected.line_display_name}` : ""}
            </strong>
          </div>
        </div>
      )}
      <ConfirmSubmitButton
        className="primary"
        disabled={!selected}
        message={`${selected?.name ?? "選択したユーザー"}さんを入会者として登録しますか？`}
      >
        この新歓生を入会者として登録
      </ConfirmSubmitButton>
    </form>
  );
}

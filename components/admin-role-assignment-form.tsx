"use client";

import { useMemo, useState } from "react";
import { updateUsersRole } from "@/app/actions";
import { ConfirmSubmitButton } from "./confirm-submit-button";

type RoleCandidate = {
  id: string;
  name: string;
  university: string;
  instagram_id?: string | null;
};

export function AdminRoleAssignmentForm({ users }: { users: RoleCandidate[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RoleCandidate[]>([]);
  const [role, setRole] = useState("admin");
  const results = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ja");
    if (!keyword) return [];
    return users
      .filter(
        (user) =>
          !selected.some((item) => item.id === user.id) &&
          [user.name, user.university, user.instagram_id].some((value) =>
            value?.toLocaleLowerCase("ja").includes(keyword),
          ),
      )
      .slice(0, 8);
  }, [query, selected, users]);

  return (
    <form action={updateUsersRole} className="role-form">
      <label className="user-search">
        対象ユーザー
        <input
          value={query}
          placeholder="名前・大学・Instagram IDで検索"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        {selected.map((user) => (
          <input key={user.id} type="hidden" name="user_ids" value={user.id} />
        ))}
        {results.length > 0 && (
          <div className="user-search-results">
            {results.map((user) => (
              <button
                type="button"
                key={user.id}
                onClick={() => {
                  setSelected((current) => [...current, user]);
                  setQuery("");
                }}
              >
                <strong>{user.name}</strong>
                <small>
                  {user.university}
                  {user.instagram_id ? `・@${user.instagram_id.replace(/^@/, "")}` : ""}
                </small>
              </button>
            ))}
          </div>
        )}
        {query && results.length === 0 && <small>一致するユーザーがいません</small>}
        {selected.length > 0 && (
          <div className="selected-users">
            {selected.map((user) => (
              <button
                type="button"
                key={user.id}
                onClick={() =>
                  setSelected((current) => current.filter((item) => item.id !== user.id))
                }
              >
                {user.name}
                <span>×</span>
              </button>
            ))}
          </div>
        )}
      </label>
      <label>
        付与する権限
        <select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="admin">管理者</option>
          <option value="super_admin">最高情報責任者</option>
        </select>
      </label>
      <ConfirmSubmitButton
        className="primary"
        disabled={!selected.length}
        message={`選択した${selected.length}名へ${role === "super_admin" ? "最高情報責任者" : "管理者"}権限を付与しますか？`}
      >
        権限を付与
      </ConfirmSubmitButton>
    </form>
  );
}

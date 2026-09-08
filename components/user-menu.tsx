import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { logout } from "@/app/actions";
import { ConfirmSubmitButton } from "./confirm-submit-button";

export function UserMenu({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  return (
    <details className="user-menu">
      <summary className={`avatar${avatarUrl ? " has-image" : ""}`} aria-label="アカウントメニューを開く">
        <span className="avatar-content">{avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Public Supabase avatar URLs are already resized by CSS and must support the configured project host.
          <img src={avatarUrl} alt="" />
        ) : name.slice(0, 1)}</span>
      </summary>
      <div className="user-menu-panel">
        <p>{name}さん</p>
        <Link href="/profile"><UserRound />プロフィール編集</Link>
        <form action={logout} className="mobile-logout-form">
          <ConfirmSubmitButton message="ログアウトしますか？"><LogOut />ログアウト</ConfirmSubmitButton>
        </form>
      </div>
    </details>
  );
}

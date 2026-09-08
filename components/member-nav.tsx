import Link from "next/link";
import { CalendarDays, CircleHelp, Home, UserRound } from "lucide-react";

const items = [
  { id: "home", href: "/home", label: "ホーム", icon: Home },
  { id: "events", href: "/events", label: "イベント", icon: CalendarDays },
  { id: "faq", href: "/faq", label: "FAQ", icon: CircleHelp },
  { id: "profile", href: "/profile", label: "プロフィール", icon: UserRound },
] as const;

export function MemberNav({ active }: { active: "home" | "events" | "faq" | "profile" }) {
  const links = items.map(({ id, href, label, icon: Icon }) => <Link
    aria-current={active === id ? "page" : undefined}
    className={active === id ? "active" : ""}
    href={href}
    key={id}
  >
    <Icon aria-hidden="true" />
    <span>{label}</span>
  </Link>);

  return <>
    <nav className="member-tabs" aria-label="会員メニュー">{links}</nav>
    <nav className="bottom-nav" aria-label="会員メニュー">{links}</nav>
  </>;
}

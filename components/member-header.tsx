import { Brand } from "./brand";
import { MemberNav } from "./member-nav";
import { UserMenu } from "./user-menu";

export function MemberHeader({ active, name, avatarUrl }: {
  active: "home" | "events" | "faq" | "profile";
  name: string;
  avatarUrl?: string | null;
}) {
  return <>
    <header className="member-header">
      <Brand />
      <UserMenu name={name} avatarUrl={avatarUrl} />
    </header>
    <MemberNav active={active} />
  </>;
}

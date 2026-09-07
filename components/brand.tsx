import Link from "next/link";
import { TennisBallIcon } from "./tennis-ball-icon";

export function Brand({ linked = true }: { linked?: boolean }) {
  const content = <><span className="brand-mark"><TennisBallIcon /></span><span>Fortylove</span></>;
  return linked
    ? <Link href="/" className="brand" aria-label="ホームへ戻る">{content}</Link>
    : <span className="brand">{content}</span>;
}

"use client";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function Progress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setPending(false);
  }, [pathname, search]);
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    function navigate(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, location.href);
      if (
        url.origin !== location.origin ||
        (url.pathname === location.pathname && url.search === location.search)
      )
        return;
      setPending(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setPending(false), 15000);
    }
    // Next Link prevents the default action during bubbling; observe the click first.
    document.addEventListener("click", navigate, true);
    return () => {
      document.removeEventListener("click", navigate, true);
      clearTimeout(timeout);
    };
  }, []);
  return pending ? (
    <div className="navigation-progress" role="status">
      <span />
      <p>ページを読み込んでいます…</p>
    </div>
  ) : null;
}
export function NavigationFeedback() {
  return (
    <Suspense>
      <Progress />
    </Suspense>
  );
}

"use client";

import { type MouseEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Brand } from "./brand";

export function AdminMobileMenu({ children }: { children: ReactNode }) {
  const id = useId();
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const menu = dialog.current;
    if (!menu) return;
    menu.close();
    const mobile = window.matchMedia("(max-width: 800px)");
    function onResize() {
      if (!mobile.matches) menu?.close();
    }
    mobile.addEventListener("change", onResize);
    return () => mobile.removeEventListener("change", onResize);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  function openMenu() {
    if (!dialog.current || dialog.current.open) return;
    setClosing(false);
    dialog.current.showModal();
    closeButton.current?.focus();
    setOpen(true);
  }

  function closeOnLink(event: MouseEvent<HTMLDialogElement>) {
    if (event.target instanceof Element && event.target.closest("a[href]")) {
      dialog.current?.close();
    }
  }

  return (
    <div className="admin-mobile-menu">
      <div className="admin-menu-header">
        <Brand />
        <button
          ref={trigger}
          type="button"
          className={`admin-menu-toggle${closing ? " is-closing" : ""}`}
          aria-controls={id}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={openMenu}
        >
          <MenuMark />
          <span>メニュー</span>
        </button>
      </div>
      <dialog
        id={id}
        ref={dialog}
        className="admin-menu-dialog"
        aria-label="管理メニュー"
        onClick={closeOnLink}
        onClose={() => {
          if (dialog.current?.open) return;
          setOpen(false);
          setClosing(true);
          trigger.current?.focus({ preventScroll: true });
        }}
      >
        <div className="admin-menu-header">
          <Brand />
          <button
            ref={closeButton}
            type="button"
            className="admin-menu-toggle is-open"
            onClick={() => dialog.current?.close()}
            aria-label="メニューを閉じる"
          >
            <MenuMark />
            <span>閉じる</span>
          </button>
        </div>
        {children}
      </dialog>
    </div>
  );
}

function MenuMark() {
  return (
    <span className="admin-menu-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

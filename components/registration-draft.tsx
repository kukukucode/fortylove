"use client";

import { useEffect } from "react";
import {
  parseRegistrationDraft,
  REGISTRATION_DRAFT_KEY,
  registrationDraftFromFormData,
} from "@/lib/registration-draft";

export { REGISTRATION_DRAFT_KEY } from "@/lib/registration-draft";

export function RegistrationDraftKeeper() {
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>("#registration-form");
    if (!form) return;
    const saved = sessionStorage.getItem(REGISTRATION_DRAFT_KEY);
    const values = parseRegistrationDraft(saved);
    if (saved) {
      // 旧形式にpassword等が含まれていても、最初の読込時にallowlist形式へ置き換える。
      sessionStorage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(values));
      requestAnimationFrame(() => {
        for (const element of Array.from(form.elements)) {
          if (!(
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement
          ))
            continue;
          if (
            !element.name ||
            element.type === "hidden" ||
            element.name.endsWith("_choice") ||
            element.name.startsWith("custom_")
          )
            continue;
          const restoredValue = Reflect.get(values, element.name);
          if (typeof restoredValue === "string") element.value = restoredValue;
        }
      });
    }
    const save = () => {
      const safeValues = registrationDraftFromFormData(new FormData(form));
      sessionStorage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(safeValues));
    };
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    return () => {
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
    };
  }, []);
  return null;
}

export function ClearRegistrationDraft() {
  useEffect(() => {
    sessionStorage.removeItem(REGISTRATION_DRAFT_KEY);
  }, []);
  return null;
}

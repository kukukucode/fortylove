"use client";

export function SelectAllCheckbox({ formId, name }: { formId: string; name: string }) {
  return (
    <input
      type="checkbox"
      aria-label="すべて選択"
      onChange={(event) => {
        document
          .querySelectorAll<HTMLInputElement>(
            `#${formId} input[name="${name}"], input[form="${formId}"][name="${name}"]`,
          )
          .forEach((checkbox) => {
            checkbox.checked = event.target.checked;
          });
      }}
    />
  );
}

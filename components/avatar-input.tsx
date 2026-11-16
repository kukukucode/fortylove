"use client";

import { useState } from "react";

const MAX_SIDE = 512;

export function AvatarInput() {
  const [status, setStatus] = useState("選択した画像は正方形にトリミング・圧縮されます");

  return (
    <label className="full">
      プロフィール画像（任意）
      <input
        name="avatar"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={async (event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (!file) return;
          setStatus("画像を圧縮しています…");

          try {
            const bitmap = await createImageBitmap(file);
            const sourceSize = Math.min(bitmap.width, bitmap.height);
            const sourceX = Math.round((bitmap.width - sourceSize) / 2);
            const sourceY = Math.round((bitmap.height - sourceSize) / 2);
            const outputSize = Math.min(MAX_SIDE, sourceSize);
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, outputSize);
            canvas.height = Math.max(1, outputSize);
            canvas
              .getContext("2d")
              ?.drawImage(
                bitmap,
                sourceX,
                sourceY,
                sourceSize,
                sourceSize,
                0,
                0,
                canvas.width,
                canvas.height,
              );
            bitmap.close();

            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/webp", 0.82),
            );
            if (!blob) throw new Error("compression failed");

            const compressed = new File([blob], "avatar.webp", { type: "image/webp" });
            const files = new DataTransfer();
            files.items.add(compressed);
            input.files = files.files;
            setStatus(
              `正方形にトリミング・圧縮済み（${Math.max(1, Math.round(compressed.size / 1024))}KB）`,
            );
          } catch {
            setStatus("圧縮できなかったため元の画像を使用します（2MBまで）");
          }
        }}
      />
      <small>{status}</small>
    </label>
  );
}

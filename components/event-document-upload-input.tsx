"use client";

import { useEffect, useRef, useState } from "react";
import { EVENT_DOCUMENT_MAX_LABEL, validateEventDocumentFile } from "@/lib/event-document-policy";

type UploadState = "idle" | "uploading" | "ready" | "error";

export function EventDocumentUploadInput({ optional = false }: { optional?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadedPath, setUploadedPath] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const [message, setMessage] = useState("");
  const uploadStateRef = useRef<UploadState>("idle");

  useEffect(() => {
    uploadStateRef.current = uploadState;
  }, [uploadState]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const preventWhileUploading = (event: SubmitEvent) => {
      if (uploadStateRef.current !== "uploading") return;
      event.preventDefault();
      setMessage("PDFのアップロード完了を待ってから保存してください。");
    };
    form.addEventListener("submit", preventWhileUploading);
    return () => form.removeEventListener("submit", preventWhileUploading);
  }, []);

  async function upload(file: File | undefined) {
    setUploadedPath("");
    setUploadedName("");
    if (!file) {
      setUploadState("idle");
      setMessage("");
      return;
    }
    const validationError = validateEventDocumentFile(file);
    if (validationError) {
      setUploadState("error");
      setMessage(
        validationError === "size"
          ? `PDFは${EVENT_DOCUMENT_MAX_LABEL}以下にしてください。`
          : "PDF形式のファイルを選択してください。",
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploadState("uploading");
    setMessage("PDFをアップロードしています…");
    try {
      const tokenResponse = await fetch("/api/admin/event-document-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, fileType: file.type }),
      });
      if (!tokenResponse.ok) throw new Error("token");
      const token = (await tokenResponse.json()) as { signedUrl: string; path: string };
      const uploadBody = new FormData();
      uploadBody.append("cacheControl", "3600");
      uploadBody.append("", file);
      const uploadResponse = await fetch(token.signedUrl, {
        method: "PUT",
        headers: { "x-upsert": "false" },
        body: uploadBody,
      });
      if (!uploadResponse.ok) throw new Error("upload");
      setUploadedPath(token.path);
      setUploadedName(file.name);
      setUploadState("ready");
      setMessage("アップロードが完了しました。フォームを保存してください。");
    } catch {
      setUploadState("error");
      setMessage(
        "PDFをアップロードできませんでした。通信状態を確認して、もう一度選択してください。",
      );
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <label className="full">
      関連資料（PDF・{optional ? "任意・" : ""}
      {EVENT_DOCUMENT_MAX_LABEL}まで）
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      <input type="hidden" name="document_upload_state" value={uploadState} />
      <input type="hidden" name="document_path" value={uploadedPath} />
      <input type="hidden" name="document_name" value={uploadedName} />
      <small aria-live="polite">
        {message || "ファイルはSupabaseへ直接、安全にアップロードされます。"}
      </small>
    </label>
  );
}

"use client";

import dynamic from "next/dynamic";

// PDF.js requires DOMMatrix/Canvas, which are browser APIs even for a Client Component's SSR pass.
const Viewer = dynamic(() => import("./pdf-viewer-client"), {
  ssr: false,
  loading: () => <span role="status">資料ビューアーを準備しています…</span>,
});
export function PdfViewer(props: { title: string; fileName: string; url: string }) {
  return <Viewer {...props} />;
}

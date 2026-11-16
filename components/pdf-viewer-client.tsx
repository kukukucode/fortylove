"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, X } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default function PdfViewerClient({
  title,
  fileName,
  url,
}: {
  title: string;
  fileName: string;
  url: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [pageSize, setPageSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    updateSize();
    return () => observer.disconnect();
  }, []);

  const availableWidth = Math.max(stageSize.width - 16, 1);
  const availableHeight = Math.max(stageSize.height - 16, 1);
  const scale = Math.min(availableWidth / pageSize.width, availableHeight / pageSize.height);

  return (
    <>
      <button
        className="event-document-button"
        type="button"
        onClick={() => {
          setPageNumber(1);
          dialogRef.current?.showModal();
        }}
      >
        <FileText />
        資料を見る
      </button>
      <dialog
        className="pdf-dialog"
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        <div className="pdf-modal">
          <header>
            <div>
              <strong>{title}</strong>
              <small>{fileName}</small>
            </div>
            <div>
              <a href={url} target="_blank" rel="noreferrer noopener" aria-label="別タブで開く">
                <ExternalLink />
              </a>
              <button type="button" aria-label="閉じる" onClick={() => dialogRef.current?.close()}>
                <X />
              </button>
            </div>
          </header>
          <div className="pdf-page-stage" ref={stageRef}>
            <Document
              file={url}
              loading={<p>PDFを読み込んでいます…</p>}
              error={<p>PDFを表示できませんでした。別タブで開いてください。</p>}
              onLoadSuccess={({ numPages }) => setPageCount(numPages)}
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={(page) => {
                  const viewport = page.getViewport({ scale: 1 });
                  setPageSize({ width: viewport.width, height: viewport.height });
                }}
              />
            </Document>
          </div>
          {pageCount > 1 && (
            <footer className="pdf-page-controls">
              <button
                type="button"
                aria-label="前のページ"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((page) => Math.max(page - 1, 1))}
              >
                <ChevronLeft />
              </button>
              <span>
                {pageNumber} / {pageCount}
              </span>
              <button
                type="button"
                aria-label="次のページ"
                disabled={pageNumber >= pageCount}
                onClick={() => setPageNumber((page) => Math.min(page + 1, pageCount))}
              >
                <ChevronRight />
              </button>
            </footer>
          )}
        </div>
      </dialog>
    </>
  );
}

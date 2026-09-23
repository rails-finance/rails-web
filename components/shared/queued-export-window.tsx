"use client";

// The window a large CSV export opens (rails-ops decision 0029). It requests
// the export once, on open, then shows the job: "Export requested: preparing
// your file", and "Your export is ready" with the download. The shell mirrors
// FeedbackModal's (portal, Esc to close, body scroll lock).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QueuedExportPanel } from "@/components/shared/queued-export-panel";
import {
  exportReceiptPath,
  requestQueuedExport,
  storedReceipts,
  type ExportReceipt,
  type QueuedExportRequest,
} from "@/lib/shared/queued-export";

const HEADING_ID = "queued-export-title";

function WindowInner({ request, onClose }: { request: QueuedExportRequest; onClose: () => void }) {
  const [receipt, setReceipt] = useState<ExportReceipt | null>(null);
  const [refusal, setRefusal] = useState<{ message: string; earlier: ExportReceipt | null } | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    // Once per open, including under React's development double mount.
    if (asked.current) return;
    asked.current = true;
    void requestQueuedExport(request).then((r) => {
      if (r.ok) setReceipt(r.receipt);
      else
        setRefusal({
          message: r.message,
          earlier: r.code === "EXPORT_IN_PROGRESS" ? (storedReceipts()[0] ?? null) : null,
        });
    });
  }, [request]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto" onClick={onClose}>
      <div
        className="fixed inset-0 backdrop-blur-sm pointer-events-none"
        style={{ background: "var(--backdrop-bg)" }}
      />
      <div className="relative min-h-full flex items-start sm:items-center justify-center p-4">
        <div
          className="relative rounded-2xl w-full max-w-md my-8 p-6 shadow-xl border border-rb-200 dark:border-rb-800 flex flex-col gap-5"
          style={{ background: "var(--surface-overlay)" }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={HEADING_ID}
          data-queued-export-window
        >
          <button onClick={onClose} className="absolute top-4 right-4 btn-ghost cursor-pointer" aria-label="Close">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <div className="pr-8">
            {receipt ? (
              <QueuedExportPanel receipt={receipt} totalEvents={request.totalEvents} headingId={HEADING_ID} />
            ) : refusal ? (
              <div className="flex flex-col gap-3" data-export-state="refused">
                <h2 id={HEADING_ID} className="text-xl font-semibold text-foreground">
                  Export not requested
                </h2>
                <p className="text-sm text-rb-500">{refusal.message}</p>
                {refusal.earlier && (
                  <a
                    href={exportReceiptPath(refusal.earlier)}
                    className="text-sm underline underline-offset-2 text-foreground"
                  >
                    The export in progress: {refusal.earlier.fileName}
                  </a>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1" data-export-state="requesting">
                <h2 id={HEADING_ID} className="text-xl font-semibold text-foreground">
                  Requesting the export
                </h2>
                <p className="text-sm text-rb-500">
                  {request.totalEvents
                    ? `${request.totalEvents.toLocaleString("en-US")} events, more than the page builds in the browser.`
                    : "The whole history, built from the Rails index."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function QueuedExportWindow(props: { request: QueuedExportRequest; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<WindowInner {...props} />, document.body);
}

"use client";

// The body of a queued CSV export (rails-ops decision 0029), shared by the
// window the export menu opens and the receipt page its link leads to
// (/export/[id]). It polls the job every two seconds until the file is ready,
// then offers the download. The link it shows is the receipt: it works for 24
// hours whether or not the page that requested it stays open.

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  exportDownloadPath,
  exportReceiptPath,
  readExportState,
  type ExportJobState,
  type ExportReceipt,
} from "@/lib/shared/queued-export";

const POLL_MS = 2_000;
const n = (v: number) => v.toLocaleString("en-US");

function bytesLabel(b: number): string {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB compressed`;
  return `${(b / 1024 / 1024).toFixed(1)} MB compressed`;
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export const PRIMARY_BUTTON =
  "block w-full text-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-bold tracking-widest uppercase py-3 rounded-xl transition-colors duration-150 cursor-pointer";

function ReceiptLink({ receipt, lead }: { receipt: ExportReceipt; lead: string }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(exportReceiptPath(receipt));
  useEffect(() => setUrl(`${window.location.origin}${exportReceiptPath(receipt)}`), [receipt]);
  return (
    <div className="flex flex-col gap-1.5" data-export-receipt-link>
      <p className="text-xs text-rb-500">{lead}</p>
      <div className="flex items-stretch gap-2">
        <a
          href={url}
          className="min-w-0 flex-1 truncate rounded-lg border border-rb-200 px-3 py-2 font-mono text-xs text-foreground dark:border-rb-700"
          style={{ background: "var(--surface-field)" }}
        >
          {url}
        </a>
        <button
          type="button"
          className="btn-icon h-auto w-9 border border-rb-200 dark:border-rb-700"
          aria-label="Copy the link"
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            });
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

export function QueuedExportPanel({
  receipt,
  totalEvents,
  headingId,
}: {
  receipt: ExportReceipt;
  /** The position's event count, when the requesting page knew it. */
  totalEvents?: number | null;
  headingId: string;
}) {
  const [state, setState] = useState<ExportJobState | "not-found" | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const s = await readExportState(receipt);
      if (!alive) return;
      if (s) setState(s);
      const done =
        s === "not-found" || (s && (s.status === "ready" || s.status === "failed" || s.status === "expired"));
      if (!done) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [receipt]);

  const heading = (text: string) => (
    <h2 id={headingId} className="text-xl font-semibold text-foreground">
      {text}
    </h2>
  );

  if (state === "not-found") {
    return (
      <div className="flex flex-col gap-3" data-export-state="not-found">
        {heading("No export at this link")}
        <p className="text-sm text-rb-500">The link is incomplete, or it belongs to another export.</p>
      </div>
    );
  }

  const status = state?.status ?? "queued";

  if (status === "ready" && state) {
    const rows = state.rowsWritten ?? 0;
    return (
      <div className="flex flex-col gap-4" data-export-state="ready">
        {heading("Your export is ready")}
        <p className="text-sm text-rb-500">
          {n(rows)} {rows === 1 ? "row" : "rows"}
          {state.bytes != null ? `, ${bytesLabel(state.bytes)}` : ""}. {state.fileName}
        </p>
        <a href={exportDownloadPath(receipt)} className={PRIMARY_BUTTON} data-export-download>
          Download
        </a>
        <ReceiptLink
          receipt={receipt}
          lead={
            state.expiresAt
              ? `The link works until ${whenLabel(state.expiresAt)}, even if this page is closed.`
              : "The link works for 24 hours, even if this page is closed."
          }
        />
        <p className="text-[11px] leading-relaxed text-rb-500">
          One row per event, in the same columns as a smaller download: token amounts, USD value where the event carries
          a price, and balances.
        </p>
      </div>
    );
  }

  if (status === "failed" || status === "expired") {
    return (
      <div className="flex flex-col gap-3" data-export-state={status}>
        {heading(status === "failed" ? "The export could not be built" : "This export has expired")}
        <p className="text-sm text-rb-500">
          {status === "failed"
            ? "Nothing was kept. Request it again from the Copy for LLM menu on the position page."
            : "Files are kept for 24 hours. Request it again from the Copy for LLM menu on the position page."}
        </p>
      </div>
    );
  }

  // Queued or running.
  const written = state?.rowsWritten ?? 0;
  const progress =
    state == null
      ? null
      : status === "queued"
        ? state.queuePosition > 0
          ? `Waiting: ${n(state.queuePosition)} ${state.queuePosition === 1 ? "export" : "exports"} ahead of this one.`
          : "Starting."
        : totalEvents
          ? `${n(Math.min(written, totalEvents))} of ${n(totalEvents)} rows written.`
          : `${n(written)} rows written.`;
  return (
    <div className="flex flex-col gap-4" data-export-state={status}>
      <div>
        {heading("Export requested: preparing your file")}
        <p className="mt-0.5 text-sm text-rb-500">
          {totalEvents ? `${n(totalEvents)} events. ` : ""}The file is built from the Rails index and kept for 24 hours.
        </p>
      </div>
      {progress && (
        <p className="text-sm text-foreground" role="status" data-export-progress>
          {progress}
        </p>
      )}
      <ReceiptLink receipt={receipt} lead="This link works for 24 hours, even if this page is closed." />
    </div>
  );
}

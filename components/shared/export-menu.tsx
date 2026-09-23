"use client";

// Generic "Copy for LLM" export control. A single button + chevron
// (open/closed indicator, matching the listing page's sort control) opens a
// dropdown of export actions, modelled on the affordance Aave use on their docs:
//
//   • Copy Position    → Markdown to clipboard, ready to paste into an LLM
//   • View as Markdown → opens the snapshot as plain text in a new tab
//   • Download CSV     → the activity timeline as a spreadsheet
//
// The caller supplies a `buildMarkdown` thunk (so the snapshot is stamped at
// click time) and the spoke/trove-scoped event list. The Markdown is built from
// what the page already holds; the CSV, on a windowed page, goes and fetches
// the whole history first (`fetchAllEvents`) — the rows ARE that export, so it
// must not hand over the window under a whole-history filename.
// Per-protocol serialization lives next to the caller (e.g.
// lib/liquity/trove-to-markdown.ts, lib/aave-v4/spoke-to-markdown.ts).
//
// A LARGE export is requested instead of built here (rails-ops decision 0029):
// where the caller passes `queued` and the position has more events than
// INSTANT_EXPORT_MAX_EVENTS (or the page does not know how many), "Download
// CSV" opens <QueuedExportWindow>, which asks rails-server to build the file
// and hands the reader a link to collect it within 24 hours.

import { useState, useRef, useEffect } from "react";
import { Copy, Check, FileText, Download, ChevronDown } from "lucide-react";
import { eventsToCsv, TokenMetaUnresolvedError } from "@/lib/shared/events-to-csv";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON } from "@/lib/shared/ui-grammar";
import { shouldQueueExport, type QueuedExportRequest } from "@/lib/shared/queued-export";
import dynamic from "next/dynamic";

const QueuedExportWindow = dynamic(
  () => import("@/components/shared/queued-export-window").then((m) => m.QueuedExportWindow),
  { ssr: false },
);

/** What a whole-history fetch came back with. `missing` is the index's own
 *  statement that it could not serve every event — a row ceiling, not an error.
 *  Above zero, the CSV is not written: the position's history exceeds what the
 *  source will serve in one answer, and a short file under a whole-history
 *  filename would be the same wrong claim in a different format. */
export type WholeHistoryFetch = {
  events: BaseActivityEvent[];
  missing: number;
};

type Props = {
  /** Builds the Markdown snapshot. Called at click time so `new Date()` inside
   *  the serializer stamps the moment of export, not of render. */
  buildMarkdown: () => string;
  /** Chronologically sorted events serialized to the CSV download, and the
   *  source the Markdown's bounded tail is taken from. */
  events: BaseActivityEvent[];
  /** Fetches the position's WHOLE history for the CSV, on a page that loaded a
   *  window. The rows are what this export is for, so it goes and gets them
   *  rather than handing over the window under a whole-history filename. The
   *  wait is shown, and neither a failure nor a short answer downloads anything
   *  — a spreadsheet quietly missing a hundred thousand rows is the wrong claim
   *  this page spent a strand removing. Absent means `events` IS the whole
   *  history. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** Accessible label for the trigger. */
  ariaLabel?: string;
  /** What each export carries, when the page drew a window — the sentence sits
   *  under the menu items. The position figures and the CSV are whole-history;
   *  the Markdown's event table is a bounded tail, and says which. */
  scopeNote?: string;
  /** The position's queued export, on a protocol rails-server builds one for.
   *  Used in place of `fetchAllEvents` when the history is over the in-browser
   *  threshold (lib/shared/queued-export.ts). */
  queued?: QueuedExportRequest;
};

function MenuItem({
  icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-rb-200/60 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rb-900/60"
    >
      <span className="mt-0.5 shrink-0 text-rb-500">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block text-xs text-rb-500">{subtitle}</span>
      </span>
    </button>
  );
}

export function ExportMenu({
  buildMarkdown,
  events,
  fetchAllEvents,
  csvFilename,
  ariaLabel = "Export this position",
  scopeNote,
  queued,
}: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [queuedOpen, setQueuedOpen] = useState(false);
  const queue = shouldQueueExport(queued, fetchAllEvents != null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — mirrors the listing sort dropdown.
  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdown());
      // The menu closes on action, so surface the confirmation on the trigger.
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("Failed to copy position markdown:", err);
    }
    setOpen(false);
  };

  const viewMarkdown = () => {
    const blob = new Blob([buildMarkdown()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    // Revoke once the new tab has had time to load the blob.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setOpen(false);
  };

  const downloadCsv = async () => {
    if (queue) {
      setOpen(false);
      setQueuedOpen(true);
      return;
    }
    let rows = events;
    if (fetchAllEvents) {
      setPreparing(true);
      setCsvError(null);
      let fetched;
      try {
        fetched = await fetchAllEvents();
      } catch (err) {
        console.error("Failed to load the whole history for the CSV:", err);
        setPreparing(false);
        setCsvError("The whole history could not be loaded, so nothing was downloaded. Try again.");
        return;
      }
      setPreparing(false);
      if (fetched.missing > 0) {
        setCsvError(
          `The index served ${fetched.events.length.toLocaleString("en-US")} events and could not reach the other ` +
            `${fetched.missing.toLocaleString("en-US")}. Nothing was downloaded — a spreadsheet short of the position ` +
            `would not say so.`,
        );
        return;
      }
      rows = fetched.events;
    }
    // Lead with a UTF-8 BOM so Excel reads non-ASCII token symbols correctly.
    // A page with a queued export writes its family's fixed columns, the same
    // bytes the queued file carries for the same rows.
    let csv: string;
    try {
      csv = "\uFEFF" + eventsToCsv(rows, queued?.protocol);
    } catch (err) {
      if (!(err instanceof TokenMetaUnresolvedError)) throw err;
      setCsvError(
        "A token's details could not be read when this history loaded, so nothing was downloaded. Reload the page and try again.",
      );
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const hasEvents = events.length > 0;

  return (
    <div ref={ref} className="relative" data-export-menu>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={`${CTRL_GHOST} ${open ? CTRL_ON : CTRL_OFF} h-8 gap-2 rounded-md px-3 text-xs font-medium`}
      >
        <span>{copied ? "Copied" : "Copy for LLM"}</span>
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown
            className={`h-3.5 w-3.5 text-rb-500 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          className="overlay-panel absolute right-0 top-full z-50 mt-2 min-w-[260px] overflow-hidden py-1"
          role="menu"
        >
          <MenuItem
            icon={<Copy size={16} />}
            title="Copy Position"
            subtitle="Copy as Markdown for LLMs"
            onClick={copyMarkdown}
          />
          <MenuItem
            icon={<FileText size={16} />}
            title="View as Markdown"
            subtitle="View this position as plain text"
            onClick={viewMarkdown}
          />
          <MenuItem
            icon={<Download size={16} />}
            title="Download CSV"
            subtitle={
              preparing
                ? "Loading the whole history…"
                : queue
                  ? "Every event, prepared as a file to collect"
                  : fetchAllEvents
                    ? "Every event as a spreadsheet"
                    : "Activity timeline as a spreadsheet"
            }
            onClick={() => void downloadCsv()}
            disabled={!hasEvents || preparing}
          />
          {csvError && (
            <p className="px-3 pb-1 pt-1 text-[11px] leading-relaxed text-rb-500" role="status">
              {csvError}
            </p>
          )}
          {scopeNote && (
            <p
              data-export-scope-note
              className="border-t border-rb-200 px-3 pb-1 pt-2 text-[11px] leading-relaxed text-rb-500 dark:border-rb-800"
            >
              {scopeNote}
            </p>
          )}
        </div>
      )}
      {queuedOpen && queued && <QueuedExportWindow request={queued} onClose={() => setQueuedOpen(false)} />}
    </div>
  );
}

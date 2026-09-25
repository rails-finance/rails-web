"use client";

// The position's export shapes, carried as rows of the shared Tools menu
// (components/shared/tools-menu.tsx) under the provenance inspector's toggle.
// Until 2026-09-25 this was its own "Copy for LLM" trigger beside the back
// button; the shapes are the same, modelled on the affordance Aave use on
// their docs:
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

import { useState } from "react";
import { Copy, FileText, Download } from "lucide-react";
import { eventsToCsv, TokenMetaUnresolvedError } from "@/lib/shared/events-to-csv";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { ToolsMenu, ToolsMenuItem } from "@/components/shared/tools-menu";
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

export function ExportMenu({
  buildMarkdown,
  events,
  fetchAllEvents,
  csvFilename,
  ariaLabel = "Export this position",
  scopeNote,
  queued,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [queuedOpen, setQueuedOpen] = useState(false);
  const queue = shouldQueueExport(queued, fetchAllEvents != null);

  const copyMarkdown = async (close: () => void) => {
    try {
      await navigator.clipboard.writeText(buildMarkdown());
      // The menu closes on action, so surface the confirmation on the trigger.
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("Failed to copy position markdown:", err);
    }
    close();
  };

  const viewMarkdown = (close: () => void) => {
    const blob = new Blob([buildMarkdown()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    // Revoke once the new tab has had time to load the blob.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    close();
  };

  const downloadCsv = async (close: () => void) => {
    if (queue) {
      close();
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
    close();
  };

  const hasEvents = events.length > 0;

  return (
    <>
      <ToolsMenu ariaLabel={ariaLabel} copied={copied}>
        {(close) => (
          <>
            <ToolsMenuItem
              icon={<Copy size={16} />}
              title="Copy Position"
              subtitle="Copy as Markdown for LLMs"
              onClick={() => void copyMarkdown(close)}
            />
            <ToolsMenuItem
              icon={<FileText size={16} />}
              title="View as Markdown"
              subtitle="View this position as plain text"
              onClick={() => viewMarkdown(close)}
            />
            <ToolsMenuItem
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
              onClick={() => void downloadCsv(close)}
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
          </>
        )}
      </ToolsMenu>
      {queuedOpen && queued && <QueuedExportWindow request={queued} onClose={() => setQueuedOpen(false)} />}
    </>
  );
}

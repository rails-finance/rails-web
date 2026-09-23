// The queued CSV export (rails-ops decision 0029). A small export is built in
// the browser, as it always was; above INSTANT_EXPORT_MAX_EVENTS the export is
// REQUESTED instead: rails-server builds the file from the timeline route's
// own rows, keeps it for 24 hours, and the reader collects it from a link that
// works whether or not the page stays open.
//
// The box's file is the served rows themselves — one line per row the
// timeline route serves, one column per field. The reader never sees it: the
// download proxy formats it as it streams, with this deployment's transform
// and the in-browser file's columns (lib/sources/api/queued-export-format.ts).

/** Above this many events the CSV is requested rather than built in the
 *  browser. Measured 2026-09-21 on the onboarding box: the Aave V3 whole-history answer
 *  of 0xee7c…2954 (Core, 7,150 events) is 10.0 MB and 3.7 s at the box before
 *  this deployment transforms it; at 5,000 events the in-browser path stays
 *  near 7 MB and a few seconds. */
export const INSTANT_EXPORT_MAX_EVENTS = 5_000;

/** Protocols rails-server builds a queued export for
 *  (api/src/services/timeline-export/sources.ts). */
export type QueuedExportProtocol = "aave-v3" | "spark" | "maple" | "compound-v3" | "compound-v2";

export interface QueuedExportRequest {
  protocol: QueuedExportProtocol;
  params: Record<string, string>;
  /** The position's event count, when the page knows it. */
  totalEvents: number | null;
}

export type ExportJobStatus = "queued" | "running" | "ready" | "failed" | "expired";

export interface ExportJobState {
  id: string;
  status: ExportJobStatus;
  fileName: string;
  rowsWritten: number | null;
  bytes: number | null;
  queuePosition: number;
  readyAt: string | null;
  expiresAt: string | null;
}

export interface ExportReceipt {
  id: string;
  token: string;
  fileName: string;
  requestedAt: string;
}

/** The receipt page: the link the window shows. It works for 24 hours. */
export const exportReceiptPath = (r: Pick<ExportReceipt, "id" | "token">) =>
  `/export/${r.id}?token=${encodeURIComponent(r.token)}`;

export const exportDownloadPath = (r: Pick<ExportReceipt, "id" | "token">) =>
  `/api/exports/${r.id}/download?token=${encodeURIComponent(r.token)}`;

/** Whether this click requests the file rather than building it here. Only a
 *  page that drew a window (it has a whole-history fetch) and whose total is
 *  over the threshold, or not known, is queued. */
export function shouldQueueExport(queued: QueuedExportRequest | undefined, windowed: boolean): boolean {
  if (!queued || !windowed) return false;
  return queued.totalEvents == null || queued.totalEvents > INSTANT_EXPORT_MAX_EVENTS;
}

export type RequestResult = { ok: true; receipt: ExportReceipt } | { ok: false; message: string; code?: string };

/** The refusals, in the words the window uses. */
function refusalMessage(status: number, code: string | undefined, limit: number | undefined): string {
  if (code === "EXPORT_IN_PROGRESS" || status === 409)
    return "An export is already being prepared for you. When it is ready, request this one.";
  if (code === "EXPORT_DAILY_LIMIT" || status === 429)
    return `The limit is ${limit ?? 10} exports a day. Try again tomorrow.`;
  if (code === "EXPORT_QUEUE_FULL" || code === "EXPORT_DISK_FULL" || status === 503)
    return "Exports are paused for now. Try again later.";
  return "The export could not be requested. Try again.";
}

export async function requestQueuedExport(req: QueuedExportRequest): Promise<RequestResult> {
  try {
    const res = await fetch("/api/exports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocol: req.protocol, params: req.params }),
    });
    const body = (await res.json().catch(() => null)) as {
      id?: string;
      token?: string;
      fileName?: string;
      code?: string;
      limit?: number;
    } | null;
    if (res.status === 202 && body?.id && body.token) {
      const receipt: ExportReceipt = {
        id: body.id,
        token: body.token,
        fileName: body.fileName ?? "activity.csv",
        requestedAt: new Date().toISOString(),
      };
      rememberReceipt(receipt);
      return { ok: true, receipt };
    }
    return { ok: false, code: body?.code, message: refusalMessage(res.status, body?.code, body?.limit) };
  } catch {
    return { ok: false, message: "The export could not be requested. Try again." };
  }
}

export async function readExportState(
  r: Pick<ExportReceipt, "id" | "token">,
): Promise<ExportJobState | "not-found" | null> {
  try {
    const res = await fetch(`/api/exports/${r.id}?token=${encodeURIComponent(r.token)}`, { cache: "no-store" });
    if (res.status === 404) return "not-found";
    if (!res.ok) return null;
    return (await res.json()) as ExportJobState;
  } catch {
    return null;
  }
}

// ── the reader's own receipts, in this browser ───────────────────────────────
// Kept so a second request that the box refuses ("one at a time") can point at
// the export already being prepared. Nothing else reads them.

const STORE_KEY = "rails:export-receipts";
const DAY_MS = 24 * 60 * 60 * 1000;

export function storedReceipts(): ExportReceipt[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as ExportReceipt[];
    const cutoff = Date.now() - DAY_MS - 60 * 60 * 1000;
    return Array.isArray(raw) ? raw.filter((r) => r?.id && r?.token && Date.parse(r.requestedAt) > cutoff) : [];
  } catch {
    return [];
  }
}

function rememberReceipt(r: ExportReceipt): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([r, ...storedReceipts().filter((x) => x.id !== r.id)].slice(0, 10)));
  } catch {
    // Private mode or storage refused: the window still shows the link.
  }
}

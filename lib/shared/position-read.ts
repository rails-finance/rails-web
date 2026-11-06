// The read behind a position card's current figures: its block and time, as
// the card states them (rails-ops TO-DO-ui-jobs 512). The server render names
// the read it made; a family's live read in the browser replaces it when its
// figures replace the server's (components/shared/position-read.tsx).
//
// Client-safe: types and words only. The server's reads are
// lib/shared/position-read-server.ts.

/** Which read the figures come from.
 *  - `index`: rails-server's index, the newest block it holds (Ethereum, Base).
 *  - `chain`: a read of the chain at a named block (the web's own, or
 *    rails-server's head routes).
 *  - `stored`: rails-server's stored read, served because the latest read failed.
 *  - `latest`: a read at the chain's latest block whose answer names no block. */
export type PositionReadKind = "index" | "chain" | "stored" | "latest";

export interface PositionRead {
  kind: PositionReadKind;
  /** The block read; null only for `latest`. */
  block: number | null;
  /** Unix seconds: the block's time, or when the read was made where that is all the answer names.
   *  Null while a block's time is unknown: the server looks it up before it renders
   *  (position-read-server.ts `timedRead`), the browser asks `/api/chain/block-time`. */
  at: number | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "5 Nov 2026 23:37 UTC": the same on the server and in the browser. */
export function readTimeText(at: number): string {
  const d = new Date(at * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** The stamp's words around the block: "Indexed to block", the block, then ", 5 Nov 2026 23:37 UTC". */
export function positionReadWords(r: PositionRead): { lead: string; tail: string } {
  const when = r.at == null ? null : readTimeText(r.at);
  if (when == null)
    return {
      lead: r.kind === "stored" ? "Stored read at block" : r.kind === "index" ? "Indexed to block" : "Read at block",
      tail: "",
    };
  switch (r.kind) {
    case "index":
      return { lead: "Indexed to block", tail: `, ${when}` };
    case "chain":
      return { lead: "Read at block", tail: `, ${when}` };
    case "stored":
      return { lead: "Stored read at block", tail: `, ${when}; the latest read failed` };
    case "latest":
      return { lead: `Read at the chain head, ${when}`, tail: "" };
  }
}

/** Whether two reads are the same statement. */
export const sameRead = (a: PositionRead | null, b: PositionRead | null): boolean =>
  a === b || (a != null && b != null && a.kind === b.kind && a.block === b.block && a.at === b.at);

/** A chain read at `block`, timed where `at` (unix seconds or ISO) is given, else untimed. Null with no block. */
export function chainRead(
  block: number | null | undefined,
  at: number | string | null | undefined,
  stored = false,
): PositionRead | null {
  const t = typeof at === "string" ? Date.parse(at) / 1000 : at;
  if (block == null || !Number.isFinite(block)) return null;
  return {
    kind: stored ? "stored" : "chain",
    block,
    at: t != null && Number.isFinite(t) && t > 0 ? Math.floor(t) : null,
  };
}

/** A head read's answer as a card's read: the stored row's block where it was
 *  served from one, else the block read, timed by the answer's block time and
 *  untimed where it names none (a refresher row can be minutes old, so its
 *  arrival is not its time). Null for a stub or no block. */
export function readOfHeadAnswer(
  answer:
    | {
        blockNumber?: number | null;
        atBlock?: number | null;
        timestamp?: number | null;
        blockTimestamp?: number | null;
        chainStale?: boolean;
        head?: { blockTime: number } | null;
        stored?: { blockNumber: number; refreshedAt: string | null } | null;
      }
    | null
    | undefined,
): PositionRead | null {
  if (!answer || answer.chainStale) return null;
  if (answer.stored) return chainRead(answer.stored.blockNumber, answer.stored.refreshedAt, true);
  const at = answer.head?.blockTime || answer.timestamp || answer.blockTimestamp || null;
  return chainRead(answer.blockNumber ?? answer.atBlock, at);
}

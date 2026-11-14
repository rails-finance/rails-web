"use client";

// The read behind a position card's current figures, stated in the card
// (rails-ops TO-DO-ui-jobs 512): "Indexed to block 26,351,969, 5 Nov 2026
// 23:37 UTC". The page's server half names the read it rendered from
// (`PositionReadProvider`), so the stamp is in the served HTML; a family whose
// live read in the browser replaces the figures reports that read
// (`useReportPositionRead`) and the stamp follows it. A read that names its
// block but not the block's time states the block alone until
// `/api/chain/block-time` answers. No provider, no stamp:
// a page that does not know its block states none.
//
// The stamp stays quotable; the figures beside it carry `data-nosnippet`
// (position-card.tsx).

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl } from "@/lib/shared/chains";
import { positionReadWords, sameRead, type PositionRead } from "@/lib/shared/position-read";
import { AimGate } from "@/components/shared/aim-gate";
import { rowAssetKeys } from "@/lib/shared/focus-row-keys";

interface ReadStore {
  read: PositionRead | null;
  report: (read: PositionRead) => void;
}

const PositionReadContext = createContext<ReadStore | null>(null);

/** The page's read. Key it with the view, so a navigation to another position starts from that page's read. */
export function PositionReadProvider({
  read,
  children,
  focus,
}: {
  read: PositionRead | null;
  children: ReactNode;
  /** Focus (ui-jobs 557): the position the page loaded, whose token addresses
   *  (lib/shared/focus-row-keys.ts) decide whether it is in focus. A position
   *  outside the focus is gated whole; one inside shows whole, its events
   *  included. A position with no token Rails can read is not gated. */
  focus?: { source: unknown; what?: string };
}) {
  const chainId = useChainId();
  const [live, setLive] = useState<PositionRead | null>(null);
  const [times, setTimes] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [report] = useState(() => (r: PositionRead) => setLive((prev) => (sameRead(prev, r) ? prev : r)));
  const shown = live ?? read;
  const untimed = shown && shown.at == null ? shown.block : null;
  useEffect(() => {
    if (untimed == null || times.has(untimed)) return;
    const ctl = new AbortController();
    fetch(`/api/chain/block-time?chain=${chainId}&block=${untimed}`, { signal: ctl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ blockTimestamp?: number }>) : null))
      .then((d) => {
        const at = d?.blockTimestamp;
        if (typeof at === "number") setTimes((m) => new Map(m).set(untimed, at));
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [chainId, untimed, times]);
  const timed =
    shown && shown.at == null && shown.block != null ? { ...shown, at: times.get(shown.block) ?? null } : shown;
  const keys = focus ? rowAssetKeys(focus.source, chainId) : [];
  return (
    <PositionReadContext.Provider value={{ read: timed, report }}>
      {keys.length > 0 ? (
        <AimGate keys={keys} chain={chainId} what={focus?.what ?? "This position"}>
          {children}
        </AimGate>
      ) : (
        children
      )}
      <PositionReadReceipt />
    </PositionReadContext.Provider>
  );
}

/** A family's live read, once its figures stand on it; null or undefined leaves the stamp as it is. */
export function useReportPositionRead(read: PositionRead | null | undefined): void {
  const store = useContext(PositionReadContext);
  const report = store?.report;
  const kind = read?.kind;
  const block = read?.block;
  const at = read?.at;
  useEffect(() => {
    if (report && kind != null) report({ kind, block: block ?? null, at: at ?? null });
  }, [report, kind, block, at]);
}

/** The read in words, its block linking to the chain's explorer. */
function ReadWords({ read }: { read: PositionRead }) {
  const chainId = useChainId();
  const { lead, tail } = positionReadWords(read);
  return (
    <>
      {lead}
      {read.block != null && (
        <>
          {" "}
          <a
            href={explorerUrl(chainId, "block", read.block)}
            target="_blank"
            rel="noopener"
            className="rounded-sm hover:text-foreground focus-ring"
          >
            {read.block.toLocaleString("en-US")}
          </a>
        </>
      )}
      {tail}
    </>
  );
}

/** The stamp, muted, in the card's heading row: drawn only for a stored read,
 *  to say the latest read failed. Otherwise H6 beside it states the read's age,
 *  block and time (Miles, 12 Nov 2026; ui-jobs 602). */
export function PositionReadStamp() {
  const read = useContext(PositionReadContext)?.read;
  if (!read || read.kind !== "stored") return null;
  return (
    <span
      className="text-[11px] text-rb-500 tabular-nums"
      data-anatomy="C5.1"
      data-position-read={read.kind}
      data-position-read-block={read.block ?? undefined}
      // The block and the time are the read's own coordinates.
      data-prov-exempt
    >
      <ReadWords read={read} />
    </span>
  );
}

/** The page's receipt, one muted line at the foot of the page above the footer:
 *  the read behind the figures in full, in the served HTML, quotable where the
 *  figures carry `data-nosnippet` (Miles, 12 Nov 2026; ui-jobs 602). */
function PositionReadReceipt() {
  const read = useContext(PositionReadContext)?.read;
  if (!read) return null;
  return (
    <p
      className="mt-16 text-[11px] text-rb-500 tabular-nums"
      data-anatomy="C5.2"
      data-position-read-receipt={read.kind}
      data-position-read-block={read.block ?? undefined}
      data-prov-exempt
    >
      <ReadWords read={read} />.
    </p>
  );
}

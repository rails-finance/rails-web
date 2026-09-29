"use client";

// The card's line naming a wallet's other Trove lives. One address holds one
// Trove at a time, and each Trove it opens after closing one is a separate
// life with its own page (`?epoch=`), so without this line a reader on one
// life has no sign that the wallet had another: "Life 2 of 2 · earlier life
// 13 Oct – 29 Nov 2023, fully redeemed", the dates linking to that life.

import Link from "next/link";
import { formatDate, formatDayMonth } from "@/lib/date";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLiquityV1Event } from "@/lib/shared/types/event-shape";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";

export interface LiquityV1Life {
  epoch: number;
  /** Unix seconds of the life's first event; null when none is loaded. */
  openedAt: number | null;
  /** Unix seconds of its last event (the close, for a closed life). */
  lastAt: number;
  ending: "open" | "closed by its owner" | "fully redeemed" | "liquidated";
}

/** Every life of the wallet, oldest first, from the roster and the whole
 *  timeline (a wallet with more than one life always holds its whole history
 *  on this page). */
export function liquityV1Lives(summaries: LiquityV1PositionSummary[], events: BaseActivityEvent[]): LiquityV1Life[] {
  const rows = events.filter(isLiquityV1Event);
  return [...summaries]
    .sort((a, b) => a.epoch - b.epoch)
    .map((s) => {
      const own = rows.filter((e) => e.context.data.epoch === s.epoch);
      const last = own.length > 0 ? own.reduce((a, b) => (b.blockNumber >= a.blockNumber ? b : a)) : null;
      const redeemedOut = last?.context.data.eventType === "redemption" && Number(last.context.data.debtAfter) <= 1e-9;
      return {
        epoch: s.epoch,
        openedAt: own.length > 0 ? Math.min(...own.map((e) => e.timestamp)) : null,
        lastAt: s.lastActivityAt,
        ending:
          s.status === "open"
            ? "open"
            : s.status === "liquidated"
              ? "liquidated"
              : redeemedOut
                ? "fully redeemed"
                : "closed by its owner",
      };
    });
}

/** "13 Oct – 29 Nov 2023", "16 Jan 2024 – 15 Sep 2026", "from 16 Jan 2024". */
function span(l: LiquityV1Life): string | null {
  if (l.ending === "open") return l.openedAt != null ? `from ${formatDate(l.openedAt)}` : null;
  if (l.openedAt == null) return `ended ${formatDate(l.lastAt)}`;
  const sameYear = new Date(l.openedAt * 1000).getUTCFullYear() === new Date(l.lastAt * 1000).getUTCFullYear();
  return `${sameYear ? formatDayMonth(l.openedAt) : formatDate(l.openedAt)} – ${formatDate(l.lastAt)}`;
}

export function LiquityV1LivesLine({
  wallet,
  lives,
  epoch,
}: {
  wallet: string;
  lives: LiquityV1Life[];
  /** The life this page shows. */
  epoch: number;
}) {
  const at = lives.findIndex((l) => l.epoch === epoch);
  if (lives.length < 2 || at < 0) return null;
  const others = lives
    .map((l, i) => ({ l, i }))
    .filter(({ i }) => i !== at)
    .map(({ l, i }) => {
      const when = span(l);
      return (
        <span key={l.epoch}>
          {" · "}
          {lives.length > 2 ? `life ${i + 1}` : i < at ? "earlier life" : "later life"}{" "}
          <Link href={`/ethereum/liquity-v1/${wallet}?epoch=${l.epoch}`} className="text-blue-500 hover:underline">
            {when ?? "its page"}
          </Link>
          , {l.ending}
        </span>
      );
    });
  return (
    <p className="mt-3 text-xs text-rb-500" data-trove-lives="">
      Life {at + 1} of {lives.length}
      {others}
    </p>
  );
}

"use client";

// The wallet's liquidity positions (W9; rails-ops decisions/0071): read at visit and streamed in
// after the page (lib/wallet/liquidity/read-liquidity.ts), below the protocol sections (W3).
// Each position is its explorer's card as a listing row inside one link (N2), as W3 draws them:
// Uniswap's and PancakeSwap's, Aerodrome's and Velodrome's with the range at the head block in
// the fourth headline, Balancer's with its share and tokens. Every card is drawn from its owner
// route's answer at the head block. The cards state no dollars, so the section states no total.
// A route or a position that could not be read, a truncated answer, and the positions past the
// route's first 25 are each said under the cards.

import Link from "next/link";
import { use } from "react";
import { WalletPositionCard } from "@/components/wallet/wallet-position-card";
import { UnansweredLine } from "@/components/shared/unanswered-line";
import { useScopedRows } from "@/components/shared/asset-scope-note";
import { walletPositionAssetKeys } from "@/lib/wallet/aim-assets";
import { andList, LIQUIDITY_NO_TOTAL } from "@/lib/wallet/wallet-sections";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import type { LiquiditySourceRead, WalletLiquidity } from "@/lib/wallet/types";

const H2 = "text-sm font-semibold uppercase tracking-wide text-foreground/80";
const LINE = "text-xs text-rb-500";

/** While the routes read: one line where the section will stand. */
export function LiquidityReading() {
  return (
    <p className={LINE} data-wallet-liquidity-reading="">
      Reading liquidity positions at the head block…
    </p>
  );
}

/** A route whose answer holds more rows than it reads at the head: those past them are on the
 *  explorer's wallet page. */
function MoreLine({ s }: { s: LiquiditySourceRead }) {
  const over = s.held - s.drawn - s.failed;
  return (
    <p className={LINE} data-wallet-liquidity-more={s.key}>
      {s.what}: the newest {s.headRows} are drawn; {over} more {over === 1 ? "is" : "are"} on{" "}
      <Link href={s.href} prefetch={false} className={INLINE_LINK}>
        its wallet page
      </Link>
      .
    </p>
  );
}

/** "Velodrome on Optimism", or "2 Uniswap V3 and V4 positions on Ethereum" for rows in an answer. */
const unreadWhat = (s: LiquiditySourceRead) =>
  s.state === "ok" ? `${s.failed} ${s.name} ${s.failed === 1 ? "position" : "positions"} on ${s.chainName}` : s.what;

export function LiquiditySection({ read }: { read: Promise<WalletLiquidity> }) {
  const l = use(read);
  // Focus (ui-jobs 557): a position stays where a token of its pool is in focus.
  const scoped = useScopedRows(l.positions, walletPositionAssetKeys, (p) => p.chain as number);
  const unread = l.sources.filter(
    (s) => s.state === "failed" || s.state === "refused" || (s.state === "ok" && s.failed > 0),
  );
  const ceiling = l.sources.some((s) => s.state === "ceiling");
  const truncated = l.sources.filter((s) => s.state === "ok" && s.truncated);
  const more = l.sources.filter((s) => s.state === "ok" && s.held > s.drawn + s.failed);
  if (l.positions.length === 0 && unread.length === 0 && !ceiling && truncated.length === 0 && more.length === 0)
    return null;
  return (
    <section
      aria-labelledby="wallet-liquidity"
      data-anatomy="W9"
      data-wallet-liquidity={scoped.rows.length}
      data-wallet-liquidity-ms={l.ms}
      data-wallet-liquidity-sources={JSON.stringify(
        l.sources.map((s) => ({ key: s.key, state: s.state, held: s.held, drawn: s.drawn, ms: s.ms })),
      )}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="wallet-liquidity" className={H2}>
          Liquidity{" "}
          <span className="font-medium text-rb-500" data-prov-exempt="">
            {scoped.rows.length}
          </span>
        </h2>
      </div>
      {scoped.rows.length > 0 && (
        <p className={`${LINE} mb-3`} data-wallet-liquidity-note="">
          {LIQUIDITY_NO_TOTAL}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {scoped.rows.map((p) => (
          <WalletPositionCard key={`${p.chain}:${p.family}:${p.positionId}`} position={p} />
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-1">
        {unread.length > 0 && (
          <p className={LINE} data-wallet-liquidity-unanswered={unread.map((s) => s.key).join(",")}>
            {andList(unread.map(unreadWhat))} could not be read.
          </p>
        )}
        {ceiling && (
          <UnansweredLine ceiling className={LINE}>
            {null}
          </UnansweredLine>
        )}
        {truncated.map((s) => (
          <p key={s.key} className={LINE} data-wallet-liquidity-truncated={s.key}>
            {s.what}: the wallet holds more positions than one read takes, so the newest are read.
          </p>
        ))}
        {more.map((s) => (
          <MoreLine key={s.key} s={s} />
        ))}
      </div>
    </section>
  );
}

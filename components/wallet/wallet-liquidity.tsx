"use client";

// The wallet's liquidity positions (W9; rails-ops decisions/0071): read at visit and streamed in
// after the page (lib/wallet/liquidity/read-liquidity.ts), below the protocol sections (W3).
// Each position is its explorer's card as a listing row inside one link (N2), as W3 draws them:
// Uniswap's and PancakeSwap's, Aerodrome's and Velodrome's with the range at the head block in
// the fourth headline, Balancer's with its share and tokens. Every card is drawn from its owner
// route's answer at the head block. The cards state no dollars, so the section states no total.
// A route or a position that could not be read, a truncated answer, and the positions past the
// route's first 25 are each said under the cards; under Focus, those on a chain in focus. A card
// that cannot be drawn drops alone and says so (LiquidityBoundary).

import Link from "next/link";
import { Component, use, type ReactNode } from "react";
import { WalletPositionCard } from "@/components/wallet/wallet-position-card";
import { UnansweredLine } from "@/components/shared/unanswered-line";
import { useScopedRows } from "@/components/shared/asset-scope-note";
import { walletPositionAssetKeys } from "@/lib/wallet/aim-assets";
import { andList, LIQUIDITY_NO_TOTAL, READ_AT_VISIT } from "@/lib/wallet/wallet-sections";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { useAssetScope } from "@/lib/shared/asset-scope";
import { chainMeta } from "@/lib/shared/chains";
import type { LiquiditySourceRead, WalletLiquidity, WalletPosition } from "@/lib/wallet/types";

const H2 = "text-sm font-semibold uppercase tracking-wide text-foreground/80";
const LINE = "text-xs text-rb-500";

/** While the routes read: one line where the section will stand. */
export function LiquidityReading() {
  return (
    <p className={LINE} data-wallet-liquidity-reading="">
      Reading liquidity positions…
    </p>
  );
}

/** A render that throws draws `fallback` in its place: a card built from a row it cannot read
 *  drops alone, and the section, should it throw, leaves the page standing. */
export class LiquidityBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** A card that could not be drawn. */
const cardFailed = (p: WalletPosition) => (
  <p className={LINE} data-wallet-liquidity-card-failed={p.positionId}>
    A {p.familyName} position on {chainMeta(p.chain).name} could not be read.
  </p>
);

/** A route whose answer holds more rows than it reads at the head: those past them are on the
 *  explorer's wallet page. */
function MoreLine({ s }: { s: LiquiditySourceRead }) {
  const over = s.held - s.drawn - s.failed;
  return (
    <p className={LINE} data-wallet-liquidity-more={s.key}>
      {s.what}: the first {s.headRows} are read; {over} more {over === 1 ? "is" : "are"} on{" "}
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

/** What the section draws from one answer: the positions in focus and the routes whose lines it states. */
function useLiquidityView(l: WalletLiquidity) {
  // Focus (ui-jobs 557): a position stays where a token of its pool is in focus.
  const scoped = useScopedRows(l.positions, walletPositionAssetKeys, (p) => p.chain as number);
  // Under Focus, the lines name only the routes on a chain in focus, as W3's do.
  const scope = useAssetScope();
  const focused = scoped.on && !scoped.peek;
  const sources = focused ? l.sources.filter((s) => scope.chainOk(s.chainId)) : l.sources;
  const unread = sources.filter(
    (s) => s.state === "failed" || s.state === "refused" || (s.state === "ok" && s.failed > 0),
  );
  const ceiling = sources.some((s) => s.state === "ceiling");
  const truncated = sources.filter((s) => s.state === "ok" && s.truncated);
  const through = sources.filter((s) => s.state === "ok" && s.foundThrough != null);
  const more = sources.filter((s) => s.state === "ok" && s.held > s.drawn + s.failed);
  const lines = unread.length > 0 || ceiling || truncated.length > 0 || through.length > 0 || more.length > 0;
  return { scoped, unread, ceiling, truncated, through, more, lines };
}

/** `children` once the liquidity read has settled with no position drawn and every route
 *  answered: the empty wallet's sentence (W3), which a listed or unread position would contradict. */
export function WhenLiquidityEmpty({ read, children }: { read: Promise<WalletLiquidity>; children: ReactNode }) {
  const { scoped, lines } = useLiquidityView(use(read));
  return scoped.rows.length === 0 && !lines ? children : null;
}

export function LiquiditySection({ read }: { read: Promise<WalletLiquidity> }) {
  const l = use(read);
  const { scoped, unread, ceiling, truncated, through, more, lines } = useLiquidityView(l);
  if (scoped.rows.length === 0 && !lines) return null;
  return (
    <section
      {...(scoped.rows.length > 0 ? { "aria-labelledby": "wallet-liquidity" } : { "aria-label": "Liquidity" })}
      data-anatomy="W9"
      data-wallet-liquidity={scoped.rows.length}
      data-wallet-liquidity-ms={l.ms}
      data-wallet-liquidity-sources={JSON.stringify(
        l.sources.map((s) => ({ key: s.key, state: s.state, held: s.held, drawn: s.drawn, ms: s.ms })),
      )}
    >
      {/* With no card shown (none held, or none in focus), the lines stand without the heading. */}
      {scoped.rows.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="wallet-liquidity" className={H2}>
              Liquidity{" "}
              <span className="font-medium text-rb-500" data-prov-exempt="">
                {scoped.rows.length}
              </span>
            </h2>
          </div>
          <p className={`${LINE} mb-3`} data-wallet-liquidity-note="">
            {LIQUIDITY_NO_TOTAL}
          </p>
          <p className={`${LINE} mb-3`} data-wallet-liquidity-read-at-visit="">
            {READ_AT_VISIT}
          </p>
          <div className="mb-3 flex flex-col gap-3">
            {scoped.rows.map((p) => (
              <LiquidityBoundary key={`${p.chain}:${p.family}:${p.positionId}`} fallback={cardFailed(p)}>
                <WalletPositionCard position={p} />
              </LiquidityBoundary>
            ))}
          </div>
        </>
      )}
      <div className="flex flex-col gap-1">
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
            {s.what}: the wallet holds more positions than one read takes; the first are read.
          </p>
        ))}
        {through.map((s) => (
          <p key={s.key} className={LINE} data-wallet-liquidity-found-through={s.key}>
            {s.what}: transfers after block {s.foundThrough!.toLocaleString("en-US")} were not read, so a pool whose BPT
            the wallet received since may be missing.
          </p>
        ))}
        {more.map((s) => (
          <MoreLine key={s.key} s={s} />
        ))}
      </div>
    </section>
  );
}

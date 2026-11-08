"use client";

// A Pendle position's router events, newest first, on the shared event-card
// shell, with two kinds of note row above them (NoteRowShell, L7):
//   • a move the router record does not carry: per leg, the balance at the
//     page's block against what the wallet received and paid through Pendle's
//     routers (a transfer, a direct mint or redemption, a fill credited
//     elsewhere). The record cannot say when it happened, only that it falls
//     at or before the block;
//   • the router record's reach: where the page's block is past the block the
//     capture has read to, the events after it are not on the list yet.

import { ProvReceiptsScope, Prov, useReceiptRegistry } from "@/components/shared/provenance";
import { NoteRowShell } from "@/components/shared/note-row-shell";
import { SpineTipContext } from "@/components/shared/spine-column";
import { EventDateContext } from "@/components/shared/event-time";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { SECTION_HEADING, CARD_INSET_START } from "@/lib/shared/ui-grammar";
import { BlockRef } from "@/components/shared/block-ref";
import { PendleEventCard } from "@/components/protocol/pendle/pendle-event-card";
import { LEG_NAME, PENDLE_CHAIN_ID, amountText, exact, symbolOf } from "@/lib/pendle/format";
import { boundaryProv, flowProv } from "@/lib/pendle/provenance";
import type { PendleBoundary, PendleMarketTokens, PendleTimelineRow, PendleTokenMeta } from "@/lib/pendle/types";

const utcDay = (ts: number) => Math.floor(ts / 86_400);
const datePrefix = (ts: number, aboveTs: number | null): string | null =>
  aboveTs != null && utcDay(aboveTs) === utcDay(ts) ? null : `${shortDate(ts)} ${shortDateYear(ts)}`;
const n = (v: number) => v.toLocaleString("en-US");

function BoundaryRow({ b, tokens, isLast }: { b: PendleBoundary; tokens: PendleMarketTokens; isLast: boolean }) {
  const leg = LEG_NAME[b.leg];
  const tok = b.leg === "pt" ? tokens.pt : b.leg === "yt" ? tokens.yt : tokens.market;
  const name = b.leg === "lp" ? "LP" : symbolOf(tok);
  const inward = b.kind === "unrouted-in";
  const amount = amountText(b.amount, tok.decimals);
  const head = `${leg} moved outside the routers`;
  const amountFig = (
    <Prov info={boundaryProv(leg, b.block)} value={exact(b.amount, tok.decimals) ?? b.amount}>
      {amount}
    </Prov>
  );
  return (
    <NoteRowShell
      icon="custody"
      isLast={isLast}
      label={`${head}: ${amount} ${name} ${inward ? "in" : "out"}`}
      marker={{ attr: "data-pendle-boundary", value: `${b.leg}:${b.kind}` }}
      spine={{ tokens: [{ symbol: tok.symbol ?? "", address: tok.address, badge: "send" }] }}
      header={
        <span className="inline-flex flex-wrap items-center gap-1.5 text-foreground">
          <span className="font-semibold">{head}</span>
          <span className="text-rb-500">
            {amountFig} {name} {inward ? "in" : "out"}
          </span>
        </span>
      }
      meta={<span className="text-xs text-rb-500 sm:ml-auto">at or before block {n(b.block)}</span>}
    >
      <div className="space-y-2 px-5 pb-4 pt-3 text-sm leading-relaxed" data-pendle-boundary-body="">
        <p>
          At block <BlockRef block={b.block} chainId={PENDLE_CHAIN_ID} size={12} /> this wallet held{" "}
          {amountText(b.balance, tok.decimals)} {name}. Through Pendle&rsquo;s routers it received and paid a net{" "}
          {amountText(b.routerNet, tok.decimals)}. The {amountFig} {name} between the two{" "}
          {inward ? "came into the wallet" : "left the wallet"} some other way: a token transfer, a mint or redemption
          sent to the {leg} contract directly, a market called without a router, or a limit-order fill credited to
          another address.
        </p>
        <p className="text-rb-500">
          The router record cannot date the move. It falls at or before this block
          {b.lastRouterBlock != null
            ? `; this wallet's last router event in the market is at block ${n(b.lastRouterBlock)}`
            : ""}
          . Rails reads PT, YT and LP transfers in a later phase.
        </p>
      </div>
    </NoteRowShell>
  );
}

function CoverageRow({
  coverage,
  through,
  isLast,
}: {
  coverage: { fromBlock: number; toBlock: number };
  through: number | null;
  isLast: boolean;
}) {
  const span = coverage.toBlock - coverage.fromBlock + 1;
  return (
    <NoteRowShell
      icon="boundary"
      isLast={isLast}
      label={`Router record reaches block ${n(coverage.fromBlock - 1)}`}
      marker={{ attr: "data-pendle-coverage", value: String(coverage.fromBlock) }}
      header={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-foreground">Router record reaches block {n(coverage.fromBlock - 1)}</span>
          <span className="text-rb-500">
            {n(span)} newer {span === 1 ? "block" : "blocks"} not read yet
          </span>
        </span>
      }
      meta={<span className="text-xs text-rb-500 sm:ml-auto">to block {n(coverage.toBlock)}</span>}
    >
      <div className="space-y-2 px-5 pb-4 pt-3 text-sm leading-relaxed" data-pendle-coverage-body="">
        <p>
          The balances on the card are read at block{" "}
          <BlockRef block={coverage.toBlock} chainId={PENDLE_CHAIN_ID} size={12} />. Rails&rsquo; capture of the router
          logs has reached block {through != null ? n(through) : n(coverage.fromBlock - 1)}, so a router event in blocks{" "}
          {n(coverage.fromBlock)} to {n(coverage.toBlock)} is not on this list yet, and a move there reads as a move
          outside the routers until the capture catches up.
        </p>
      </div>
    </NoteRowShell>
  );
}

export function PendleTimeline({
  rows,
  boundaries,
  coverage,
  through,
  tokensOf,
  meta,
  heading = "Router events",
}: {
  /** Oldest first, as the api sends them. */
  rows: PendleTimelineRow[];
  boundaries: PendleBoundary[];
  coverage: { fromBlock: number; toBlock: number } | null;
  through: number | null;
  tokensOf: (market: string | null) => PendleMarketTokens | null;
  meta: Record<string, PendleTokenMeta>;
  heading?: string;
}) {
  const registry = useReceiptRegistry();
  const newest = [...rows].reverse();
  const notes = (coverage ? 1 : 0) + boundaries.length;
  return (
    <section className="space-y-4" data-anatomy="P3" aria-label={heading}>
      <div className={`flex flex-wrap items-baseline justify-between gap-2 ${CARD_INSET_START}`}>
        <h2 className={SECTION_HEADING}>{heading}</h2>
        <span className="text-xs tabular-nums text-rb-500" data-pendle-count="">
          <Prov info={flowProv("Router events", rows.length)} value={String(rows.length)}>
            {n(rows.length)} {rows.length === 1 ? "event" : "events"}
          </Prov>
        </span>
      </div>
      <ProvReceiptsScope registry={registry}>
        <div data-pendle-timeline="">
          {coverage && (
            <CoverageRow
              coverage={coverage}
              through={through}
              isLast={newest.length === 0 && boundaries.length === 0}
            />
          )}
          {boundaries.map((b, i) => {
            const t = tokensOf(b.market);
            return t ? (
              <BoundaryRow
                key={`${b.market}:${b.leg}`}
                b={b}
                tokens={t}
                isLast={newest.length === 0 && i === boundaries.length - 1}
              />
            ) : null;
          })}
          {newest.map((row, i) => (
            <EventDateContext.Provider
              key={`${row.txHash}-${row.logIndex}`}
              value={datePrefix(row.timestamp, i > 0 ? newest[i - 1].timestamp : null)}
            >
              <SpineTipContext.Provider value={i === 0 && notes === 0 ? "above" : null}>
                <div
                  id={`event-${row.txHash}-${row.logIndex}`}
                  data-event-id={`${row.txHash}-${row.logIndex}`}
                  data-row-at={row.timestamp}
                >
                  <PendleEventCard
                    row={row}
                    tokens={tokensOf(row.market)}
                    meta={meta}
                    side="wallet"
                    isLast={i === newest.length - 1}
                    eventNumber={rows.length - i}
                  />
                </div>
              </SpineTipContext.Provider>
            </EventDateContext.Provider>
          ))}
          {rows.length === 0 && (
            <p className="py-6 text-sm text-rb-500">No router event names this wallet in this market.</p>
          )}
        </div>
      </ProvReceiptsScope>
    </section>
  );
}

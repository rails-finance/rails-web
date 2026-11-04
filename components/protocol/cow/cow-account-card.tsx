"use client";

// The wallet's CoW account on the shared position card (C1): Trades, Tokens
// traded, First trade and Last trade, counted from the wallet's `Trade` logs at
// the Sieve checkpoint the answer names. No status tag, no risk, no USD.

import { PositionCard, type PositionCardHead, type PositionCardSlots } from "@/components/shared/position-card";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { BlockRef } from "@/components/shared/block-ref";
import { formatDate } from "@/lib/date";
import { COW_CHAIN_ID, GPV2_SETTLEMENT } from "@/lib/cow/trade";
import type { CowAsOf, CowWalletSummary } from "@/lib/cow/types";

const SETTLEMENT = { name: "GPv2Settlement (CoW Protocol)", address: GPV2_SETTLEMENT };
const n = (v: number) => v.toLocaleString("en-US");

const countProv = (asOf: CowAsOf, what: string, value: number): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${what} — counted over every Trade log of CoW Protocol's settlement contract whose owner is this wallet, through block ${n(asOf.block)}: ${n(value)}.`,
  contract: SETTLEMENT,
  via: "Trade logs · owner = this wallet",
  source: { block: asOf.block },
});

const tradeAtProv = (which: "First" | "Last", block: number): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `${which} trade — the ${which === "First" ? "earliest" : "latest"} block holding a Trade log whose owner is this wallet, and that block's time.`,
  contract: SETTLEMENT,
  via: "Trade log · block",
  source: { block },
});

function dateHead(
  id: string,
  label: "First trade" | "Last trade",
  ts: number | null,
  block: number | null,
): PositionCardHead {
  return {
    id,
    label,
    value:
      ts != null && block != null ? (
        <Prov info={tradeAtProv(label === "First trade" ? "First" : "Last", block)} value={String(block)}>
          {formatDate(ts)}
        </Prov>
      ) : null,
    sub:
      block != null ? (
        <Prov info={tradeAtProv(label === "First trade" ? "First" : "Last", block)} value={String(block)} echo>
          <BlockRef block={block} chainId={COW_CHAIN_ID} size={12} />
        </Prov>
      ) : (
        "none"
      ),
  };
}

export function CowAccountCard({
  summary,
  tokenCount,
  asOf,
  explanation,
}: {
  summary: CowWalletSummary;
  tokenCount: number;
  asOf: CowAsOf;
  explanation: React.ReactNode;
}) {
  const slots: PositionCardSlots = {
    surface: "detail",
    status: null,
    identity: <span className="text-xs font-semibold text-foreground">CoW account</span>,
    heads: [
      {
        id: "trades",
        label: "Trades",
        value: (
          <Prov info={countProv(asOf, "Trades", summary.trades)} value={String(summary.trades)}>
            {n(summary.trades)}
          </Prov>
        ),
      },
      {
        id: "tokens",
        label: "Tokens traded",
        value: (
          <Prov info={countProv(asOf, "Tokens traded", tokenCount)} value={String(tokenCount)}>
            {n(tokenCount)}
          </Prov>
        ),
        sub: "sold or bought",
      },
      dateHead("first", "First trade", summary.firstTimestamp, summary.firstBlock),
      dateHead("last", "Last trade", summary.lastTimestamp, summary.lastBlock),
    ],
    counters: null,
    heading: "account explanation",
    explainer: { body: explanation },
    learnMore: null,
    menu: null,
    panel: [[], []],
  };
  return <PositionCard slots={slots} />;
}

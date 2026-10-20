// Compound V3 Arbitrum's adapter onto the shared holder strip
// (components/shared/holder-strip.tsx) — what the wallet overview,
// /arbitrum/compound-v3/<wallet>, states above the wallet's Comet cards
// (rails-ops reference/arbitrum-position-first-lane.md).
//
// A pure function of what the overview already holds: the whole-wallet Comet
// read (`head`, one batched call at one block answering every Comet) and the
// overview's Comets, each with the status its card states. It fetches nothing.
//
// Every Comet is on the page (the roster has four), so the legs are summed over
// the whole wallet whenever the read answered. With no read, the strip states
// how many Comets the history names and why nothing else is stated.
//
// Each Comet lends one base and quotes in one unit (cWETHv3 in ETH),
// so no leg is a quantity of one token: collateral, debt and the lent base are
// each stated in dollars at each Comet's `getPrice`, the ETH-quoted Comet
// converted at the read's `ethUsd` (lib/compound-arbitrum/usd.ts), wearing ≈,
// with the per-Comet amounts beneath.
//
// The nearest-floor line ranks the open borrowing Comets by the share of the
// absorb line their debt has reached (debt value ÷ liquidation capacity, the
// "Absorb line reached" row of the card's risk slot,
// components/protocol/compound/compound-risk-slot.tsx), stated with the same
// `capacityShare` wording.

import type { HolderLeg, HolderNearest, HolderStripProps } from "@/components/shared/holder-strip";
import type { Provenance } from "@/components/shared/provenance";
import type { CometMarket } from "@/lib/compound/asset-catalog";
import type { CompoundPositionView } from "@/components/protocol/compound/compound-position-card";
import { scaleCompoundChainBalance, type CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";
import { capacityShare } from "@/lib/shared/capacity-share";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";
import { compoundArbitrumUsd } from "./usd";
import { compoundArbitrumMarketHref } from "./routes";

/** One Comet on the overview: the read's answer for it (null where it holds
 *  nothing now, or the read failed) and the status its card states. */
export interface HolderStripComet {
  market: Pick<CometMarket, "key" | "label" | "comet" | "baseSymbol">;
  chain: CompoundMarketChainResponse | null;
  status: CompoundPositionView["status"];
}

const WALLET_VIA = "GET /api/chain/compound-arbitrum/wallet";

const LEG_TIP = {
  collateral:
    "An estimate: each Comet's collateral at that Comet's price feeds as of this read, added across the Comets. Each Comet holds its collateral against its loan alone.",
  debt: "An estimate: each Comet's borrowed base, interest included, at that Comet's price feed as of this read, added across the Comets.",
  lent: "An estimate: each Comet's lent base, interest included, at that Comet's price feed as of this read, added across the Comets.",
} as const;

const NEAREST_TIP =
  "Each Comet absorbs an account on its line alone; the wallet has no line. This is the open borrowing Comet whose debt has reached the largest share of its absorb line, at the Comet's prices as of this read.";

const count = (n: number): string => n.toLocaleString("en-US");

/** "a, b and c". */
const joinAnd = (parts: string[]): string =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

function legProv(what: string, figure: string, block: number, comets: string[]): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    verify: {
      kind: "recompute",
      text: `Re-run each Comet's ${figure} and getPrice at block ${block.toLocaleString("en-US")}, scale each by the asset's decimals, multiply by that Comet's price (the ETH-quoted Comet also by WETH in dollars) and add the Comets.`,
    },
    summary: `${what}, in USD — each Comet's figure (${comets.join(", ")}) at that Comet's getPrice, read in one batched call at block ${block.toLocaleString("en-US")}; cWETHv3 quotes in ETH and converts at WETH in dollars from the same read. An estimate: the Comets hold different tokens and a sum of them exists only at a price, and each price moves every block.`,
    via: `${WALLET_VIA} at block ${block.toLocaleString("en-US")} · Σ over the Comets of amount × the Comet's price`,
    formula: "Σ amount × the Comet's price",
    inputs: [
      { label: "amounts", kind: "chain", pclass: "state", note: `${figure} @ the read block` },
      { label: "price", kind: "chain", pclass: "oracle", note: "the Comet's getPrice @ the read block" },
    ],
  };
}

function nearestProv(c: CompoundMarketChainResponse, label: string): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: {
      kind: "recompute",
      text: `Re-run ${label}'s collateralBalanceOf, getPrice, getAssetInfo and borrowBalanceOf at block ${c.blockNumber.toLocaleString("en-US")}, and divide the debt's value by Σ collateral × price × liquidate factor.`,
    },
    summary: `Debt share of the absorb line — ${label}'s debt value ÷ its liquidation capacity (Σ collateral × oracle price × liquidate factor), every input read from the Comet at block ${c.blockNumber.toLocaleString("en-US")}. The same figure as the card's "Absorb line reached"; the Comet's isLiquidatable says whether the account is past it.`,
    contract: { name: `Compound V3 ${label} Comet (Arbitrum)`, address: c.comet },
    via: `${WALLET_VIA} at block ${c.blockNumber.toLocaleString("en-US")} · debt value ÷ liquidation capacity`,
    formula: "debt value ÷ liquidation capacity",
    inputs: [
      { label: "collateral balances", kind: "chain", pclass: "state", note: "collateralBalanceOf @ the read block" },
      { label: "oracle prices", kind: "chain", pclass: "oracle", note: "getPrice @ the read block" },
      { label: "liquidate factors", kind: "chain", pclass: "state", note: "getAssetInfo @ the read block" },
      { label: "debt", kind: "chain", pclass: "state", note: "borrowBalanceOf @ the read block" },
    ],
  };
}

/** The counts sentence, in Comet positions. */
function countsLine(n: number, counts: { open: number; closed: number; liquidated: number }, liquidatable: number) {
  const parts = [
    counts.open > 0 ? `${count(counts.open)} open` : null,
    counts.closed > 0 ? `${count(counts.closed)} closed` : null,
    counts.liquidated > 0 ? `${count(counts.liquidated)} liquidated` : null,
  ].filter((p): p is string => p != null);
  const noun = n === 1 ? "Comet position" : "Comet positions";
  const spread = parts.length === 1 && n > 1 ? `${n === 2 ? "both" : "all"} ${parts[0].split(" ")[1]}` : joinAnd(parts);
  const liq =
    liquidatable > 0
      ? ` ${count(liquidatable)} of the open ones ${liquidatable === 1 ? "is" : "are"} liquidatable.`
      : "";
  return `This wallet holds ${count(n)} ${noun}, ${spread}.${liq}`;
}

/** Build the strip for the wallet overview. `comets` is the overview's list,
 *  open first. */
export function compoundArbitrumHolderStrip(
  wallet: string,
  head: CompoundWalletChainResponse | null,
  comets: HolderStripComet[],
): HolderStripProps {
  if (!head) {
    // No read: the history names the Comets, and nothing says which are open.
    const n = comets.length;
    return {
      countsLine: `The history names ${count(n)} ${n === 1 ? "Comet position" : "Comet positions"} for this wallet.`,
      counts: { open: 0, closed: 0, liquidated: 0 },
      legs: [],
      truncated: false,
      note: "The Comets did not answer in time, so which are open and what they hold is unread; reload to read them.",
    };
  }

  const open = comets.filter((c) => c.status === "open" && c.chain != null);
  const counts = {
    open: open.length,
    closed: comets.filter((c) => c.status === "closed").length,
    liquidated: comets.filter((c) => c.status === "liquidated").length,
  };
  const liquidatable = open.filter((c) => c.chain!.isLiquidatable).length;

  const usd = compoundArbitrumUsd(head).byComet;
  const block = head.blockNumber;
  const legs: HolderLeg[] = [];

  // ── collateral: per Comet in dollars, the parts named by Comet ────────────
  {
    let sum = 0;
    const parts: string[] = [];
    const named: string[] = [];
    for (const c of open) {
      if (c.chain!.collateral.length === 0) continue;
      const v = usd.get(c.chain!.comet.toLowerCase())?.collateralUsd;
      if (v == null) {
        parts.push(`${c.market.label} not priced`);
        continue;
      }
      if (!(v > 0)) continue;
      sum += v;
      parts.push(`${c.market.label} ${formatUsdValue(v)}`);
      named.push(c.market.label);
    }
    if (sum > 0)
      legs.push({
        id: "collateral",
        label: "Total collateral",
        value: formatUsdValue(sum),
        approx: true,
        tip: LEG_TIP.collateral,
        prov: legProv("What the wallet holds as collateral across its Comets", "collateralBalanceOf", block, named),
        footnote: { text: parts.join(" · ") },
      });
  }

  // ── the base, borrowed and lent: dollars, the parts in each Comet's base ──
  const baseLeg = (side: "borrow" | "supply") => {
    let sum = 0;
    const parts: string[] = [];
    const named: string[] = [];
    for (const c of open) {
      const ch = c.chain!;
      const amount = scaleCompoundChainBalance(
        side === "borrow" ? ch.borrowBalanceRaw : ch.supplyBalanceRaw,
        ch.baseDecimals,
      );
      if (!(amount > 0)) continue;
      const u = usd.get(ch.comet.toLowerCase());
      const v = side === "borrow" ? u?.borrowUsd : u?.supplyUsd;
      parts.push(`${formatNumber(amount)} ${ch.baseSymbol}${v == null ? " (not priced)" : ""}`);
      if (v == null) continue;
      sum += v;
      named.push(c.market.label);
    }
    if (!(sum > 0)) return;
    legs.push(
      side === "borrow"
        ? {
            id: "debt",
            label: "Total debt",
            value: formatUsdValue(sum),
            approx: true,
            tip: LEG_TIP.debt,
            prov: legProv("What the wallet owes across its Comets", "borrowBalanceOf", block, named),
            footnote: { text: parts.join(" · ") },
          }
        : {
            id: "lent",
            label: "Total lent",
            value: formatUsdValue(sum),
            approx: true,
            tip: LEG_TIP.lent,
            prov: legProv("What the wallet lends across its Comets", "balanceOf", block, named),
            footnote: { text: parts.join(" · ") },
          },
    );
  };
  baseLeg("borrow");
  baseLeg("supply");

  // ── nearest its floor: the largest share of an absorb line reached ────────
  let nearest: HolderNearest | undefined;
  let highest = -Infinity;
  for (const c of open) {
    const ch = c.chain!;
    if (!(ch.debtValue > 0) || !(ch.liquidationCapacity > 0)) continue;
    const reached = ch.debtValue / ch.liquidationCapacity;
    if (reached <= highest) continue;
    highest = reached;
    const share = capacityShare(ch.debtValue, ch.liquidationCapacity);
    nearest = {
      href: compoundArbitrumMarketHref(c.market.key, wallet),
      label: c.market.label,
      measure: share.beyond ? `${share.text} its absorb line` : `${share.text} of its absorb line`,
      approx: true,
      tip: NEAREST_TIP,
      prov: nearestProv(ch, c.market.label),
    };
  }

  return {
    countsLine: countsLine(comets.length, counts, liquidatable),
    counts,
    legs,
    nearest,
    truncated: false,
  };
}

// The position at the cut, on the WINDOW arm — read off the oldest served row.
// ----------------------------------------------------------------------------
// A windowed page holds the newest N events and an opening balance for the
// rest. The opening balance carries counts, not balances; but every protocol
// whose rows carry a running balance states, on each row, the figure BEFORE
// that row moved it — and the oldest served row's before-figure IS the
// position at the cut, to the wei, because the cut is exclusive and nothing
// sits between it and the row. So the boundary card restates that figure, in
// the same units the row formats it in, and nothing here reads anything the
// page did not already reconcile.
//
// One adapter per protocol, a few lines each. AFTER-only protocols (Compound
// V3, Morpho, MakerDAO, LlamaLend, f(x)) and PWN (no running balance) return
// null: the line is absent on their card, not a zero. A lane whose before is
// exactly zero is dropped too — a reserve the row opened says nothing about the
// position, and "held 0" is not a statement a reader came for.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { BoundaryStateLine } from "@/lib/shared/timeline-boundary";
import { DEBT_SYMBOL as EBISU_DEBT } from "@/lib/ebisu/asset-catalog";
import { DEBT_SYMBOL as ASYMMETRY_DEBT } from "@/lib/asymmetry/asset-catalog";
import { DEBT_SYMBOL as BASEDOLLAR_DEBT } from "@/lib/basedollar/asset-catalog";

function line(label: string, value: string | number | undefined, unit?: string): BoundaryStateLine | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return { label, value: String(n), ...(unit ? { unit } : {}) };
}

function lines(...ls: (BoundaryStateLine | null)[]): BoundaryStateLine[] | null {
  const out = ls.filter((l): l is BoundaryStateLine => l != null);
  return out.length > 0 ? out : null;
}

/** The position at the cut, from the oldest served row. Null where the
 *  protocol's rows carry no before-figure. */
export function boundaryStateFromOldestRow(e: BaseActivityEvent | undefined): BoundaryStateLine[] | null {
  if (!e?.context) return null;
  const c = e.context;
  switch (c.protocol) {
    case "aave-v3":
    case "aave-v4": {
      const d = c.data;
      const supplySym = d.eventType === "liquidation" ? d.collateralSymbol : d.reserveSymbol;
      return lines(
        line(`${supplySym ?? "Reserve"} supply`, d.supplyBefore, supplySym),
        line(`${d.reserveSymbol ?? "Reserve"} debt`, d.debtBefore, d.reserveSymbol),
      );
    }
    case "spark": {
      const d = c.data;
      const supplySym = d.eventType === "liquidation" ? (d.collateralSymbol ?? d.reserveSymbol) : d.reserveSymbol;
      return lines(
        line(`${supplySym} supply`, d.supplyBefore, supplySym),
        line(`${d.reserveSymbol} debt`, d.debtBefore, d.reserveSymbol),
      );
    }
    case "liquity-v1": {
      const d = c.data;
      return lines(line("Collateral", d.collBefore, "ETH"), line("Debt", d.debtBefore, "LUSD"));
    }
    case "ebisu": {
      const d = c.data;
      return lines(line("Collateral", d.collBefore, d.collateralSymbol), line("Debt", d.debtBefore, EBISU_DEBT));
    }
    case "asymmetry": {
      const d = c.data;
      return lines(line("Collateral", d.collBefore, d.collateralSymbol), line("Debt", d.debtBefore, ASYMMETRY_DEBT));
    }
    case "basedollar": {
      const d = c.data;
      return lines(line("Collateral", d.collBefore, d.collateralSymbol), line("Debt", d.debtBefore, BASEDOLLAR_DEBT));
    }
    case "liquity-v2-troves": {
      const d = c.data;
      const s = d.stateBefore;
      return lines(line("Collateral", s?.coll, d.collateralType), line("Debt", s?.debt, d.assetType || "BOLD"));
    }
    // The receipt-token lane rides beside the underlying: a custody move (a
    // cToken/mToken transfer) states only its token balance before, and that
    // is the position at the cut on that lane.
    case "moonwell": {
      const d = c.data;
      return lines(
        line(`${d.marketSymbol} supply`, d.supplyBefore, d.marketSymbol),
        line(`m${d.marketSymbol} held`, d.mTokensBefore, `m${d.marketSymbol}`),
        line(`${d.marketSymbol} debt`, d.debtBefore, d.marketSymbol),
      );
    }
    case "compound-v2": {
      const d = c.data;
      return lines(
        line(`${d.marketSymbol} supply`, d.supplyBefore, d.marketSymbol),
        line(`c${d.marketSymbol} held`, d.cTokensBefore, `c${d.marketSymbol}`),
        line(`${d.marketSymbol} debt`, d.debtBefore, d.marketSymbol),
      );
    }
    case "dolomite": {
      const d = c.data;
      return lines(line(`${d.marketSymbol} ${d.side === "debt" ? "debt" : "supply"}`, d.parBefore, d.marketSymbol));
    }
    case "frankencoin": {
      const d = c.data;
      return lines(line("Collateral", d.collateralBefore, d.collateralSymbol), line("Minted", d.mintedBefore, "ZCHF"));
    }
    case "fluid": {
      const d = c.data;
      return lines(
        line("Collateral", d.colBefore, d.supplySymbol ?? undefined),
        line("Debt", d.debtBefore, d.borrowSymbol ?? undefined),
      );
    }
    case "maple": {
      const d = c.data;
      return lines(
        line("Shares", d.sharesBefore, d.poolSymbol),
        line("In escrow", d.escrowBefore, d.poolSymbol),
        line("Principal", d.principalBefore, d.assetSymbol),
      );
    }
    // Alchemix V3 rows carry deltas, never the figure before them, and the
    // boundary could not be restated from one even if they did: a redemption
    // moves every open position's debt at once and appears on the timeline as a
    // line-scope row with no per-position figure on it (rails-ops
    // decisions/0032). A before-figure inferred from the position's own rows
    // would be a number the chain does not agree with. What IS available is a
    // `getCDP` reading at each event's block, served on the wire and drawn on
    // the event card itself (`alchemix-state-at-block.tsx`); this group says
    // only that nothing may be inferred here, never that no state is in hand.
    case "alchemix-v3":
    // Alchemix V2: the debt fell every block between events as harvested
    // credit unlocked, with no log at those blocks, so no balance at a cut can
    // be reached from the rows either.
    case "alchemix-v2":
    // After-only rows, or no running balance at all: the line is absent.
    case "compound":
    case "morpho":
    case "makerdao":
    case "llamalend":
    case "fx":
    case "pwn":
    case "polaris":
    case "other":
      return null;
  }
}

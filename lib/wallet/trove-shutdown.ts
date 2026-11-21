// A Liquity-family Trove on a shut-down branch, on the wallet page (rails-ops
// TO-DO-ui-jobs 802; anatomy C6.1, N7, W2, W3). Client-safe and pure.
//
// The state is the branch's catalog record (lib/shared/liquity-family-shutdown.ts)
// with the head's live read (lib/liquity-fork/shutdown.ts), per branch, so a
// Liquity V2 or fork branch takes it the day its read answers. On a shut-down
// branch the Trove states no collateral ratio and no buffer, so no risk sort,
// "Closest to liquidation" or AT RISK is built from it, and no borrow rate: its
// interest stopped at the shutdown. Where the record holds the admin's
// withdrawal of the pool's collateral, the Trove's collateral is what it
// records while the pool holds 0: it states no dollars, and the section's band
// carries it as "Recorded collateral" in its token, as the removed fork holder
// strip did (ui-jobs 738).

import type { HolderLeg } from "@/components/shared/holder-strip";
import type { BranchShutdownState } from "@/lib/liquity-fork/shutdown";
import { shutdownDay, withdrawalDateProv } from "@/lib/shared/liquity-family-shutdown";
import { formatNumber } from "@/lib/utils/format";
import type { WalletPosition } from "@/lib/wallet/types";

/** The position with its branch's state: on a shut-down branch, no ratio,
 *  buffer, liquidation verdict or rate, and on an emptied pool no collateral
 *  dollars. A null state hands the position back unchanged. */
export function shutDownTrove(p: WalletPosition, state: BranchShutdownState | null | undefined): WalletPosition {
  if (!state) return p;
  const shut: WalletPosition = {
    ...p,
    shutdown: state,
    buffer: undefined,
    riskFigure: undefined,
    liquidatable: undefined,
    debtRate: undefined,
  };
  // The debt is the stablecoin at its face, so it still stands.
  return state.record?.withdrawal ? { ...shut, collateralUsd: undefined, usdOwnOracle: true } : shut;
}

/** An open Trove whose branch's pool the admin emptied after the shutdown. */
export const onEmptiedBranch = (p: WalletPosition): boolean =>
  p.status === "open" && p.shutdown?.record?.withdrawal != null;

/** The Trove's recorded collateral and its branch, from its listing row. */
export function troveCollateral(p: WalletPosition): { symbol: string; amount: number } | null {
  const c = p.card;
  if (c.kind === "liquity-v2") return { symbol: c.row.collateralType, amount: c.row.collateral.amount };
  if (c.kind === "ebisu" || c.kind === "asymmetry" || c.kind === "basedollar")
    return { symbol: c.row.collateralType, amount: c.row.collateral };
  return null;
}

const TIP =
  "What each open Trove records as of its last touch. The branch is shut down and its pool holds 0 of this collateral since the admin withdrew it.";

/** The band's "Recorded collateral" leg (N7) over the open Troves on emptied
 *  branches: a quantity per branch, with the shutdown and "pool holds 0
 *  <symbol>" under it and the withdrawal's receipt. Null where there are none. */
export function recordedCollateralLeg(
  protocol: string,
  troves: WalletPosition[],
  collAddress?: (symbol: string) => string | undefined,
): HolderLeg | null {
  const byBranch = new Map<string, { amount: number; state: BranchShutdownState }>();
  for (const p of troves) {
    const c = troveCollateral(p);
    if (!c || !onEmptiedBranch(p) || c.amount <= 0) continue;
    const had = byBranch.get(c.symbol);
    byBranch.set(c.symbol, { amount: (had?.amount ?? 0) + c.amount, state: p.shutdown! });
  }
  const branches = [...byBranch].sort((a, b) => a[0].localeCompare(b[0]));
  if (branches.length === 0) return null;
  const [first, { state }] = branches[0];
  const rec = state.record!;
  const w = rec.withdrawal!;
  const syms = branches.map(([c]) => c).join(", ");
  const one = branches.length === 1;
  const sentence = ` The admin shut the ${syms} ${one ? "branch" : "branches"} down on ${shutdownDay(rec.shutdown.at)} and withdrew ${one ? "its pool's" : "their pools'"} collateral on ${shutdownDay(w.at)}; ${one ? "the pool has" : "the pools have"} held 0 ${syms} since, and the Troves still record this collateral.`;
  const note = {
    text: `Shut down ${shutdownDay(rec.shutdown.at)} · ${branches.map(([c]) => `pool holds 0 ${c}`).join(" · ")}`,
    prov: withdrawalDateProv(protocol, first, rec) ?? undefined,
  };
  const via = "GET /api/chain/wallet/<address> · Σ collateral over the open Troves on emptied branches";
  if (one) {
    const amount = branches[0][1].amount;
    return {
      id: "collateral",
      label: "Recorded collateral",
      value: `${formatNumber(amount)} ${first}`,
      approx: false,
      tip: TIP,
      figure: { amount, tokens: [{ symbol: first, address: collAddress?.(first) }], usd: null },
      footnote: note,
      prov: {
        kind: "chain",
        pclass: "indexed",
        summary: `All the ${first} the wallet's open Troves record — the sum of each Trove's collateral, from the index. Redistribution gains since each Trove's last touch are not in it.${sentence}`,
        via,
      },
    };
  }
  const parts = branches.map(([c, b]) => ({
    text: `${formatNumber(b.amount)} ${c}`,
    symbol: c,
    address: collAddress?.(c),
  }));
  const text = parts.map((x) => x.text).join(" · ");
  return {
    id: "collateral",
    label: "Recorded collateral",
    value: text,
    approx: false,
    tip: TIP,
    footnote: { text: `${text} · ${note.text}`, parts, ...(note.prov ? { prov: note.prov } : {}) },
    prov: {
      kind: "chain",
      pclass: "indexed",
      summary: `The wallet's open Troves' recorded collateral, branch by branch — the sum of each Trove's collateral on its branch, from the index. The branches hold different tokens, so they carry no total. Redistribution gains since each Trove's last touch are not in it.${sentence}`,
      via,
    },
  };
}

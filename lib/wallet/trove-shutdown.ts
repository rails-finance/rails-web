// A Liquity-family Trove or deposit on a shut-down branch, on the wallet page
// (rails-ops TO-DO-ui-jobs 802; anatomy C6.1, N7, W2, W3). Client-safe and pure.
//
// The state is the branch's catalog record (lib/shared/liquity-family-shutdown.ts)
// with the wallet read's live read (lib/liquity-fork/shutdown.ts), per branch, so
// a Liquity V2 or fork branch takes it the day its read answers. On a shut-down
// branch the Trove states no collateral ratio and no buffer, so no risk sort,
// "Closest to liquidation" or AT RISK is built from it, and no borrow rate: its
// interest stopped at the shutdown. Where the record holds the admin's
// withdrawal of the pool's collateral, the Trove's collateral is what it
// records while the pool holds 0: it states no dollars, and the section's band
// carries it as "Recorded collateral" in its token, as the removed fork holder
// strip did (ui-jobs 738).

import type { HolderLeg } from "@/components/shared/holder-strip";
import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { branchShutdownState, type BranchShutdownState } from "@/lib/liquity-fork/shutdown";
import {
  recordedShutdown,
  shutdownDateProv,
  shutdownDay,
  withdrawalDateProv,
} from "@/lib/shared/liquity-family-shutdown";
import { formatNumber } from "@/lib/utils/format";
import type { WalletPosition } from "@/lib/wallet/types";

/** The position with its branch's state: on a shut-down branch, no ratio,
 *  buffer, liquidation verdict or rate, and on an emptied pool no collateral
 *  dollars. A null state (a live branch) sets `shutdown: null` and changes
 *  nothing else; an undefined one (no read) hands the position back. */
export function shutDownTrove(p: WalletPosition, state: BranchShutdownState | null | undefined): WalletPosition {
  if (state === undefined) return p;
  if (state === null) return { ...p, shutdown: null };
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

/** The state a wallet card draws: the wallet read's where it ran, else the
 *  catalog's record alone (a head read that failed or timed out). A closed
 *  position takes none. */
export function walletBranchState(
  protocol: string,
  collateralType: string,
  status: WalletPosition["status"],
  handed: BranchShutdownState | null | undefined,
): BranchShutdownState | null {
  if (status !== "open") return null;
  return handed !== undefined ? handed : branchShutdownState(recordedShutdown(protocol, collateralType), null);
}

/** An open Trove whose branch's pool the admin emptied after the shutdown
 *  (a deposit on such a branch is not one: it carries the state for its card). */
export const onEmptiedBranch = (p: WalletPosition): boolean =>
  p.status === "open" && p.shutdown?.record?.withdrawal != null && troveCollateral(p) != null;

/** The Trove's recorded collateral and its branch, from its listing row. */
export function troveCollateral(p: WalletPosition): { symbol: string; amount: number } | null {
  const c = p.card;
  if (c.kind === "liquity-v2") return { symbol: c.row.collateralType, amount: c.row.collateral.amount };
  if (c.kind === "ebisu" || c.kind === "asymmetry" || c.kind === "basedollar")
    return { symbol: c.row.collateralType, amount: c.row.collateral };
  return null;
}

const tipOf = (one: boolean) =>
  one
    ? "What each open Trove records as of its last touch. The branch is shut down and its pool has held 0 of this collateral since the admin withdrew it."
    : "What each open Trove records as of its last touch. The branches are shut down and their pools have held 0 of this collateral since the admin withdrew it.";

/** "A", "A and B", "A, B and C". */
const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The band's "Recorded collateral" leg (N7) over the open Troves on emptied
 *  branches: a quantity per branch, with each branch's shutdown and "pool
 *  holds 0 <symbol>" under it, each branch's dates and receipts from its own
 *  record. Null where there are none. */
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
  const one = branches.length === 1;

  // Branches sharing a shutdown day and a withdrawal day are said together.
  const groups = new Map<string, { shut: string; withdrew: string; syms: string[] }>();
  for (const [c, { state }] of branches) {
    const rec = state.record!;
    const shut = shutdownDay(rec.shutdown.at);
    const withdrew = shutdownDay(rec.withdrawal!.at);
    const g = groups.get(`${shut}|${withdrew}`) ?? { shut, withdrew, syms: [] };
    g.syms.push(c);
    groups.set(`${shut}|${withdrew}`, g);
  }
  const sentences = [...groups.values()].map((g) => {
    const many = g.syms.length > 1;
    return ` The admin shut the ${and(g.syms)} ${many ? "branches" : "branch"} down on ${g.shut} and withdrew ${many ? "their pools'" : "its pool's"} collateral on ${g.withdrew}; the Troves still record it.`;
  });
  // A live read answering "live" against a record, worded as the Trove
  // page's shutdown date receipt words it.
  const disagree = branches
    .filter(([, b]) => b.state.disagree)
    .map(([c, b]) => ` ${shutdownDateProv(protocol, c, b.state, { trove: false }).summary}`);
  const said = `${sentences.join("")}${disagree.join("")}`;
  const noteText = [...groups.values()]
    .map((g) => `Shut down ${g.shut} · ${g.syms.map((c) => `pool holds 0 ${c}`).join(" · ")}`)
    .join(" · ");
  const receipts = branches
    .map(([c, b]) => withdrawalDateProv(protocol, c, b.state.record!))
    .filter((x): x is Provenance => x != null);
  const noteProv: Provenance | undefined =
    receipts.length <= 1
      ? receipts[0]
      : {
          kind: "chain",
          pclass: "emitted",
          summary: receipts.map((r) => r.summary).join(" "),
          via: "the withdrawal transactions",
          inputs: receipts.flatMap((r) => (r.inputs ?? []) as ProvInput[]),
        };
  const via = "GET /api/chain/wallet/<address> · Σ collateral over the open Troves on emptied branches";
  const base = { id: "recorded-collateral", label: "Recorded collateral", approx: false, tip: tipOf(one) };
  if (one) {
    const [first, { amount }] = branches[0];
    return {
      ...base,
      value: `${formatNumber(amount)} ${first}`,
      figure: { amount, tokens: [{ symbol: first, address: collAddress?.(first) }], usd: null },
      footnote: { text: noteText, prov: noteProv },
      prov: {
        kind: "chain",
        pclass: "indexed",
        summary: `All the ${first} the wallet's open Troves record — the sum of each Trove's collateral, from the index. Redistribution gains since each Trove's last touch are not in it.${said}`,
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
    ...base,
    value: text,
    footnote: { text: `${text} · ${noteText}`, parts, ...(noteProv ? { prov: noteProv } : {}) },
    prov: {
      kind: "chain",
      pclass: "indexed",
      summary: `The wallet's open Troves' recorded collateral, branch by branch — the sum of each Trove's collateral on its branch, from the index. The branches hold different tokens, so they carry no total. Redistribution gains since each Trove's last touch are not in it.${said}`,
      via,
    },
  };
}

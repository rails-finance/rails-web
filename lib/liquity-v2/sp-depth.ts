// The Stability Pool's depth per branch beside the debt it backs (ui-jobs
// 748): each branch pool's getTotalBoldDeposits() and the branch
// TroveManager's getEntireBranchDebt(), both at one stated block
// (lib/sources/chain/liquity-v2-sp-depth.ts, served at
// /api/chain/liquity-v2/sp-depth), and the pool's share of the debt.
//
// Dependency-free apart from relative imports, so the unit test loads it.

import type { Provenance } from "../../components/shared/provenance";

export interface SpDepthBranch {
  /** The branch's collateral symbol: WETH, wstETH, rETH. */
  symbol: string;
  pool: string;
  troveManager: string;
  /** getTotalBoldDeposits(), 1e18 scaled; null where the call failed. */
  depositsRaw: string | null;
  /** getEntireBranchDebt(), 1e18 scaled; null where the call failed. */
  debtRaw: string | null;
}

export interface SpDepth {
  blockNumber: number;
  /** Unix seconds. */
  blockTimestamp: number;
  branches: SpDepthBranch[];
}

const VIA = "GET /api/chain/liquity-v2/sp-depth";

/** The first block at which all three branch pools and TroveManagers have
 *  code (the rETH StabilityPool, the last deployed); a read before it has
 *  nothing to read. */
export const LIQUITY_V2_SP_FROM_BLOCK = 22_516_119;

/** A 1e18 raw as a number of BOLD; null for an absent or malformed raw. */
export function boldUnits(raw: string | null | undefined): number | null {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  return Number(raw) / 1e18;
}

/** The pool's BOLD as a share of the branch debt; null where either is
 *  missing or the debt is zero. */
export function poolShare(depositsRaw: string | null, debtRaw: string | null): number | null {
  const d = boldUnits(depositsRaw);
  const debt = boldUnits(debtRaw);
  return d == null || debt == null || debt <= 0 ? null : d / debt;
}

/** The sum over branches of one figure; null where any branch lacks it. */
export function spDepthTotal(depth: SpDepth, pick: (b: SpDepthBranch) => string | null): number | null {
  let sum = 0;
  for (const b of depth.branches) {
    const v = boldUnits(pick(b));
    if (v == null) return null;
    sum += v;
  }
  return sum;
}

const at = (block: number) => block.toLocaleString("en-US");

const ask = (call: string, block: number) => ({
  kind: "recompute" as const,
  text: `To check: ask any Ethereum archive node for ${call} at block ${at(block)}.`,
});

/** One branch pool's BOLD. */
export function spDepositsProv(b: SpDepthBranch, block: number): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary: `${b.symbol} Stability Pool — the branch pool's getTotalBoldDeposits() at block ${at(block)}: the BOLD its depositors hold in it.`,
    contract: { name: `Liquity V2 ${b.symbol} StabilityPool`, address: b.pool },
    source: { block },
    verify: ask("getTotalBoldDeposits()", block),
    via: `${VIA} · getTotalBoldDeposits() @ ${at(block)}`,
    ...(b.depositsRaw != null
      ? {
          scaling: {
            raw: b.depositsRaw,
            from: "call" as const,
            places: 18,
            why: "BOLD has 18 decimals",
          },
        }
      : {}),
  };
}

/** One branch's debt. */
export function spBranchDebtProv(b: SpDepthBranch, block: number): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary: `${b.symbol} branch debt — the TroveManager's getEntireBranchDebt() at block ${at(block)}: the BOLD the branch's Troves owe, interest accrued to that block included.`,
    contract: { name: `Liquity V2 ${b.symbol} TroveManager`, address: b.troveManager },
    source: { block },
    verify: ask("getEntireBranchDebt()", block),
    via: `${VIA} · getEntireBranchDebt() @ ${at(block)}`,
    ...(b.debtRaw != null
      ? { scaling: { raw: b.debtRaw, from: "call" as const, places: 18, why: "BOLD has 18 decimals" } }
      : {}),
  };
}

/** The pool's share of the branch debt. */
export function spShareProv(b: SpDepthBranch, block: number): Provenance {
  const d = boldUnits(b.depositsRaw);
  const debt = boldUnits(b.debtRaw);
  return {
    kind: "derived",
    summary: `${b.symbol} pool ÷ debt — the Stability Pool's BOLD over the branch debt at block ${at(block)}.`,
    formula: "getTotalBoldDeposits() ÷ getEntireBranchDebt()",
    inputs: [
      { label: "getTotalBoldDeposits()", value: d == null ? undefined : String(d), kind: "chain", pclass: "state" },
      {
        label: "getEntireBranchDebt()",
        value: debt == null ? undefined : String(debt),
        kind: "chain",
        pclass: "state",
      },
    ],
    source: { block },
  };
}

/** A total across the three branches. */
export function spTotalProv(what: "deposits" | "debt", block: number): Provenance {
  const call = what === "deposits" ? "getTotalBoldDeposits()" : "getEntireBranchDebt()";
  return {
    kind: "derived",
    summary:
      what === "deposits"
        ? `All three pools — the sum of each branch pool's getTotalBoldDeposits() at block ${at(block)}.`
        : `All three branches' debt — the sum of each TroveManager's getEntireBranchDebt() at block ${at(block)}.`,
    formula: `Σ ${call} over WETH, wstETH, rETH`,
    source: { block },
  };
}

/** The three pools over the three branches' debt. */
export function spTotalShareProv(block: number): Provenance {
  return {
    kind: "derived",
    summary: `All pools ÷ all debt — the three pools' getTotalBoldDeposits() over the three branches' getEntireBranchDebt() at block ${at(block)}.`,
    formula: "Σ getTotalBoldDeposits() ÷ Σ getEntireBranchDebt()",
    source: { block },
  };
}

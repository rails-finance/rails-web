// Receipts for a Liquity V2 branch below its critical ratio (rails-ops
// TO-DO-ui-jobs 747): the TCR, the CCR, and the price at which the TCR meets
// the SCR, each at the block the branch was read at
// (lib/sources/chain/liquity-v2-branch-ccr.ts).

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { formatExactFromString, formatUnitsExact, formatUsdValue } from "@/lib/utils/format";
import type { LiquityV2BranchCcr } from "./branch-ccr";

const VIA = "GET /api/chain/liquity-v2/branch-ccr";
const blockOf = (n: number) => n.toLocaleString("en-US");
const exact = (raw: string) => formatExactFromString(formatUnitsExact(raw, 18), Number(raw) / 1e18);
const pct = (x: number, places = 2) => `${(x * 100).toFixed(places)}%`;

const tm = (s: LiquityV2BranchCcr) => ({ name: `Liquity V2 ${s.branch} TroveManager`, address: s.troveManager });
const bo = (s: LiquityV2BranchCcr) => ({
  name: `Liquity V2 ${s.branch} BorrowerOperations`,
  address: s.borrowerOperations,
});
const pf = (s: LiquityV2BranchCcr) => ({ name: `Liquity V2 ${s.branch} PriceFeed`, address: s.priceFeed });

const priceLabel = (s: LiquityV2BranchCcr) =>
  s.priceCall === "fetchPrice" ? "PriceFeed.fetchPrice() (simulated)" : "PriceFeed.lastGoodPrice()";

const collRow = (s: LiquityV2BranchCcr): ProvInput => ({
  label: "TroveManager.getEntireBranchColl()",
  value: `${exact(s.collRaw)} ${s.branch}`,
  kind: "chain",
  pclass: "state",
  note: `block ${blockOf(s.blockNumber)}`,
  contract: tm(s),
});
const debtRow = (s: LiquityV2BranchCcr): ProvInput => ({
  label: "TroveManager.getEntireBranchDebt()",
  value: `${exact(s.debtRaw)} BOLD`,
  kind: "chain",
  pclass: "state",
  note: `block ${blockOf(s.blockNumber)}`,
  contract: tm(s),
});
const priceRow = (s: LiquityV2BranchCcr): ProvInput => ({
  label: priceLabel(s),
  value: `$${exact(s.priceRaw)}`,
  kind: "chain",
  pclass: "oracle",
  note:
    s.priceCall === "fetchPrice"
      ? `block ${blockOf(s.blockNumber)}; the price borrower operations use`
      : `block ${blockOf(s.blockNumber)}; fetchPrice did not answer`,
  contract: pf(s),
});
const constRow = (s: LiquityV2BranchCcr, name: "CCR" | "SCR", raw: string): ProvInput => ({
  label: `BorrowerOperations.${name}()`,
  value: `${raw} (${pct(Number(raw) / 1e18, 0)})`,
  kind: "chain",
  pclass: "state",
  note: `block ${blockOf(s.blockNumber)}`,
  contract: bo(s),
});

/** The branch's total collateral ratio at the read's block. */
export function branchTcrProv(s: LiquityV2BranchCcr): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `${s.branch} branch total collateral ratio — the branch's entire collateral × ${priceLabel(s)} ÷ its entire debt, all read at block ${blockOf(s.blockNumber)}. The contract compares this ratio with the CCR before each borrower operation, at the price fetchPrice returns.`,
    contract: tm(s),
    via: `${VIA} · block ${blockOf(s.blockNumber)}`,
    formula: "getEntireBranchColl × price ÷ getEntireBranchDebt",
    inputs: [collRow(s), priceRow(s), debtRow(s)],
    verify: {
      kind: "recompute",
      text: `To check: ask any Ethereum archive node, at block ${blockOf(s.blockNumber)}, for getEntireBranchColl() and getEntireBranchDebt() on the TroveManager and fetchPrice() on the PriceFeed; multiply collateral by price and divide by debt.`,
    },
    source: { block: s.blockNumber },
  };
}

/** The branch's critical collateral ratio. */
export function branchCcrProv(s: LiquityV2BranchCcr): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary: `${s.branch} branch critical collateral ratio — BorrowerOperations.CCR() at block ${blockOf(s.blockNumber)}, a constant set at deployment. While the branch's TCR is below it, the contract restricts borrower operations.`,
    contract: bo(s),
    via: `${VIA} · block ${blockOf(s.blockNumber)}`,
    inputs: [constRow(s, "CCR", s.ccrRaw)],
    verify: {
      kind: "recompute",
      text: `To check: ask any Ethereum archive node for CCR() on the ${s.branch} BorrowerOperations.`,
    },
    source: { block: s.blockNumber },
  };
}

/** The collateral price at which the branch's TCR meets its SCR, at this
 *  block's collateral and debt. */
export function branchShutdownPriceProv(s: LiquityV2BranchCcr): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `${s.branch} price at the shutdown ratio — the ${s.branch} price at which the branch's TCR equals its SCR, at the collateral and debt read at block ${blockOf(s.blockNumber)}: SCR × debt ÷ collateral. Below the SCR, BorrowerOperations.shutdown() succeeds for any caller.`,
    contract: bo(s),
    via: `${VIA} · block ${blockOf(s.blockNumber)}`,
    formula: "SCR × getEntireBranchDebt ÷ getEntireBranchColl",
    inputs: [constRow(s, "SCR", s.scrRaw), debtRow(s), collRow(s)],
    verify: {
      kind: "recompute",
      text: `To check: ask any Ethereum archive node, at block ${blockOf(s.blockNumber)}, for SCR() on the BorrowerOperations and getEntireBranchDebt() and getEntireBranchColl() on the TroveManager; multiply SCR by debt and divide by collateral (${formatUsdValue(s.shutdownPrice)}).`,
    },
    source: { block: s.blockNumber },
  };
}

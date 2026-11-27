// Receipts for a Liquity V2 branch below its critical ratio (rails-ops
// TO-DO-ui-jobs 747, 858): the TCR, the CCR, the price at which the TCR meets
// the SCR, and a batched Trove's floor (MCR + BCR), each at the block the
// branch was read at (lib/sources/chain/liquity-v2-branch-ccr.ts); and the
// TCR one Trove's close would leave, from two reads: the branch at its block
// and the Trove's getLatestTroveData at the chain head (/api/trove/state),
// so that receipt names each read's block and carries no single source block.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { formatExactFromString, formatUnitsExact, formatUsdValue } from "@/lib/utils/format";
import { tcrPercentText, type LiquityV2BranchCcr, type TroveCloseCheck } from "./branch-ccr";

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
const constRow = (s: LiquityV2BranchCcr, name: "CCR" | "SCR" | "MCR" | "BCR", raw: string): ProvInput => ({
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

/** A batched Trove's floor, MCR + BCR: every adjustment of a Trove in a batch
 *  must leave its ICR at or above it. Null where BCR did not answer. */
export function branchBatchFloorProv(s: LiquityV2BranchCcr): Provenance | null {
  if (s.bcrRaw == null) return null;
  const floor = (BigInt(s.mcrRaw) + BigInt(s.bcrRaw)).toString();
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `${s.branch} branch floor for a delegated rate — the collateral ratio, ${pct(Number(floor) / 1e18, 0)} at block ${blockOf(s.blockNumber)}, that each change to a Trove with a delegated rate must leave it at or above (BorrowerOperations._requireICRisAboveMCRPlusBCR).`,
    contract: bo(s),
    via: `${VIA} · block ${blockOf(s.blockNumber)}`,
    formula: "MCR + BCR",
    inputs: [constRow(s, "MCR", s.mcrRaw), constRow(s, "BCR", s.bcrRaw)],
    verify: {
      kind: "recompute",
      text: `To check: ask any Ethereum archive node for MCR() and BCR() on the ${s.branch} BorrowerOperations and add them.`,
    },
    source: { block: s.blockNumber },
  };
}

/** The branch's TCR once this Trove is closed, which closeTrove compares with
 *  the CCR (_requireNewTCRisAboveCCR). */
export function troveCloseTcrProv(s: LiquityV2BranchCcr, c: TroveCloseCheck, troveId: string): Provenance {
  const troveVia = `GET /api/trove/state/${s.branch}/${troveId}`;
  const troveNote = "chain head, read when this page loaded";
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `${s.branch} branch TCR after this Trove's close — the branch's collateral and debt without this Trove, at ${priceLabel(s)}, give ${tcrPercentText(c.newTcrRaw)} against the CCR of ${pct(s.ccr, 0)}. BorrowerOperations.closeTrove reverts while this ratio is below the CCR. Two reads: the branch at block ${blockOf(s.blockNumber)}, the Trove at the chain head when this page loaded.`,
    contract: bo(s),
    via: `two reads: ${VIA} · block ${blockOf(s.blockNumber)}; ${troveVia} · chain head`,
    formula: "(getEntireBranchColl − entireColl) × price ÷ (getEntireBranchDebt − entireDebt) ≥ CCR",
    inputs: [
      collRow(s),
      {
        label: "TroveManager.getLatestTroveData().entireColl",
        value: `${exact(c.collRaw)} ${s.branch}`,
        kind: "chain",
        pclass: "state",
        note: troveNote,
        contract: tm(s),
      },
      priceRow(s),
      debtRow(s),
      {
        label: "TroveManager.getLatestTroveData().entireDebt",
        value: `${exact(c.debtRaw)} BOLD`,
        kind: "chain",
        pclass: "state",
        note: troveNote,
        contract: tm(s),
      },
      constRow(s, "CCR", s.ccrRaw),
    ],
    verify: {
      kind: "recompute",
      text: `To check: ask any Ethereum archive node, at block ${blockOf(s.blockNumber)}, for getEntireBranchColl() and getEntireBranchDebt() on the ${s.branch} TroveManager and fetchPrice() on the PriceFeed, and at the chain head for getLatestTroveData(${troveId}) on the same TroveManager; take the Trove's entireColl and entireDebt from the branch's, multiply the collateral left by the price, divide by the debt left and compare with CCR().`,
    },
    // No source block: the receipt rests on two reads, each named on its rows.
  };
}

// Receipts for the Liquity V2 redeemer page: one redemption row's fields from
// its TroveOperation log, and the index's sums over every row of the wallet
// (rails-server GET /api/liquity-v2/redeemer/:address).

import type { Provenance } from "@/components/shared/provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { LiquityV2RedemptionRow } from "@/lib/sources/api/liquity-v2-redeemer";

const VIA = "GET /api/liquity-v2/redeemer/:address";

/** One field of a redemption row, from its TroveOperation log. */
export function redemptionLogProv(what: "bold" | "coll" | "trove" | "block", r: LiquityV2RedemptionRow): Provenance {
  const c = r.collateral_type;
  const summary = {
    bold: "BOLD redeemed — the BOLD this redemption took off the Trove's debt: the TroveOperation log's _debtChangeFromOperation, with its sign turned.",
    coll: `${c} paid out of the Trove — the ${c} this redemption took out of the Trove: the TroveOperation log's _collChangeFromOperation, with its sign turned. The redemption fee stays in the Trove and is left out.`,
    trove: `Trove — the _troveId of the ${c} TroveManager's TroveOperation log, with _operation redeemCollateral (6).`,
    block: "Block — the block this TroveOperation was logged in.",
  }[what];
  const raw = what === "bold" ? r.bold_raw : what === "coll" ? r.coll_raw : null;
  return {
    kind: "chain",
    pclass: "emitted",
    summary,
    contract: { name: `Liquity V2 ${c} TroveManager`, address: r.contract_address },
    source: { block: r.block_number, txHash: r.transaction_hash },
    verify: {
      kind: "etherscan",
      href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", r.transaction_hash),
      text: "Confirm in the tx event logs",
    },
    ...(raw
      ? { scaling: { raw, from: "log" as const, places: 18, why: `${what === "bold" ? "BOLD" : c} has 18 decimals` } }
      : {}),
    via: VIA,
  };
}

const SUM = {
  bold: () =>
    "BOLD redeemed — the sum over every redemption row of this wallet, on all three branches: each Trove's TroveOperation _debtChangeFromOperation, with its sign turned.",
  branchBold: (c: string) =>
    `BOLD redeemed on ${c} — the sum over this wallet's redemption rows on the ${c} branch of each TroveOperation's _debtChangeFromOperation, with its sign turned. Per transaction it equals the Redemption log's _actualBoldAmount.`,
  branchColl: (c: string) =>
    `${c} paid out of Troves — the sum over this wallet's redemption rows on the ${c} branch of each TroveOperation's _collChangeFromOperation, with its sign turned. Per transaction it equals the Redemption log's _ETHSent, the fees staying in the Troves.`,
  troves: () =>
    "Troves hit — the Troves this wallet's redemptions took debt from, each counted once by branch and Trove id.",
  transactions: () => "Transactions — the transactions this wallet sent that logged a redemption, each counted once.",
} as const;

/** A sum over every row of the wallet, as of the newest block the index holds. */
export function redeemerSumProv(what: keyof typeof SUM, servedThru: string | null, branch = ""): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: SUM[what](branch),
    via: `${VIA} · totals`,
    ...(servedThru
      ? {
          inputs: [
            { label: "Rows through block", value: servedThru, kind: "chain" as const, pclass: "indexed" as const },
          ],
        }
      : {}),
  };
}

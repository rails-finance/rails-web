// The gas compensation escrow of Liquity V2 and its forks: the constant each
// deployment states (lib/<family>/event-provenance.ts), what an event does to
// it, and its receipt. The card's parts are components/protocol/liquity-family/
// gas-escrow.ts (rails-ops TO-DO-ui-jobs 363, 366).

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";

/** One deployment's escrow constant and where it was read. */
export interface LiquityGasEscrow {
  /** The protocol's name in the receipts ("Liquity V2"). */
  protocol: string;
  amount: number;
  /** The token it is paid in, the same on every branch (WETH). */
  symbol: string;
  address: string;
  /** Where the constant was established, for the receipt's via and its
   *  input's note ("Constants.sol ETH_GAS_COMPENSATION"). */
  source: string;
  /** The amount as the receipt prints it ("0.0375 WETH"). */
  label: string;
}

/** What an event does to the escrow: sends it (the open), holds it (every
 *  event between), returns it (the close), pays it to the liquidator. */
export type GasEscrowMove = "sent" | "held" | "returned" | "paid";

/** The escrow's move at a holder event of an open Trove. */
export function gasEscrowMove(kind: { open: boolean; close: boolean; liquidation: boolean }): GasEscrowMove {
  return kind.open ? "sent" : kind.close ? "returned" : kind.liquidation ? "paid" : "held";
}

/** The receipt for the escrow at an event. `verify` and `inputs` are the
 *  event's own (its transaction's logs and coordinates). */
export function gasEscrowProv(
  e: LiquityGasEscrow,
  move: GasEscrowMove,
  at: { verify?: ProvVerify; inputs?: ProvInput[]; block?: number },
): Provenance {
  const what = `the fixed ${e.label} every ${e.protocol} Trove sends to its branch's GasPool beside its collateral at the open, held apart from the collateral and outside the collateral ratio`;
  const summary = {
    sent: `Gas compensation escrow sent at the open — ${what}. The close returns it and a liquidation pays it to the liquidator. The TroveUpdated log does not carry it; this transaction's ${e.symbol} Transfer to the GasPool does.`,
    returned: `Gas compensation escrow returned at the close — ${what}, sent back by the GasPool. This transaction's ${e.symbol} Transfer from the GasPool carries it; the TroveUpdated log does not.`,
    paid: `Gas compensation escrow paid to the liquidator — ${what}, paid out by the GasPool to the address that called the liquidation, beside its share of the collateral. This transaction's ${e.symbol} Transfer from the GasPool carries it.`,
    held: `Gas compensation escrow held by the branch's GasPool${at.block != null ? ` at block ${at.block}` : ""} — ${what}. No event between the open and the close moves it.`,
  }[move];
  return {
    kind: "chain-derived",
    pclass: "state",
    verify:
      move === "held"
        ? {
            kind: "recompute",
            text: `Every open sends ${e.label} to the GasPool and every close takes it back: read the open's or the close's ${e.symbol} Transfer logs.`,
          }
        : at.verify,
    summary,
    via: `the protocol constant (${e.source}, ${e.label})${move === "held" ? " · held since the open" : ` · this transaction's ${e.symbol} Transfer ${move === "sent" ? "to" : "from"} the GasPool`}`,
    inputs: [
      { label: "gas compensation", value: e.label, kind: "chain", pclass: "state", note: e.source },
      ...(at.inputs ?? []),
    ],
  };
}

/** A deployment's escrow receipt at an event, linked to the event's
 *  transaction on its chain's explorer. */
export function gasEscrowReceipt(
  e: LiquityGasEscrow,
  chainId: ChainId,
): (move: GasEscrowMove, coords?: { txHash?: string; blockNumber?: number }) => Provenance {
  return (move, coords) => {
    const inputs: ProvInput[] = [];
    if (coords?.blockNumber != null)
      inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
    if (coords?.txHash && move !== "held")
      inputs.push({ label: "tx", value: coords.txHash, kind: "chain", note: `${e.symbol} Transfer` });
    return gasEscrowProv(e, move, {
      verify: coords?.txHash
        ? {
            kind: "etherscan",
            href: explorerUrl(chainId, "tx", coords.txHash),
            text: `Confirm the ${e.symbol} Transfer in the transaction`,
          }
        : undefined,
      inputs,
      block: coords?.blockNumber,
    });
  };
}

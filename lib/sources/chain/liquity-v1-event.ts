// One Liquity V1 Trove event read from its transaction receipt — the figures
// the captured TroveUpdated stream does not carry. The stream gives the Trove's
// debt and collateral either side of the event; the receipt says where the
// LUSD and ETH went:
//
//   • the borrowing fee (BorrowerOperations' LUSDBorrowingFeePaid for this
//     borrower), the LUSD minted to the borrower, and the 200 LUSD reserve
//     minted to the GasPool, on an open or a draw;
//   • the LUSD burned from the borrower and the reserve burned from the GasPool
//     on a close (the owner repays the debt less the reserve);
//   • on a liquidation, what the Stability Pool burned and received, what the
//     liquidator was paid (the reserve and 0.5% of the ETH), what was
//     redistributed to other Troves, and any ETH sent to the CollSurplusPool;
//     when the transaction liquidated several Troves, this Trove's share
//     (splitLiquidation), or the totals where the share does not reconcile.
//
// Plus the protocol's ETH price at the end of the event's block
// (PriceFeed.lastGoodPrice, the figure the redemption rows already carry), so
// the opened card can state the collateral ratio either side of the event.
// rails-server's `/api/at-block/liquity-v1/event` reads it (its
// services/liquity-v1-event.ts) and keeps the transaction, its receipt and
// each call once the block is final (server migs 412, 413, 417; rails-ops
// decisions/0056). A past block never changes, so the route caches the answer
// hard.
//
// SERVER-ONLY.

import { atBlockGet } from "./at-block-api";

export interface LiquityV1LiquidationRead {
  /** Troves this transaction liquidated. */
  trovesInTx: number;
  /** Whose figures these are when the transaction liquidated several Troves:
   *  "trove" when this Trove's share was worked out and reconciles with the
   *  transaction's totals, "transaction" when it did not and the figures are
   *  the totals. Always "trove" for a single liquidation. */
  share: "trove" | "transaction";
  /** This Trove was liquidated under Recovery Mode's rules. */
  recoveryMode: boolean;
  liquidator: string | null;
  /** The 200 LUSD reserve paid to the liquidator. */
  liquidatorLusd: string;
  /** 0.5% of the liquidated ETH, paid to the liquidator. */
  liquidatorEth: string;
  /** LUSD the Stability Pool burned to cancel the debt. */
  stabilityPoolDebt: string;
  /** ETH the Stability Pool received. */
  stabilityPoolEth: string;
  /** Debt and ETH shared out to the other open Troves (the Stability Pool
   *  could not cover them). */
  redistributedDebt: string;
  redistributedEth: string;
  /** ETH sent to the CollSurplusPool — a Recovery Mode liquidation capped at
   *  110% of the debt leaves the rest there for the owner. */
  surplusEth: string;
}

export interface LiquityV1EventRead {
  txHash: string;
  blockNumber: number;
  /** PriceFeed.lastGoodPrice at the end of the event's block (USD per ETH). */
  priceUsd: number | null;
  /** The transaction's sender — who paid its gas and, on a liquidation, who
   *  called it. */
  sender: string;
  /** The transaction's gas, paid by the sender: gas used × the effective gas
   *  price, in ETH. Absent on an answer cached before it was added. */
  gas?: { gasUsed: number; gasCostEth: number } | null;
  /** LUSDBorrowingFeePaid for this borrower; null when the event is absent
   *  (no draw in this transaction). */
  borrowingFee: string | null;
  /** LUSD minted to the borrower. */
  lusdMintedToOwner: string;
  /** LUSD burned from the borrower (a repayment or a close). */
  lusdBurnedFromOwner: string;
  /** LUSD minted to / burned from the GasPool: the 200 LUSD reserve. */
  reserveMinted: string;
  reserveBurned: string;
  /** ETH the ActivePool sent to the borrower. */
  ethToOwner: string;
  liquidation: LiquityV1LiquidationRead | null;
}

export function readLiquityV1Event(txHash: string, wallet: string, readerIp?: string): Promise<LiquityV1EventRead> {
  return atBlockGet<LiquityV1EventRead>("liquity-v1/event", new URLSearchParams({ tx: txHash, wallet }), readerIp);
}

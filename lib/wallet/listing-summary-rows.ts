// The wallet read's rows for the kinds wallet_positions does not hold yet:
// Liquity V1 Troves and the Stability Pool deposits on Liquity V1 and V2
// (ui-jobs 794). Each row is shaped from the protocol listing's row for the
// wallet, as rails-server's listing route answers it, into the summary row the
// family modules take, with the listing row as its `card`. A deposit row
// carries `kind: "deposits"`, which routes it to its own module. Pure: the
// reads are in lib/wallet/read-wallet.ts.

import type { WalletSummaryRow } from "./summary-row";
import type { LiquityV1PositionSummary } from "../sources/api/liquity-v1-positions";
import type { LiquityV1DepositRow } from "../sources/api/liquity-v1-sp";
import type { LiquityV2DepositRow } from "../sources/api/liquity-v2-sp";

const V1_PATH = "/ethereum/liquity-v1";
const V2_SP_PATH = "/ethereum/liquity-v2/stability-pool";

const seconds = (s: string | number | null | undefined): number | null => {
  const n = Number(s);
  return s != null && s !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

const blockOf = (s: string | number | null | undefined): number | null => seconds(s);

/** A Trove life: (wallet, epoch). A life a redemption ended is "redeemed". */
export function liquityV1TroveSummaryRow(t: LiquityV1PositionSummary, owner: string): WalletSummaryRow {
  const open = t.status === "open";
  return {
    chain: "ethereum",
    family: "liquity-v1",
    positionId: `${t.wallet.toLowerCase()}-${t.epoch}`,
    owner,
    market: null,
    status: t.status === "closed" && t.closedByRedemption ? "redeemed" : t.status,
    collateral: { amount: t.collateralRaw, symbol: "ETH" },
    debt: { amount: t.debtRaw, symbol: "LUSD" },
    collateralUsd: null,
    debtUsd: null,
    usdSource: null,
    peakCollateral: null,
    peakDebt: null,
    openedAt: null,
    closedAt: open ? null : seconds(t.lastActivityAt),
    lastActivityAt: seconds(t.lastActivityAt),
    txCount: t.txCount,
    liquidationCount: t.liquidationCount,
    readBlock: blockOf(t.lastBlockNumber),
    readAt: null,
    href: `${V1_PATH}/${t.wallet.toLowerCase()}?epoch=${t.epoch}`,
    card: t,
    writtenAt: "",
  };
}

type DepositRow = LiquityV1DepositRow | LiquityV2DepositRow;

function depositRow(
  r: DepositRow,
  owner: string,
  family: string,
  positionId: string,
  market: string | null,
  symbol: string,
  href: string,
): WalletSummaryRow {
  const open = r.status === "open";
  return {
    chain: "ethereum",
    family,
    kind: "deposits",
    positionId,
    owner,
    market,
    status: r.status,
    collateral: { amount: r.deposit_raw, symbol },
    debt: null,
    collateralUsd: null,
    debtUsd: null,
    usdSource: null,
    peakCollateral: null,
    peakDebt: null,
    openedAt: seconds(r.first_timestamp),
    closedAt: open ? null : seconds(r.last_timestamp),
    lastActivityAt: seconds(r.last_timestamp),
    txCount: r.tx_count,
    liquidationCount: null,
    readBlock: blockOf(r.last_block),
    readAt: null,
    href,
    card: r,
    writtenAt: "",
  };
}

/** The one deposit an address holds in Liquity V1's pool. */
export const liquityV1DepositSummaryRow = (r: LiquityV1DepositRow, owner: string): WalletSummaryRow =>
  depositRow(
    r,
    owner,
    "liquity-v1",
    r.depositor.toLowerCase(),
    null,
    "LUSD",
    `${V1_PATH}/stability-pool/${r.depositor.toLowerCase()}`,
  );

/** One branch pool's deposit. */
export const liquityV2DepositSummaryRow = (r: LiquityV2DepositRow, owner: string): WalletSummaryRow =>
  depositRow(
    r,
    owner,
    "liquity-v2",
    `${r.collateral_type}:${r.depositor.toLowerCase()}`,
    r.collateral_type,
    "BOLD",
    `${V2_SP_PATH}/${r.collateral_type}/${r.depositor.toLowerCase()}`,
  );

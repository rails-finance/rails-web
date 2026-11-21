// Liquity V1 Troves and the Stability Pool deposits on Liquity V1 and V2, for
// the wallet view (ui-jobs 794; SERVER-ONLY). Their rows come from the
// protocol listings' routes, not wallet_positions (read-wallet.ts,
// `readListingRows`); each card is the listing row as served. The head reads
// are the position pages' own readers, one per open position:
//   Liquity V1 Trove    loadLiquityV1PositionFromChain: the entire collateral
//                       and debt, the PriceFeed price and the ratio the
//                       TroveManager computes.
//   V1 and V2 deposits  loadLiquityV1DepositFromChain and
//                       loadLiquityV2DepositFromChain: the compounded deposit
//                       and the collateral owed to it at head, in dollars as
//                       the full claim (lib/wallet/deposit-claim.ts): V1's
//                       ETH at the PriceFeed, V2's collateral at the branch
//                       prices the Troves use.

import { loadLiquityV1PositionFromChain } from "@/lib/sources/chain/liquity-v1-position";
import { loadLiquityV1DepositFromChain } from "@/lib/sources/chain/liquity-v1-sp";
import { loadLiquityV2DepositFromChain } from "@/lib/sources/chain/liquity-v2-sp";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import type { LiquityV1DepositRow } from "@/lib/sources/api/liquity-v1-sp";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { amountText, historyBase, plural, scaled, storeStamp, type WalletSummaryRow } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";
import { liquityPrices, priceOf } from "./ethereum-single";
import { depositClaim, type DepositClaim } from "@/lib/wallet/deposit-claim";

const now = () => Math.floor(Date.now() / 1000);

/** The head read of each open position, one call each, all at once. A call
 *  that fails or answers stale leaves that position's store figures. */
async function eachOpen(
  open: WalletPosition[],
  read: (p: WalletPosition) => Promise<WalletPosition | null>,
): Promise<HeadResult> {
  const settled = await Promise.allSettled(open.map(read));
  return {
    reads: open.length,
    positions: settled.map((s, i) =>
      s.status === "fulfilled" && s.value ? s.value : { ...open[i], headRead: "failed" as const },
    ),
  };
}

function base(r: WalletSummaryRow, familyName: string, market: string, card: WalletPosition["card"]): WalletPosition {
  return {
    chain: MAINNET_CHAIN_ID,
    family: r.family,
    familyName,
    market,
    positionId: r.positionId,
    href: r.href,
    status: r.status,
    card,
    headRead: "none",
    ...storeStamp(r),
  };
}

export const liquityV1: FamilyModule = {
  id: "liquity-v1",
  name: "Liquity V1",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "liquity-v1",
  async shape(rows) {
    return rows.map((r): WalletPosition => {
      const t = r.card as LiquityV1PositionSummary;
      const p = base(r, "Liquity V1", "Trove", { kind: "liquity-v1", row: t });
      if (r.status === "open") return p;
      const parts = [
        t.peakCollateral > 0 ? amountText(t.peakCollateral, "ETH") : null,
        t.peakDebt > 0 ? amountText(t.peakDebt, "LUSD") : null,
      ].filter(Boolean);
      return {
        ...p,
        history: {
          ...historyBase(r),
          size: parts.length ? parts.join(" / ") : undefined,
          sizeNote: parts.length ? "highest recorded" : undefined,
          result: t.redemptionCount > 0 ? plural(t.redemptionCount, "redemption") : undefined,
        },
      };
    });
  },
  head(open) {
    return eachOpen(open, async (p) => {
      const t = (p.card as { row: LiquityV1PositionSummary }).row;
      const c = await loadLiquityV1PositionFromChain(t.wallet);
      if (c.chainStale || c.troveStatus !== "active") return null;
      const collateralUsd = c.coll * c.price;
      const cr = c.icr ?? undefined;
      return {
        ...p,
        collateralUsd,
        debtUsd: c.debt,
        usdSource: "the Liquity V1 PriceFeed, debt in LUSD",
        usdOwnOracle: true,
        buffer: cr != null ? 1 - c.mcr / cr : undefined,
        riskFigure:
          cr != null
            ? { value: `${(cr * 100).toFixed(1)}% CR`, label: `liquidates below ${(c.mcr * 100).toFixed(0)}%` }
            : undefined,
        liquidatable: cr != null ? cr < c.mcr : undefined,
        headRead: "read",
        readAtBlock: c.blockNumber,
        readAt: now(),
      };
    });
  },
};

/** A deposit's shaping: its card, and for a closed one what it put in. */
function shapeDeposit(
  r: WalletSummaryRow,
  familyName: string,
  market: string,
  card: WalletPosition["card"],
  deposited: string,
  symbol: string,
): WalletPosition {
  const p = { ...base(r, familyName, market, card), kind: "deposits" as const };
  if (r.status === "open") return p;
  const total = scaled(deposited, 18);
  return {
    ...p,
    history: {
      ...historyBase(r),
      size: total > 0 ? amountText(total, symbol) : undefined,
      sizeNote: total > 0 ? "deposited in all" : undefined,
    },
  };
}

/** A deposit's figures at head: the full claim in dollars, and the head
 *  read on its card. */
function depositAtHead(
  p: WalletPosition,
  claim: DepositClaim,
  block: number,
  card: WalletPosition["card"],
): WalletPosition {
  return {
    ...p,
    card,
    collateralUsd: claim.usd,
    debtUsd: 0,
    usdSource: claim.parts.map((x) => x.source).join(" and "),
    usdParts: claim.parts,
    usdOwnOracle: true,
    headRead: "read",
    readAtBlock: block,
    readAt: now(),
  };
}

export const liquityV1Deposits: FamilyModule = {
  id: "liquity-v1-sp",
  name: "Liquity V1",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "liquity-v1",
  summaryKind: "deposits",
  async shape(rows) {
    return rows.map((r) => {
      const d = r.card as LiquityV1DepositRow;
      return shapeDeposit(
        r,
        "Liquity V1",
        "Stability Pool",
        { kind: "liquity-v1-deposit", row: d },
        d.deposited_raw,
        "LUSD",
      );
    });
  },
  head(open) {
    return eachOpen(open, async (p) => {
      const d = (p.card as { row: LiquityV1DepositRow }).row;
      const c = await loadLiquityV1DepositFromChain(d.depositor);
      if (c.chainStale) return null;
      const claim = depositClaim({
        deposit: scaled(c.compoundedRaw, 18),
        symbol: "LUSD",
        gain: scaled(c.ethGainRaw, 18),
        gainSymbol: "ETH",
        price: c.priceRaw != null ? scaled(c.priceRaw, 18) : null,
        feed: "the Liquity V1 PriceFeed",
        unvalued: "LQTY",
      });
      return claim ? depositAtHead(p, claim, c.blockNumber, { kind: "liquity-v1-deposit", row: d, head: c }) : null;
    });
  },
};

export const liquityV2Deposits: FamilyModule = {
  id: "liquity-v2-sp",
  name: "Liquity V2",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "liquity-v2",
  summaryKind: "deposits",
  async shape(rows) {
    return rows.map((r) => {
      const d = r.card as LiquityV2DepositRow;
      return shapeDeposit(
        r,
        "Liquity V2",
        `${d.collateral_type} Stability Pool`,
        { kind: "liquity-v2-deposit", row: d },
        d.deposited_raw,
        "BOLD",
      );
    });
  },
  async head(open, _address, signal) {
    // The branch prices the Troves are valued at, one read for every deposit.
    const prices = await liquityPrices(signal).catch(() => null);
    return eachOpen(open, async (p) => {
      const d = (p.card as { row: LiquityV2DepositRow }).row;
      const c = await loadLiquityV2DepositFromChain(d.collateral_type, d.depositor);
      if (c.chainStale) return null;
      const claim = depositClaim({
        deposit: scaled(c.compoundedRaw, 18),
        symbol: "BOLD",
        // What a claiming touch sends: the gain since the last touch and the stash.
        gain: scaled(c.collGainRaw, 18) + scaled(c.stashRaw, 18),
        gainSymbol: d.collateral_type,
        price: priceOf(d.collateral_type, prices),
        feed: "the Liquity V2 price feed",
      });
      return claim ? depositAtHead(p, claim, c.blockNumber, { kind: "liquity-v2-deposit", row: d, head: c }) : null;
    });
  },
};

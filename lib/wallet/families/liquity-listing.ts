// Liquity V1 Troves and LQTY stakes, and the Stability Pool deposits on
// Liquity V1 and V2, for the wallet view (ui-jobs 794; SERVER-ONLY). Their rows come from the
// protocol listings' routes, not wallet_positions (read-wallet.ts,
// `readListingRows`); each card is the listing row as served. The head reads
// are the position pages' own readers, one per open position:
//   Liquity V1 Trove    loadLiquityV1PositionFromChain: the entire collateral
//                       and debt, the PriceFeed price and the ratio the
//                       TroveManager computes.
//   V1 and V2 deposits  loadLiquityV1DepositFromChain and
//                       loadLiquityV2DepositFromChain: the compounded deposit
//                       and the collateral owed to it at head, in dollars as
//                       the full claim (lib/wallet/deposit-claim.ts): the
//                       collateral owed at the PriceFeed price the same
//                       multicall reads at the same block (V1's ETH, V2's
//                       branch collateral).
//   V1 LQTY stake       loadLiquityV1StakeFromChain: the stake and the fees
//                       pending at head, in dollars as the claim: the LUSD
//                       fees at $1, the ETH fees at the PriceFeed price of the
//                       same read, the LQTY staked not valued.

import { loadLiquityV1PositionFromChain } from "@/lib/sources/chain/liquity-v1-position";
import { loadLiquityV1DepositFromChain } from "@/lib/sources/chain/liquity-v1-sp";
import { loadLiquityV2DepositFromChain } from "@/lib/sources/chain/liquity-v2-sp";
import type { LiquityV1DepositChain } from "@/lib/api/fetch-liquity-v1-sp-chain";
import type { LiquityV2DepositChain } from "@/lib/api/fetch-liquity-v2-sp-chain";
import type { LiquityV1StakeChain } from "@/lib/api/fetch-liquity-v1-staking-chain";
import type { LiquityV1StakeRow } from "@/lib/sources/api/liquity-v1-staking";
import { loadLiquityV1StakeFromChain } from "@/lib/sources/chain/liquity-v1-staking";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import type { LiquityV1DepositRow } from "@/lib/sources/api/liquity-v1-sp";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { inChain } from "@/lib/wallet/api-hop";
import type { WalletPosition } from "@/lib/wallet/types";
import { amountText, historyBase, plural, scaled, storeStamp, type WalletSummaryRow } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";
import { depositClaim, stakeClaim, type DepositClaim } from "@/lib/wallet/deposit-claim";
import { withShutdowns } from "./branch-shutdown";

const now = () => Math.floor(Date.now() / 1000);

/** The head read of each open position, one call each, all at once. A call
 *  that fails or answers stale leaves that position's store figures. */
async function eachOpen(
  open: WalletPosition[],
  read: (p: WalletPosition) => Promise<WalletPosition | null>,
): Promise<HeadResult> {
  // Each row is a chain of its own in the api cap's lanes.
  const settled = await Promise.allSettled(open.map((p) => inChain(() => read(p))));
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
          sizeNote: parts.length ? "peak" : undefined,
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
    usdSource: claim.parts
      .filter((x) => x.usd != null)
      .map((x) => x.source)
      .join(" and "),
    usdParts: claim.parts,
    usdOwnOracle: true,
    headRead: "read",
    readAtBlock: block,
    readAt: now(),
  };
}

/** The PriceFeed price a deposit read gives, as the receipt names it:
 *  fetchPrice, or lastGoodPrice where only that answered. */
const feedOf = (name: string, stale: boolean, block: number) =>
  `${name}'s ${stale ? "lastGoodPrice" : "fetchPrice"} at block ${block.toLocaleString("en-US")}`;

/** The V1 deposit's head: its pool read, the ETH owed at the PriceFeed price
 *  of the same read. `load` is the pool reader (a stub in the tests). */
export const liquityV1DepositHead =
  (load: (depositor: string) => Promise<LiquityV1DepositChain>) =>
  (open: WalletPosition[]): Promise<HeadResult> =>
    eachOpen(open, async (p) => {
      const d = (p.card as { row: LiquityV1DepositRow }).row;
      const c = await load(d.depositor);
      if (c.chainStale) return null;
      const claim = depositClaim({
        deposit: scaled(c.compoundedRaw, 18),
        symbol: "LUSD",
        gain: scaled(c.ethGainRaw, 18),
        gainSymbol: "ETH",
        price: c.priceRaw != null ? scaled(c.priceRaw, 18) : null,
        feed: feedOf("the Liquity V1 PriceFeed", c.priceStale, c.blockNumber),
        unvalued: { symbol: "LQTY", amount: scaled(c.lqtyGainRaw, 18) },
      });
      return claim ? depositAtHead(p, claim, c.blockNumber, { kind: "liquity-v1-deposit", row: d, head: c }) : null;
    });

/** The V2 deposit's head: its branch pool read, the collateral owed (the
 *  gain since the last touch and the stash, what a claiming touch sends) at
 *  the branch PriceFeed price of the same read. */
export const liquityV2DepositHead =
  (load: (branch: LiquityV2DepositRow["collateral_type"], depositor: string) => Promise<LiquityV2DepositChain>) =>
  (open: WalletPosition[]): Promise<HeadResult> =>
    eachOpen(open, async (p) => {
      const d = (p.card as { row: LiquityV2DepositRow }).row;
      const c = await load(d.collateral_type, d.depositor);
      if (c.chainStale) return null;
      const claim = depositClaim({
        deposit: scaled(c.compoundedRaw, 18),
        symbol: "BOLD",
        gain: scaled(c.collGainRaw, 18) + scaled(c.stashRaw, 18),
        gainSymbol: d.collateral_type,
        price: c.priceRaw != null ? scaled(c.priceRaw, 18) : null,
        feed: feedOf(`the Liquity V2 ${d.collateral_type} PriceFeed`, c.priceStale, c.blockNumber),
      });
      return claim ? depositAtHead(p, claim, c.blockNumber, { kind: "liquity-v2-deposit", row: d, head: c }) : null;
    });

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
  head: liquityV1DepositHead(loadLiquityV1DepositFromChain),
};

export const liquityV2Deposits: FamilyModule = {
  id: "liquity-v2-sp",
  name: "Liquity V2",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "liquity-v2",
  summaryKind: "deposits",
  async shape(rows) {
    const shaped = rows.map((r) => {
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
    // Each open deposit's branch state (ui-jobs 802).
    return withShutdowns("liquity-v2", shaped, (p) => (p.card as { row: LiquityV2DepositRow }).row.collateral_type);
  },
  head: liquityV2DepositHead(loadLiquityV2DepositFromChain),
};

/** The V1 stake's head: LQTYStaking's read, the LUSD fees at $1 and the ETH
 *  fees at the PriceFeed price of the same read, the LQTY not valued. `load`
 *  is the staking reader (a stub in the tests). */
export const liquityV1StakeHead =
  (load: (staker: string) => Promise<LiquityV1StakeChain>) =>
  (open: WalletPosition[]): Promise<HeadResult> =>
    eachOpen(open, async (p) => {
      const r = (p.card as { row: LiquityV1StakeRow }).row;
      const c = await load(r.staker);
      if (c.chainStale) return null;
      const claim = stakeClaim({
        stake: scaled(c.stakeRaw, 18),
        lusd: scaled(c.lusdGainRaw, 18),
        eth: scaled(c.ethGainRaw, 18),
        price: c.priceRaw != null ? scaled(c.priceRaw, 18) : null,
        feed: feedOf("the Liquity V1 PriceFeed", c.priceStale, c.blockNumber),
      });
      return claim ? depositAtHead(p, claim, c.blockNumber, { kind: "liquity-v1-stake", row: r, head: c }) : null;
    });

export const liquityV1Stakes: FamilyModule = {
  id: "liquity-v1-staking",
  name: "Liquity V1",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "liquity-v1",
  summaryKind: "stakes",
  async shape(rows) {
    return rows.map((row): WalletPosition => {
      const r = row.card as LiquityV1StakeRow;
      const p: WalletPosition = {
        ...base(row, "Liquity V1", "Staking", { kind: "liquity-v1-stake", row: r }),
        kind: "stakes",
      };
      if (row.status === "open") return p;
      const staked = scaled(r.staked_raw, 18);
      return {
        ...p,
        history: {
          ...historyBase(row),
          size: staked > 0 ? amountText(staked, "LQTY") : undefined,
          sizeNote: staked > 0 ? "staked in all" : undefined,
        },
      };
    });
  },
  head: liquityV1StakeHead(loadLiquityV1StakeFromChain),
};

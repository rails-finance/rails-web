// Live Morpho Blue per-(market, user) position — the chain detail reader.
// ----------------------------------------------------------------------------
// Morpho Blue is one singleton; a position is two slots — position(id, user)
// and market(id) — plus the params tuple (idToMarketParams). But the market
// slots are AS OF lastUpdate, and the contract exposes NO public health
// verdict (_isHealthy is internal). So this reader does what the contract does
// on touch: accrue interest in view (IRM borrowRateView + the contract's own
// 3-term Taylor compounding), convert borrow shares to assets (toAssetsUp),
// and replicate the health check BigInt-exact:
//
//   maxBorrow = mulDivDown(collateral, oraclePrice, 1e36) wMulDown lltv
//   healthy  <=> maxBorrow >= toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares)
//
// Every step is verified against mainnet by scripts/verify-morpho-chain.mjs
// (market-id keccak identity, oracle scale, replica health on live borrowers).
// The arithmetic is the protocol's, not the chain's, so the same reader serves
// Blue on Base: only which singleton to ask changes, and it is the same address
// there anyway — what actually differs is the roster a caller picked the market
// id out of (see morpho-deployments.ts).
// All derived values are in LOAN-TOKEN units — a Morpho oracle quotes the
// collateral asset in loan-asset terms; there is no protocol USD.
//
// SERVER-ONLY.

import { parseAbi, getAddress } from "viem";
import { chainClient } from "./rpc";
import { resolveErc20Meta, scaleRaw } from "./erc20-meta";
import { MORPHO_DEPLOYMENT, type MorphoDeployment } from "./morpho-deployments";
import type { MorphoChainPositionResponse, MorphoOracleFeed } from "@/lib/api/fetch-morpho-position";

const MORPHO_ABI = parseAbi([
  "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);
const ORACLE_ABI = parseAbi([
  "function price() view returns (uint256)",
  // MorphoChainlinkOracleV2's feed getters — unused ones answer address(0).
  "function BASE_FEED_1() view returns (address)",
  "function BASE_FEED_2() view returns (address)",
  "function QUOTE_FEED_1() view returns (address)",
  "function QUOTE_FEED_2() view returns (address)",
]);
const FEED_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function description() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const FEED_SLOTS = ["BASE_FEED_1", "BASE_FEED_2", "QUOTE_FEED_1", "QUOTE_FEED_2"] as const;
const IRM_ABI = parseAbi([
  "function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) view returns (uint256)",
]);

const WAD = BigInt("1000000000000000000");
const ORACLE_SCALE = BigInt(10) ** BigInt(36);
const VIRTUAL_ASSETS = BigInt(1);
const VIRTUAL_SHARES = BigInt(1_000_000);
const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const SECONDS_PER_YEAR = 31_536_000;

const wMulDown = (x: bigint, y: bigint): bigint => (x * y) / WAD;
/** shares → assets rounded up (Morpho SharesMathLib.toAssetsUp). */
const toAssetsUp = (shares: bigint, totalAssets: bigint, totalShares: bigint): bigint => {
  const den = totalShares + VIRTUAL_SHARES;
  return (shares * (totalAssets + VIRTUAL_ASSETS) + den - BigInt(1)) / den;
};
/** shares → assets rounded DOWN — the supply side. Morpho rounds a lender's
 *  claim down and a borrower's debt up, always against the user and in favour
 *  of the protocol; using one function for both would quietly overstate a
 *  lender by a wei. */
const toAssetsDown = (shares: bigint, totalAssets: bigint, totalShares: bigint): bigint =>
  (shares * (totalAssets + VIRTUAL_ASSETS)) / (totalShares + VIRTUAL_SHARES);
/** assets → shares rounded down (SharesMathLib.toSharesDown) — needed only to
 *  mint the protocol's fee shares exactly as _accrueInterest does. */
const toSharesDown = (assets: bigint, totalAssets: bigint, totalShares: bigint): bigint =>
  (assets * (totalShares + VIRTUAL_SHARES)) / (totalAssets + VIRTUAL_ASSETS);
/** The contract's 3-term Taylor compounding (MathLib.wTaylorCompounded). */
const wTaylorCompounded = (x: bigint, n: bigint): bigint => {
  const first = x * n;
  const second = (first * first) / (BigInt(2) * WAD);
  const third = (second * first) / (BigInt(3) * WAD);
  return first + second + third;
};
/** MorphoBlue.liquidate's incentive: min(1.15, 1 / (1 − 0.3 × (1 − lltv))). */
const lifOf = (lltv: bigint): number => {
  const cursor = (BigInt(3) * WAD) / BigInt(10);
  const maxLif = (BigInt(115) * WAD) / BigInt(100);
  const den = WAD - wMulDown(cursor, WAD - lltv);
  const lif = den > ZERO ? (WAD * WAD) / den : maxLif;
  return Number(lif > maxLif ? maxLif : lif) / 1e18;
};

/**
 * The market oracle's price, and — where the oracle names feeds — each feed's
 * latest round, both at `blockNumber`. Two multicalls: price() with the four
 * feed getters, then latestRoundData / description / decimals on every
 * non-zero feed. A MorphoChainlinkOracleV2 does not check its feeds' age, so
 * their `updatedAt` is the only statement of how old price() is.
 *
 * `feeds` is null — nothing is said about age — when the getters revert (an
 * oracle of another kind, e.g. one priced by hand with setPrice), when all
 * four are zero, or when any named feed fails to answer with a time: the
 * price is as old as its oldest input, so a missing one leaves no age to state.
 */
export async function readOracle(
  client: ReturnType<typeof chainClient>,
  oracle: `0x${string}`,
  blockNumber: bigint,
): Promise<{ price: bigint; feeds: MorphoOracleFeed[] | null }> {
  const [priceRes, ...slotRes] = await client.multicall({
    allowFailure: true,
    blockNumber,
    contracts: [
      { address: oracle, abi: ORACLE_ABI, functionName: "price" },
      { address: oracle, abi: ORACLE_ABI, functionName: "BASE_FEED_1" },
      { address: oracle, abi: ORACLE_ABI, functionName: "BASE_FEED_2" },
      { address: oracle, abi: ORACLE_ABI, functionName: "QUOTE_FEED_1" },
      { address: oracle, abi: ORACLE_ABI, functionName: "QUOTE_FEED_2" },
    ],
  });
  // price() failing is the read failing, exactly as before the feeds were read.
  if (priceRes.status !== "success") throw priceRes.error;
  const price = priceRes.result;

  if (slotRes.some((r) => r.status !== "success")) return { price, feeds: null };
  const named = FEED_SLOTS.map((slot, i) => ({ slot, address: slotRes[i].result as `0x${string}` })).filter(
    (f) => f.address.toLowerCase() !== ZERO_ADDR,
  );
  if (named.length === 0) return { price, feeds: null };

  const rounds = await client.multicall({
    allowFailure: true,
    blockNumber,
    contracts: named.flatMap((f) => [
      { address: f.address, abi: FEED_ABI, functionName: "latestRoundData" as const },
      { address: f.address, abi: FEED_ABI, functionName: "description" as const },
      { address: f.address, abi: FEED_ABI, functionName: "decimals" as const },
    ]),
  });
  const feeds: MorphoOracleFeed[] = [];
  for (let i = 0; i < named.length; i++) {
    const [round, desc, dec] = rounds.slice(i * 3, i * 3 + 3);
    if (round.status !== "success") return { price, feeds: null };
    const [roundId, answer, , updatedAt] = round.result as readonly [bigint, bigint, bigint, bigint, bigint];
    if (updatedAt === ZERO) return { price, feeds: null };
    feeds.push({
      slot: named[i].slot,
      address: named[i].address.toLowerCase(),
      description: desc.status === "success" ? (desc.result as string) : null,
      roundId: roundId.toString(),
      answer: answer.toString(),
      decimals: dec.status === "success" ? Number(dec.result) : null,
      updatedAt: Number(updatedAt),
    });
  }
  return { price, feeds };
}

function stub(marketId: string, user: string): MorphoChainPositionResponse {
  return {
    positionId: `${marketId.replace(/^0x/, "")}-${user}`,
    marketId,
    user,
    blockNumber: 0,
    timestamp: 0,
    loanToken: ZERO_ADDR,
    loanSymbol: "—",
    loanDecimals: 18,
    collateralToken: ZERO_ADDR,
    collateralSymbol: "—",
    collateralDecimals: 18,
    oracle: ZERO_ADDR,
    irm: ZERO_ADDR,
    lltv: 0,
    collateralRaw: "0",
    borrowSharesRaw: "0",
    supplySharesRaw: "0",
    totalBorrowAssetsRaw: "0",
    totalBorrowSharesRaw: "0",
    totalSupplyAssetsRaw: "0",
    totalSupplySharesRaw: "0",
    currentSupply: 0,
    sinceUpdate: 0,
    oraclePrice: 0,
    oracleFeeds: null,
    oraclePublishedAt: null,
    collateral: 0,
    collateralValue: 0,
    currentDebt: 0,
    maxBorrow: 0,
    ltv: null,
    healthFactor: null,
    healthy: null,
    utilization: 0,
    borrowApr: 0,
    supplyApr: 0,
    fee: 0,
    lif: 1,
    chainStale: true,
  };
}

/**
 * Read a (market, user) live Morpho position straight from the singleton.
 * Returns a `chainStale` stub on RPC failure so the caller keeps its
 * replayed numbers and the risk surfaces simply stay off.
 */
export async function loadMorphoPositionFromChain(
  marketRaw: string,
  userRaw: string,
  deployment: MorphoDeployment = MORPHO_DEPLOYMENT,
): Promise<MorphoChainPositionResponse> {
  const marketId = (marketRaw.startsWith("0x") ? marketRaw : `0x${marketRaw}`).toLowerCase();
  let user: string;
  try {
    user = getAddress(userRaw);
  } catch {
    return stub(marketId, userRaw.toLowerCase());
  }

  try {
    const client = chainClient(deployment.chainId);
    const MORPHO = deployment.blue as `0x${string}`;
    const id = marketId as `0x${string}`;

    // Phase 1 — the three singleton slots + the head block (its timestamp
    // anchors the view accrual, exactly as the contract's _accrueInterest does).
    const [block, [params, mkt, pos]] = await Promise.all([
      client.getBlock(),
      client.multicall({
        allowFailure: false,
        contracts: [
          { address: MORPHO, abi: MORPHO_ABI, functionName: "idToMarketParams", args: [id] },
          { address: MORPHO, abi: MORPHO_ABI, functionName: "market", args: [id] },
          { address: MORPHO, abi: MORPHO_ABI, functionName: "position", args: [id, user as `0x${string}`] },
        ],
      }),
    ]);
    const [loanToken, collateralToken, oracle, irm, lltv] = params;
    const [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee] = mkt;
    const [supplyShares, borrowShares, collateral] = pos;
    const isIdle = collateralToken.toLowerCase() === ZERO_ADDR;

    // Phase 2 — the market's own oracle + IRM (both from the params; either may
    // be the zero address on idle markets), plus token metadata. The oracle is
    // asked at the head block's number, so its price and its feeds' rounds are
    // stated at the block the page names.
    const marketStruct = {
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    };
    const paramsStruct = { loanToken, collateralToken, oracle, irm, lltv };
    const [{ price, feeds }, ratePerSec, metas] = await Promise.all([
      isIdle || oracle.toLowerCase() === ZERO_ADDR
        ? Promise.resolve({ price: ZERO, feeds: null })
        : readOracle(client, oracle, block.number),
      irm.toLowerCase() === ZERO_ADDR
        ? Promise.resolve(ZERO)
        : client.readContract({
            address: irm,
            abi: IRM_ABI,
            functionName: "borrowRateView",
            args: [paramsStruct, marketStruct],
          }),
      resolveErc20Meta(
        [loanToken.toLowerCase(), ...(isIdle ? [] : [collateralToken.toLowerCase()])],
        deployment.chainId,
      ),
    ]);

    const loan = metas.get(loanToken.toLowerCase());
    const coll = metas.get(collateralToken.toLowerCase());
    const loanDecimals = loan?.decimals ?? 18;
    const collateralDecimals = coll?.decimals ?? 18;

    // View accrual — bring the borrow totals from lastUpdate to head, the same
    // interest the contract would add on the next touch.
    const sinceUpdate = Math.max(0, Number(block.timestamp) - Number(lastUpdate));
    const interest = wMulDown(totalBorrowAssets, wTaylorCompounded(ratePerSec, BigInt(sinceUpdate)));
    const liveBorrowAssets = totalBorrowAssets + interest;

    // The supply side of the same accrual. _accrueInterest credits the WHOLE
    // interest to the supply total and then mints the protocol's cut as fresh
    // SHARES to the fee recipient — which dilutes every existing lender rather
    // than being deducted from them. Replicating the mint is what makes a
    // lender's claim exact rather than about right; skipping it would overstate
    // every supplier on a fee-bearing market.
    const liveSupplyAssets = totalSupplyAssets + interest;
    let liveSupplyShares = totalSupplyShares;
    if (fee > ZERO && interest > ZERO) {
      const feeAmount = wMulDown(interest, fee);
      liveSupplyShares += toSharesDown(feeAmount, liveSupplyAssets - feeAmount, totalSupplyShares);
    }
    const supplyRaw = supplyShares > ZERO ? toAssetsDown(supplyShares, liveSupplyAssets, liveSupplyShares) : ZERO;

    // Debt + health, BigInt-exact in raw loan units (the _isHealthy replica).
    const debtRaw = borrowShares > ZERO ? toAssetsUp(borrowShares, liveBorrowAssets, totalBorrowShares) : ZERO;
    const maxBorrowRaw = price > ZERO ? wMulDown((collateral * price) / ORACLE_SCALE, lltv) : ZERO;
    const healthy = debtRaw > ZERO ? maxBorrowRaw >= debtRaw : null;

    // Human figures — all loan-token units. The oracle price is scaled
    // 1e(36 + loanDecimals − collateralDecimals) per whole collateral token.
    const oraclePrice = price > ZERO ? Number(price) / 10 ** (36 + loanDecimals - collateralDecimals) : 0;
    const collateralHuman = scaleRaw(collateral, collateralDecimals);
    const collateralValue = collateralHuman * oraclePrice;
    const currentDebt = scaleRaw(debtRaw, loanDecimals);
    const maxBorrow = scaleRaw(maxBorrowRaw, loanDecimals);

    const utilization = totalSupplyAssets > ZERO ? Number(totalBorrowAssets) / Number(totalSupplyAssets) : 0;
    const borrowApr = (Number(ratePerSec) / 1e18) * SECONDS_PER_YEAR;
    const feeFraction = Number(fee) / 1e18;

    return {
      positionId: `${marketId.replace(/^0x/, "")}-${user.toLowerCase()}`,
      marketId,
      user: user.toLowerCase(),
      blockNumber: Number(block.number),
      timestamp: Number(block.timestamp),
      loanToken: loanToken.toLowerCase(),
      loanSymbol: loan?.symbol ?? "—",
      loanDecimals,
      collateralToken: collateralToken.toLowerCase(),
      collateralSymbol: coll?.symbol ?? (isIdle ? "—" : "?"),
      collateralDecimals,
      oracle: oracle.toLowerCase(),
      irm: irm.toLowerCase(),
      lltv: Number(lltv) / 1e18,
      collateralRaw: collateral.toString(),
      borrowSharesRaw: borrowShares.toString(),
      supplySharesRaw: supplyShares.toString(),
      totalBorrowAssetsRaw: liveBorrowAssets.toString(),
      totalBorrowSharesRaw: totalBorrowShares.toString(),
      totalSupplyAssetsRaw: liveSupplyAssets.toString(),
      totalSupplySharesRaw: liveSupplyShares.toString(),
      currentSupply: scaleRaw(supplyRaw, loanDecimals),
      sinceUpdate,
      oraclePrice,
      oracleFeeds: feeds,
      oraclePublishedAt: feeds ? Math.min(...feeds.map((f) => f.updatedAt)) : null,
      collateral: collateralHuman,
      collateralValue,
      currentDebt,
      maxBorrow,
      ltv: debtRaw > ZERO && collateralValue > 0 ? currentDebt / collateralValue : null,
      healthFactor: debtRaw > ZERO && currentDebt > 0 && maxBorrow > 0 ? maxBorrow / currentDebt : null,
      healthy,
      utilization,
      borrowApr,
      supplyApr: borrowApr * utilization * (1 - feeFraction),
      fee: feeFraction,
      lif: lifOf(lltv),
      chainStale: false,
    };
  } catch {
    return stub(marketId, userRaw.toLowerCase());
  }
}

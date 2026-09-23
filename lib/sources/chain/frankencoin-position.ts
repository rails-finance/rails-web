// Live Frankencoin per-position read — the chain detail reader. The grain is
// the POSITION CONTRACT ITSELF (a minimal-proxy clone every borrower owns), so
// everything here is the position's own getters at head:
//
//   1. One multicall on the position: minted, price, owner, collateral (the
//      token address), expiration, start, cooldown, challengedAmount,
//      challengePeriod, isClosed, original, minimumCollateral,
//      annualInterestPPM, reserveContribution — plus riskPremiumPPM with
//      allowFailure, whose SUCCESS is the V2 marker (V1 has no such getter).
//   2. The collateral token: identity via the shared cached resolver
//      (per-token decimals are load-bearing — 8 of 26 observed collaterals are
//      not 18 decimals, four are 0) and balanceOf(position).
//
// The owner-declared price() is stored at 1e(36 − collateralDecimals); the
// scaled liqPrice is ZCHF per whole token. NO USD leaves this module —
// Frankencoin is oracle-free and the explorer renders native units only.
//
// cooldown() is a timestamp EXCEPT as a marker: V1's deny() pins it to the
// expiration and V1's close writes uint256-max, so the response ships the raw
// value plus derived flags (cooldownActive / mintingDisabledForGood) instead
// of pretending every value is a clock. ⚠️ V2's deny() closes the position
// outright (isClosed, cooldown untouched — measured on all 14 denied
// positions), so a V2 denial is indistinguishable at head from an ordinary
// close: DENIED is served from the indexed PositionDenied event, never here.
//
// SERVER-ONLY.

import { erc20Abi, getAddress } from "viem";
import { alchemyClient } from "./rpc";
import { resolveErc20Meta, scaleRaw } from "./erc20-meta";
import { POSITION_COMMON_ABI, POSITION_V2_ABI } from "@/lib/frankencoin/position-abi";
import { COOLDOWN_CLOCK_BOUND, normalizePositionAddress } from "@/lib/frankencoin/asset-catalog";
import type { FrankencoinChainResponse } from "@/lib/api/fetch-frankencoin-position";

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

const ZERO = BigInt(0);

function stub(position: string): FrankencoinChainResponse {
  return {
    position,
    hub: "v2",
    blockNumber: 0,
    owner: null,
    original: null,
    isClone: false,
    collateralToken: null,
    collateralSymbol: null,
    collateralDecimals: null,
    collateralRaw: null,
    collateral: null,
    mintedRaw: null,
    minted: null,
    priceRaw: null,
    liqPrice: null,
    annualInterestPPM: null,
    riskPremiumPPM: null,
    reserveContributionPPM: null,
    reserveHeld: null,
    mintCeiling: null,
    start: null,
    expiration: null,
    cooldownRaw: null,
    cooldownActive: false,
    cooldownUntil: null,
    mintingDisabledForGood: false,
    challengedAmountRaw: null,
    challengedAmount: null,
    challengePeriod: null,
    minimumCollateralRaw: null,
    isClosed: false,
    expired: false,
    chainStale: true,
  };
}

/** The position getters, in call order — the multicall decodes positionally. */
const FNS = [
  "owner",
  "collateral",
  "minted",
  "price",
  "expiration",
  "start",
  "cooldown",
  "challengedAmount",
  "challengePeriod",
  "isClosed",
  "original",
  "minimumCollateral",
  "annualInterestPPM",
  "reserveContribution",
] as const;

/**
 * Read one Frankencoin Position contract live at head. Returns a `chainStale`
 * stub on RPC failure so callers fall back to their indexed figures (the risk
 * surfaces just stay off).
 */
export async function loadFrankencoinPositionFromChain(positionRaw: string): Promise<FrankencoinChainResponse> {
  const normalized = normalizePositionAddress(positionRaw);
  if (normalized == null) return stub(positionRaw.toLowerCase());
  const position = getAddress(normalized);
  const key = position.toLowerCase();

  try {
    const client = alchemyClient();

    const [blockNumber, first] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.multicall({
        allowFailure: true,
        contracts: [
          ...FNS.map((functionName) => ({ address: position, abi: POSITION_COMMON_ABI, functionName })),
          // The version probe — success marks V2 (V1 positions have no getter).
          { address: position, abi: POSITION_V2_ABI, functionName: "riskPremiumPPM" },
        ] as const,
      }) as Promise<Res[]>,
    ]);

    const at = <T>(name: (typeof FNS)[number]): T | null => ok<T>(first[FNS.indexOf(name)]);

    const collateralToken = at<string>("collateral");
    const mintedRaw = at<bigint>("minted");
    // A position with no readable minted() and no collateral() is not a
    // Frankencoin Position clone — answer the stale stub, never invent state.
    if (collateralToken == null || mintedRaw == null) return stub(key);

    const riskPremiumRes = first[FNS.length];
    const isV2 = riskPremiumRes?.status === "success";

    const tokenAddr = collateralToken.toLowerCase();
    const [meta, balanceRes] = await Promise.all([
      resolveErc20Meta([tokenAddr]),
      client
        .readContract({
          address: getAddress(collateralToken),
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [position],
        })
        .then((v) => v as bigint)
        .catch(() => null),
    ]);
    const tokenMeta = meta.get(tokenAddr);
    const decimals = tokenMeta?.decimals ?? 18;

    const priceRaw = at<bigint>("price");
    // price() is stored at 1e(36 − decimals) → ZCHF per whole token.
    const liqPrice = priceRaw != null ? scaleRaw(priceRaw, 36 - decimals) : null;

    const minted = scaleRaw(mintedRaw, 18);
    const collateral = balanceRes != null ? scaleRaw(balanceRes, decimals) : null;

    const reservePpm = at<number>("reserveContribution");
    const interestPpm = at<number>("annualInterestPPM");
    const riskPremiumPPM = isV2 ? (ok<number>(riskPremiumRes) ?? null) : null;

    const expiration = at<bigint>("expiration");
    const start = at<bigint>("start");
    const cooldown = at<bigint>("cooldown");
    const challengedAmountRaw = at<bigint>("challengedAmount");
    const isClosed = at<boolean>("isClosed") ?? false;
    const original = at<string>("original");
    const owner = at<string>("owner");

    const now = Math.floor(Date.now() / 1000);
    const expirationN = expiration != null ? Number(expiration) : null;
    // A cooldown at/past the expiration is the deny/close marker (deny() sets
    // cooldown = expiration; V1 close writes uint256-max) — not a clock.
    const mintingDisabledForGood = cooldown != null && expiration != null && cooldown >= expiration && cooldown > ZERO;
    const cooldownIsClock =
      cooldown != null && !mintingDisabledForGood && Number(cooldown) < COOLDOWN_CLOCK_BOUND && Number(cooldown) > now;

    return {
      position: key,
      hub: isV2 ? "v2" : "v1",
      blockNumber,
      owner: owner ? owner.toLowerCase() : null,
      original: original ? original.toLowerCase() : null,
      isClone: original != null && original.toLowerCase() !== key,
      collateralToken: tokenAddr,
      collateralSymbol: tokenMeta?.symbol ?? null,
      collateralDecimals: decimals,
      collateralRaw: balanceRes != null ? balanceRes.toString() : null,
      collateral,
      mintedRaw: mintedRaw.toString(),
      minted,
      priceRaw: priceRaw != null ? priceRaw.toString() : null,
      liqPrice,
      annualInterestPPM: interestPpm,
      riskPremiumPPM,
      reserveContributionPPM: reservePpm,
      reserveHeld: reservePpm != null ? (minted * reservePpm) / 1_000_000 : null,
      mintCeiling: collateral != null && liqPrice != null ? collateral * liqPrice : null,
      start: start != null ? Number(start) : null,
      expiration: expirationN,
      cooldownRaw: cooldown != null ? cooldown.toString() : null,
      cooldownActive: cooldownIsClock,
      cooldownUntil: cooldownIsClock ? Number(cooldown) : null,
      mintingDisabledForGood,
      challengedAmountRaw: challengedAmountRaw != null ? challengedAmountRaw.toString() : null,
      challengedAmount: challengedAmountRaw != null ? scaleRaw(challengedAmountRaw, decimals) : null,
      challengePeriod: at<bigint>("challengePeriod") != null ? Number(at<bigint>("challengePeriod")) : null,
      minimumCollateralRaw: at<bigint>("minimumCollateral")?.toString() ?? null,
      isClosed,
      expired: expirationN != null && expirationN <= now && !isClosed,
      chainStale: false,
    };
  } catch {
    return stub(key);
  }
}

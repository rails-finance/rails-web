// Aave-V3-family MARKET-SURFACE provenance vocabulary — the receipts for
// /aave-v3/market and /spark/market, one block's reading of one Pool.
// ----------------------------------------------------------------------------
// The market-overview surface is shared across the V3 family (SparkLend is an
// Aave V3 fork on its own Pool + oracle deployment), so the vocabulary is a
// FACTORY keyed on protocol — the same shape as lib/shared/liquity-fork-live-
// provenance.ts, generic over forks. What differs between the two is real: the
// Pool and oracle are different contracts, with different names. So a shared
// surface needs protocol-parameterised builders; a single hardcoded Pool would
// put SparkLend's figures on Aave's contract (and vice versa).
//
// The Pool / oracle ADDRESSES are threaded from the live payload (the very
// contracts the reader called — fetch-aave-market-overview's `pool` / `oracle`),
// so every receipt carries the exact address it was read from, not a pinned
// constant that could drift. The protocol config supplies only the display
// names and the lane.
//
// Same grammar as lib/compound/markets-provenance.ts (the pilot's lead surface):
//   • state   — a Pool slot at the block (getReserveData rates, getReservesList
//     length, the reserve-config LT).
//   • oracle  — IAaveOracle.getAssetPrice (the price the Pool liquidates with),
//     and any value multiplied through it.
//   • derived — a ratio or Σ over those reads.
// The structured `source: { block }` slot rides every builder alongside the
// prose: it is what the receipt's coordinates row reads (the block and its
// copy button).

import type { Provenance } from "@/components/shared/provenance";

/** The identity of a market-overview receipt: the block, and the two live
 *  contracts the surface read from (threaded from the payload). Reserve-level
 *  builders take the reserve symbol as their first argument. */
export interface AaveMarketCoords {
  blockNumber?: number;
  /** The Pool proxy address the reserves were read from (live payload). */
  pool?: string;
  /** The IAaveOracle address the prices were read from (live payload). */
  oracle?: string;
  /** SparkLend's CapAutomator, when the payload names one. */
  capAutomator?: string;
}

export interface AaveMarketVocab {
  /** Market total supplied / borrowed in USD — Σ over reserves. */
  marketTotalProv: (side: "supplied" | "borrowed") => Provenance;
  /** The reserve count — Pool.getReservesList length. */
  reserveCountProv: () => Provenance;
  /** One reserve's supplied / borrowed value in USD. */
  reserveValueProv: (side: "supplied" | "borrowed", symbol: string) => Provenance;
  /** One reserve's liquidation threshold. */
  reserveLtProv: (symbol: string) => Provenance;
  /** The threshold an efficiency-mode category lends this reserve, in place of
   *  the reserve's own, for wallets that are in it. */
  reserveEModeLtProv: (symbol: string, categories: { label: string; lt: number; ltv?: number }[]) => Provenance;
  /** One reserve's oracle price. */
  reservePriceProv: (symbol: string) => Provenance;
  /** One reserve's live borrow / supply rate. */
  reserveRateProv: (side: "borrow" | "supply", symbol: string) => Provenance;
  /** One reserve's reserve factor — the protocol's cut of borrow interest. */
  reserveFactorProv: (symbol: string) => Provenance;
  /** One reserve's loan-to-value, from the delivered basis-point integer. */
  reserveLtvProv: (symbol: string, ltvBps: number) => Provenance;
  /** One reserve's liquidation bonus, from the delivered basis-point integer
   *  (10000 plus the bonus). */
  reserveBonusProv: (symbol: string, bonusBps: number) => Provenance;
  /** The share of a side's cap in use. */
  capUsedProv: (side: "supply" | "borrow", symbol: string, cap: CapUsedInput) => Provenance;
  /** A side closed by a cap of one whole token. */
  capClosedProv: (side: "supply" | "borrow", symbol: string, basis: "live" | "automator") => Provenance;
  /** A side with no cap: the field is 0, or holds its largest value. */
  capNoneProv: (
    side: "supply" | "borrow",
    symbol: string,
    why: "zero" | "field-max",
    basis: "live" | "automator",
    liveCap: number | null,
  ) => Provenance;
  /** Borrowing switched off on the reserve. */
  borrowOffProv: (symbol: string) => Provenance;
  /** The frozen / paused flags. */
  flagProv: (flag: "frozen" | "paused", symbol: string) => Provenance;
  /** A loan-to-value of 0 on a reserve that still carries a threshold. */
  ltvZeroProv: (symbol: string) => Provenance;
  /** Isolation mode (a debt ceiling) and siloed borrowing. */
  isolatedProv: (symbol: string, ceilingUsd: number) => Provenance;
  siloedProv: (symbol: string) => Provenance;
  /** The rate model's kink, read from the reserve's interest-rate strategy. */
  kinkProv: (symbol: string, k: { strategy: string; method: string; raw: string | null }) => Provenance;
}

/** What a cap-used receipt states: the amount counted, the ceiling, where the
 *  ceiling came from, and (supply side) the treasury's unminted share. */
export interface CapUsedInput {
  amount: number;
  cap: number;
  basis: "live" | "automator";
  liveCap: number | null;
  treasury?: number;
}

interface AaveMarketConfig {
  protocol: "aave-v3" | "aave-v3-base" | "seamless" | "spark";
  poolName: string;
  oracleName: string;
  /** The chain-proxy lane the surface reads through. */
  lane: string;
}

const tokens = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 });
const CAP_BITS = { supply: "116-151", borrow: "80-115" } as const;

function makeVocab(cfg: AaveMarketConfig): (coords: AaveMarketCoords) => AaveMarketVocab {
  const poolContract = (coords: AaveMarketCoords): Provenance["contract"] => ({
    name: cfg.poolName,
    address: coords.pool ?? "0x0000000000000000000000000000000000000000",
  });
  const oracleContract = (coords: AaveMarketCoords): Provenance["contract"] => ({
    name: cfg.oracleName,
    address: coords.oracle ?? "0x0000000000000000000000000000000000000000",
  });
  const atBlock = (coords: AaveMarketCoords): string =>
    coords.blockNumber != null ? ` at block ${coords.blockNumber}` : "";
  const automatorContract = (coords: AaveMarketCoords): Provenance["contract"] => ({
    name: "SparkLend CapAutomator",
    address: coords.capAutomator ?? "0x0000000000000000000000000000000000000000",
  });
  const recompute = (call: string, coords: AaveMarketCoords): Provenance["verify"] => ({
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the ${call} eth_call at block ${coords.blockNumber} against any node`
        : `Re-run the ${call} eth_call against any node`,
  });

  return (coords: AaveMarketCoords): AaveMarketVocab => ({
    marketTotalProv: (side) => ({
      kind: "chain-derived",
      pclass: "oracle",
      source: { block: coords.blockNumber },
      summary: `Market ${side} — Σ over every reserve on the Pool of its ${side} value in USD${atBlock(coords)}: each reserve's ${side === "supplied" ? "aToken totalSupply" : "variable-debt totalSupply"} × the market's own IAaveOracle price. Every leg a live read; the sum is ours.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Σ per-reserve ${side} × oracle price @ head`,
      formula: `Σ (reserve ${side} × oracle price)`,
      inputs: [
        {
          label: `reserve ${side}`,
          kind: "chain",
          pclass: "state",
          note: `${side === "supplied" ? "aToken" : "variableDebtToken"} totalSupply per reserve @ head`,
        },
        { label: "oracle price", kind: "chain-derived", pclass: "oracle", note: "IAaveOracle.getAssetPrice @ head" },
      ],
    }),
    reserveCountProv: () => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("Pool.getReservesList", coords),
      summary: `Reserves on the Pool — the length of \`getReservesList\`${atBlock(coords)}: every reserve the Pool enumerates, the roster this whole table is read from. The Pool's own count, not a stated catalog.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Pool.getReservesList (length) @ head`,
    }),
    reserveValueProv: (side, symbol) => ({
      kind: "chain-derived",
      pclass: "oracle",
      source: { block: coords.blockNumber },
      summary: `${symbol} ${side} — the reserve's ${side === "supplied" ? "aToken totalSupply" : "variable-debt totalSupply"} valued in USD${atBlock(coords)}: the live token-unit total × the market's own IAaveOracle price (the price the Pool liquidates with, never a market API).`,
      contract: poolContract(coords),
      via: `${cfg.lane} · ${side === "supplied" ? "aToken" : "variableDebtToken"} totalSupply × IAaveOracle price @ head`,
      formula: `${side} tokens × oracle price`,
      inputs: [
        {
          label: `${side} tokens`,
          kind: "chain",
          pclass: "state",
          note: `${side === "supplied" ? "aToken" : "variableDebtToken"} totalSupply @ head`,
        },
        {
          label: "oracle price",
          kind: "chain-derived",
          pclass: "oracle",
          contract: oracleContract(coords),
          note: "IAaveOracle.getAssetPrice @ head",
        },
      ],
    }),
    reserveLtProv: (symbol) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("Pool.getConfiguration", coords),
      summary: `${symbol} liquidation threshold — decoded from the reserve's live configuration word${atBlock(coords)} (Pool.getConfiguration), the collateral ratio past which a position holding it becomes liquidatable. Zero means the reserve cannot be collateral ON ITS OWN — an efficiency-mode category can still lend it one, which the eMode figure beside this states. A governance-set slot, read straight.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Pool.getConfiguration · liquidationThreshold @ head`,
    }),
    reserveEModeLtProv: (symbol, categories) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("Pool.getEModeCategory* ", coords),
      summary: `${symbol} in efficiency mode — the threshold the Pool applies to this reserve for a wallet inside ${categories.length === 1 ? "the category" : "one of the categories"} ${categories.map((c) => `${c.label} (${c.ltv != null ? `loan-to-value ${(c.ltv * 100).toFixed(2)}%, ` : ""}threshold ${(c.lt * 100).toFixed(2)}%)`).join(", ")}${atBlock(coords)}, IN PLACE of the reserve's own. Read from the Pool's own eMode categories — the collateral bitmap and threshold on the newer Pools, the category each reserve names for itself on the pre-3.2 ones. Which category applies is each wallet's own choice (getUserEMode), so a market table can only list them.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Pool eMode category threshold + membership @ head`,
    }),
    reservePriceProv: (symbol) => ({
      kind: "chain",
      pclass: "oracle",
      source: { block: coords.blockNumber },
      verify: recompute("IAaveOracle.getAssetPrice", coords),
      summary: `${symbol} price — the market's own \`IAaveOracle.getAssetPrice\`${atBlock(coords)}, in USD. The same price the Pool prices collateral and triggers liquidations with, read live — not an off-chain market feed.`,
      contract: oracleContract(coords),
      via: `${cfg.lane} · IAaveOracle.getAssetPrice @ head`,
    }),
    reserveRateProv: (side, symbol) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("Pool.getReserveData", coords),
      summary: `${symbol} ${side} rate — the reserve's current ${side === "borrow" ? "variable borrow" : "supply"} rate off \`getReserveData\`${atBlock(coords)} (the Pool's own live per-second rate, ray-scaled, expressed here as an annual percentage). What the Pool applies this block, not a projection.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Pool.getReserveData · ${side === "borrow" ? "currentVariableBorrowRate" : "currentLiquidityRate"} @ head`,
    }),
    reserveFactorProv: (symbol) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("Pool.getConfiguration", coords),
      summary: `${symbol} reserve factor — the protocol's cut of borrow interest, decoded from the reserve's live configuration word${atBlock(coords)} (Pool.getConfiguration, bits 64-79). The share of each unit of borrow interest that accrues to the protocol treasury rather than to suppliers. A governance-set slot, read straight.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Pool.getConfiguration · reserveFactor @ head`,
    }),
    reserveLtvProv: (symbol, ltvBps) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("Pool.getConfiguration", coords),
      summary: `${symbol} loan-to-value — the most a wallet can borrow against this reserve, as a share of its value, set by governance in the reserve's configuration${atBlock(coords)}. At 0 the reserve backs no new borrowing: a position holding it still counts it toward the liquidation threshold, and it adds nothing to what the position can borrow.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Pool.getConfiguration · bits 0-15 (ltv) @ head`,
      scaling: {
        raw: String(ltvBps),
        from: "call",
        places: 2,
        why: "The configuration stores loan-to-value in hundredths of a percent",
        unit: "%",
      },
    }),
    reserveBonusProv: (symbol, bonusBps) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("Pool.getConfiguration", coords),
      summary: `${symbol} liquidation bonus — the extra collateral a liquidator receives, as a share of the debt they repay, when they liquidate a position holding this reserve${atBlock(coords)}. The configuration stores it as 10000 plus the bonus in hundredths of a percent: ${bonusBps} is a bonus of ${((bonusBps - 10000) / 100).toFixed(2).replace(/\.?0+$/, "")}%.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Pool.getConfiguration · bits 32-47 (liquidationBonus) = ${bonusBps} @ head`,
      formula: `(${bonusBps} − 10000) ÷ 100`,
    }),
    capUsedProv: (side, symbol, c) => {
      const counted =
        side === "supply"
          ? "the aToken supply plus the interest owed to the treasury and not yet minted to it, which is what the Pool adds up when it checks a new supply against the cap"
          : "the reserve's variable debt";
      const ceiling =
        c.basis === "automator"
          ? `the maximum SparkLend's CapAutomator allows, ${tokens(c.cap)} ${symbol}. SparkLend keeps the live cap${c.liveCap != null ? ` (${tokens(c.liveCap)} ${symbol})` : ""} a short step above use and raises it automatically, up to that maximum`
          : `the reserve's ${side} cap of ${tokens(c.cap)} ${symbol}`;
      return {
        kind: "chain-derived",
        pclass: "state",
        source: { block: coords.blockNumber },
        summary: `${symbol} ${side} cap used — ${coords.blockNumber != null ? `at block ${coords.blockNumber}, ` : ""}${counted}, divided by ${ceiling}.`,
        contract: c.basis === "automator" ? automatorContract(coords) : poolContract(coords),
        via:
          c.basis === "automator"
            ? `${cfg.lane} · ${side === "supply" ? "(aToken supply + treasury)" : "variable debt"} ÷ CapAutomator.${side}CapConfigs(asset).max @ head`
            : `${cfg.lane} · ${side === "supply" ? "(aToken supply + treasury)" : "variable debt"} ÷ Pool.getConfiguration bits ${CAP_BITS[side]} (${side}Cap) @ head`,
        formula:
          side === "supply"
            ? `(${tokens(c.amount - (c.treasury ?? 0))} + ${tokens(c.treasury ?? 0)}) ÷ ${tokens(c.cap)}`
            : `${tokens(c.amount)} ÷ ${tokens(c.cap)}`,
        inputs: [
          ...(side === "supply"
            ? [
                {
                  label: "aToken supply",
                  value: tokens(c.amount - (c.treasury ?? 0)),
                  kind: "chain" as const,
                  pclass: "state" as const,
                  note: "aToken totalSupply @ head",
                },
                {
                  label: "owed to the treasury",
                  value: tokens(c.treasury ?? 0),
                  kind: "chain-derived" as const,
                  pclass: "state" as const,
                  note: "getReserveData.accruedToTreasury × Pool.getReserveNormalizedIncome ÷ 10^27 @ head",
                },
              ]
            : [
                {
                  label: "variable debt",
                  value: tokens(c.amount),
                  kind: "chain" as const,
                  pclass: "state" as const,
                  note: "variableDebtToken totalSupply @ head",
                },
              ]),
          c.basis === "automator"
            ? {
                label: `${side} cap maximum`,
                value: tokens(c.cap),
                kind: "chain" as const,
                pclass: "state" as const,
                contract: automatorContract(coords),
                note: `CapAutomator.${side}CapConfigs(asset).max @ head`,
              }
            : {
                label: `${side} cap`,
                value: tokens(c.cap),
                kind: "chain" as const,
                pclass: "state" as const,
                note: `Pool.getConfiguration bits ${CAP_BITS[side]} @ head`,
              },
        ],
      };
    },
    capClosedProv: (side, symbol, basis) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute(basis === "automator" ? `CapAutomator.${side}CapConfigs` : "Pool.getConfiguration", coords),
      summary: `${symbol} closed to new ${side === "supply" ? "supply" : "borrowing"} — ${basis === "automator" ? `SparkLend's CapAutomator sets the reserve's maximum ${side} cap to 1 whole ${symbol}` : `the reserve's ${side} cap is 1 whole ${symbol}`}${atBlock(coords)}. Governance sets a cap of one token to close a side, so no share of it is quoted.`,
      contract: basis === "automator" ? automatorContract(coords) : poolContract(coords),
      via:
        basis === "automator"
          ? `${cfg.lane} · CapAutomator.${side}CapConfigs(asset).max = 1 @ head`
          : `${cfg.lane} · Pool.getConfiguration · bits ${CAP_BITS[side]} (${side}Cap) = 1 @ head`,
    }),
    capNoneProv: (side, symbol, why, basis, liveCap) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute(basis === "automator" ? `CapAutomator.${side}CapConfigs` : "Pool.getConfiguration", coords),
      summary:
        why === "zero"
          ? `${symbol} has no ${side} cap — the reserve's ${side} cap is 0${atBlock(coords)}, which the Pool reads as no limit.`
          : basis === "automator"
            ? `${symbol} has no ${side} cap — SparkLend's CapAutomator sets the reserve's maximum ${side} cap to 68719476735${atBlock(coords)}, the largest value a cap can hold (2^36 − 1), so it raises the live cap${liveCap != null ? ` (${tokens(liveCap)} ${symbol})` : ""} with no ceiling.`
            : `${symbol} has no ${side} cap — the reserve's ${side} cap is 68719476735${atBlock(coords)}, the largest value the field can hold (2^36 − 1), which SparkLend uses for no limit.`,
      contract: basis === "automator" ? automatorContract(coords) : poolContract(coords),
      via:
        basis === "automator"
          ? `${cfg.lane} · CapAutomator.${side}CapConfigs(asset).max @ head`
          : `${cfg.lane} · Pool.getConfiguration · bits ${CAP_BITS[side]} (${side}Cap) @ head`,
    }),
    borrowOffProv: (symbol) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("Pool.getConfiguration", coords),
      summary: `${symbol} borrowing off — the borrowing-enabled bit of the reserve's configuration is 0${atBlock(coords)}, so the Pool accepts no new borrowing of it. Any borrow cap on the reserve has no effect while this holds.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Pool.getConfiguration · bit 58 (borrowingEnabled) = 0 @ head`,
    }),
    flagProv: (flag, symbol) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("Pool.getConfiguration", coords),
      summary:
        flag === "frozen"
          ? `${symbol} frozen — the frozen bit of the reserve's configuration is set${atBlock(coords)}. The Pool accepts no new supply or borrowing of it; interest keeps accruing, and repayment, withdrawal and liquidation still work.`
          : `${symbol} paused — the paused bit of the reserve's configuration is set${atBlock(coords)}. The Pool refuses every action on the reserve, liquidation included, until it is unpaused.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Pool.getConfiguration · bit ${flag === "frozen" ? "57 (frozen)" : "60 (paused)"} = 1 @ head`,
    }),
    ltvZeroProv: (symbol) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("Pool.getConfiguration", coords),
      summary: `${symbol} backs no new borrowing — its loan-to-value is 0 and its liquidation threshold is above 0${atBlock(coords)}, and no efficiency-mode category lends it a loan-to-value. A position holding it keeps it as collateral against what it owes; it adds nothing to what the position can borrow.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Pool.getConfiguration · bits 0-15 (ltv) = 0, bits 16-31 (liquidationThreshold) > 0; eMode category loan-to-values @ head`,
    }),
    isolatedProv: (symbol, ceilingUsd) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("Pool.getConfiguration", coords),
      summary: `${symbol} isolated — the reserve carries a debt ceiling of $${ceilingUsd.toLocaleString("en-US")}${atBlock(coords)}. A wallet using it as collateral can borrow only the assets marked borrowable in isolation, and all such wallets together can borrow up to that ceiling against it.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Pool.getConfiguration · bits 212-251 (debtCeiling) ÷10^2 @ head`,
    }),
    siloedProv: (symbol) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("Pool.getConfiguration", coords),
      summary: `${symbol} siloed — the siloed-borrowing bit of the reserve's configuration is set${atBlock(coords)}. A wallet borrowing it can borrow no other asset in the same position.`,
      contract: poolContract(coords),
      via: `${cfg.lane} · Pool.getConfiguration · bit 62 (siloedBorrowing) = 1 @ head`,
    }),
    kinkProv: (symbol, k) => ({
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute(`${k.method}`, coords),
      summary: `${symbol} rate kink — the utilisation at which the reserve's borrow rate starts to climb steeply, read from its interest-rate strategy${atBlock(coords)}. The tick on the utilisation bar marks it.`,
      contract: { name: `${symbol} interest-rate strategy`, address: k.strategy },
      via: `${cfg.lane} · getReserveData.interestRateStrategyAddress → ${k.method === "getOptimalUsageRatio" ? "getOptimalUsageRatio(asset)" : "OPTIMAL_USAGE_RATIO()"} @ head`,
      ...(k.raw
        ? {
            scaling: {
              raw: k.raw,
              from: "call" as const,
              places: 25,
              why: "The strategy states ratios with 10^27 standing for 100%",
              unit: "%",
            },
          }
        : {}),
    }),
  });
}

const FACTORIES: Record<string, (coords: AaveMarketCoords) => AaveMarketVocab> = {
  "aave-v3": makeVocab({
    protocol: "aave-v3",
    poolName: "Aave V3 Core Pool",
    oracleName: "Aave V3 IAaveOracle",
    lane: "GET /api/chain/aave-v3/market",
  }),
  "aave-v3-base": makeVocab({
    protocol: "aave-v3-base",
    poolName: "Aave V3 Base Pool",
    oracleName: "Aave V3 Base IAaveOracle",
    lane: "GET /api/chain/aave-v3-base/market",
  }),
  seamless: makeVocab({
    protocol: "seamless",
    poolName: "Seamless Pool",
    oracleName: "Seamless IAaveOracle",
    lane: "GET /api/chain/seamless/market",
  }),
  spark: makeVocab({
    protocol: "spark",
    poolName: "SparkLend Pool",
    oracleName: "SparkLend IAaveOracle",
    lane: "GET /api/chain/spark/market",
  }),
};

/** The market-surface vocabulary for a V3-family explorer, keyed by protocol id,
 *  bound to the block + live contract addresses the surface read from. */
export function aaveMarketVocab(protocol: string, coords: AaveMarketCoords): AaveMarketVocab {
  return (FACTORIES[protocol] ?? FACTORIES["aave-v3"])(coords);
}

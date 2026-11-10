// Aave V4 markets provenance (ui-jobs 548): the receipts for the markets
// roster, a spoke's page, a spoke reserve's page and the Hubs page.
// ----------------------------------------------------------------------------
// Two sources, named in every via line:
// - STORED: `GET /api/aave-v4/hubs` (Ethereum) and `GET /api/aave-v4-base/reserves`
//   (Base), the hub's lines per spoke as rails-server's Aave V4 refresher read them
//   from the hub contracts each cycle (getSpokeConfig, getSpokeAddedAssets,
//   getSpokeTotalOwed) and stored at its block: class `indexed`. A dollar figure on
//   Ethereum prices the amount at an off-chain market feed (`offchain`); Base's
//   stored row carries the spoke oracle's price (`oracle`).
// - HEAD: `GET /api/at-block/aave-v4/reserve`, one Multicall3 of the spoke, its
//   oracle and the hub at the head block, kept 30 s by rails-server: class `state`,
//   and a figure valued at the spoke oracle's price is `oracle`.
// Aave calls the hub's supply "added assets"; the page says Supplied and the
// receipt names the call. Contract names and explorer links live here, never on
// the page.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { PricedSum, V4Price, V4ReserveFigures } from "@/lib/aave-v4/markets";

const STORED_ETH = "GET /api/aave-v4/hubs";
const STORED_BASE = "GET /api/aave-v4-base/reserves";
const HEAD = "GET /api/at-block/aave-v4/reserve";
const HOLDERS = "GET /api/aave-v4/reserve-holders";
const HISTORY = "GET /api/aave-v4/hub-asset-history";

const n = (v: number) => v.toLocaleString("en-US");

export interface StoredCoords {
  chainId: 1 | 8453;
  block: number | null;
}

const storedLane = (c: StoredCoords) => (c.chainId === 8453 ? STORED_BASE : STORED_ETH);
const atStored = (c: StoredCoords) => (c.block != null ? ` at block ${n(c.block)}` : "");

/** The read stamp over a stored payload. */
export function storedStampProv(c: StoredCoords, what: string, at: number | null): Provenance {
  const time = at == null ? "" : ` (${new Date(at * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC)`;
  return {
    kind: "chain",
    pclass: "indexed",
    source: { block: c.block ?? undefined },
    summary: `${what} comes from rails-server's store of the hub contracts, read${atStored(c)}${time} by its Aave V4 refresher. The stamp shows the time of that read.`,
    via: `${storedLane(c)} · hub getSpokeConfig, getSpokeAddedAssets, getSpokeTotalOwed per spoke, stored each cycle`,
  };
}

// ── Stored figures (roster, Hubs) ────────────────────────────────────────────

/** A count of a spoke's reserves. */
export const reserveCountProv = (spoke: string, count: number, c: StoredCoords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  source: { block: c.block ?? undefined },
  summary: `${spoke} reserves. ${count} in all, one per token and hub the spoke draws that token from, each a line the hub keeps for the spoke${atStored(c)}.`,
  via: `${storedLane(c)} · one line per (hub, asset, spoke) · counted`,
});

/** A count of a hub's assets. */
export const hubAssetCountProv = (hub: string, count: number, c: StoredCoords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  source: { block: c.block ?? undefined },
  summary: `${hub} hub assets. ${count} in all, each an asset the hub holds for at least one spoke's credit line${atStored(c)}.`,
  via: `${storedLane(c)} · distinct assets over the hub's lines · counted`,
});

/** A spoke's open positions. */
export const positionsProv = (spoke: string, c: StoredCoords): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary: `Open positions on ${spoke}. The wallets with a balance on the spoke in rails-server's position table, each read from the spoke at the block of its last refresh.`,
  via: `${storedLane(c)} · ${c.chainId === 8453 ? "aave_v4_base_position_chain" : "aave_v4_spoke_position_chain"} · counted per spoke`,
});

/** A hub's open positions: those on the spokes whose collateral sits in it. */
export const hubPositionsProv = (hub: string, c: StoredCoords): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary: `Open positions on the ${hub} hub. The wallets on the spokes whose collateral sits in it, from rails-server's position table, each read from its spoke at the block of its last refresh.`,
  via: `${storedLane(c)} · position table · counted per home hub`,
});

const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

const usdText = (x: number) => `$${x.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;

/** The price leaf of a USD figure: the spoke oracle, or the market feed where the oracle holds none. */
function priceLeaf(symbol: string, p: V4Price): ProvInput {
  return p.via === "oracle"
    ? {
        label: "price",
        value: usdText(p.usd),
        kind: "chain",
        pclass: "oracle",
        note: `the spoke oracle's getReservePrice${p.spoke ? `, as the ${p.spoke} spoke's oracle answers it` : ""}${p.block != null ? ` at block ${n(p.block)}` : ""}; every spoke listing ${symbol} points at the same source`,
      }
    : {
        label: "price",
        value: usdText(p.usd),
        kind: "offchain",
        pclass: "offchain",
        note: `an off-chain market feed (DefiLlama): the spoke oracle holds no price for ${symbol}`,
      };
}

/** A total of stored amounts valued in USD: a spoke's or a hub's supplied or borrowed. */
export function storedValueProv(
  side: "supplied" | "borrowed",
  scope: string,
  c: StoredCoords,
  sum: PricedSum,
): Provenance {
  const getter = side === "supplied" ? "getSpokeAddedAssets" : "getSpokeTotalOwed";
  const words =
    side === "supplied"
      ? "What suppliers have added (Aave's added assets)"
      : "What borrowers owe, drawn and premium, with interest";
  const one = sum.market.length === 1;
  const market = sum.market.length
    ? ` ${list(sum.market)} ${one ? "has" : "have"} no oracle price and ${one ? "is" : "are"} valued at an off-chain market feed (DefiLlama).`
    : "";
  const gap = sum.unpriced.length ? ` The total leaves out ${list(sum.unpriced)}, which no price source holds.` : "";
  const inputs: ProvInput[] = [
    { label: "amount", kind: "chain", pclass: "indexed", note: `the hub's ${getter}, stored` },
    {
      label: "price",
      kind: "chain",
      pclass: "oracle",
      note: "the spoke oracle's getReservePrice (GET /api/oracle/aave-v4; on Base, stored with the row)",
    },
  ];
  if (sum.market.length)
    inputs.push({
      label: "market price",
      value: list(sum.market),
      kind: "offchain",
      pclass: "offchain",
      note: "DefiLlama, where the oracle holds none",
    });
  if (sum.unpriced.length)
    inputs.push({
      label: "left out",
      value: list(sum.unpriced),
      kind: "offchain",
      pclass: "offchain",
      note: "no price source",
    });
  return {
    kind: sum.market.length ? "derived" : "chain-derived",
    pclass: sum.market.length ? "offchain" : "oracle",
    source: { block: c.block ?? undefined },
    summary: `${scope} ${side}${sum.unpriced.length ? " (partial)" : ""}. ${words}, from the hub's line for each spoke and asset${atStored(c)}, each amount valued at the spoke oracle's price, then added up.${market}${gap}`,
    via: `${storedLane(c)} · hub ${getter}(assetId, spoke) per line · × spoke oracle getReservePrice · summed`,
    formula: "Σ (amount × price)",
    inputs,
  };
}

/** A token amount's receipt, revalued in USD at its price. */
export function pricedAmountProv(amount: Provenance, symbol: string, p: V4Price | null): Provenance {
  if (!p) return amount;
  const oracle = p.via === "oracle";
  const [head, ...rest] = amount.summary.split(". ");
  const body = rest.join(". ");
  return {
    ...amount,
    kind: oracle ? "chain-derived" : "derived",
    pclass: oracle ? "oracle" : "offchain",
    summary: `${head}, in USD. ${body} Valued at ${oracle ? "the spoke oracle's price" : "an off-chain market price (DefiLlama), the oracle holding none"}.`,
    via: `${amount.via} · × ${oracle ? "spoke oracle getReservePrice" : "DefiLlama price"}`,
    formula: "amount × price",
    inputs: [{ label: "amount", kind: "chain", pclass: "indexed", note: amount.via }, priceLeaf(symbol, p)],
  };
}

/** One stored token amount of a hub asset or a credit line. */
export function storedAmountProv(
  what: "supplied" | "borrowed" | "liquidity" | "add cap" | "draw cap",
  scope: string,
  c: StoredCoords,
): Provenance {
  const via: Record<typeof what, string> = {
    supplied: "hub getSpokeAddedAssets(assetId, spoke)",
    borrowed: "hub getSpokeTotalOwed(assetId, spoke)",
    liquidity: "Σ getSpokeAddedAssets − Σ getSpokeTotalOwed",
    "add cap": "hub getSpokeConfig(assetId, spoke).addCap",
    "draw cap": "hub getSpokeConfig(assetId, spoke).drawCap",
  };
  const words: Record<typeof what, string> = {
    supplied: "the tokens suppliers have added (Aave's added assets)",
    borrowed: "the tokens borrowers owe, drawn and premium, with interest",
    liquidity: "supplied less borrowed: the tokens the hub holds undrawn",
    "add cap": "the most the hub takes in from this spoke, in whole tokens",
    "draw cap": "the most this spoke can draw from the hub, in whole tokens",
  };
  return {
    kind: what === "liquidity" ? "chain-derived" : "chain",
    pclass: "indexed",
    source: { block: c.block ?? undefined },
    summary: `${scope}, ${what}. ${words[what][0].toUpperCase()}${words[what].slice(1)}${atStored(c)}.${what === "liquidity" ? ` ${ESTIMATE}` : ""}`,
    via: `${storedLane(c)} · ${via[what]}`,
  };
}

/** The stored hub figures that stand in for a head read. */
const ESTIMATE = "An estimate from stored totals; each spoke's reserve page reads the exact figure at the head.";

/** A stored ratio: utilisation, or credit used. */
export function storedRatioProv(what: "utilisation" | "credit used", scope: string, c: StoredCoords): Provenance {
  return {
    kind: "chain-derived",
    pclass: "indexed",
    source: { block: c.block ?? undefined },
    summary:
      what === "utilisation"
        ? `${scope}, utilisation. Borrowed ÷ supplied over the hub's spokes${atStored(c)}.`
        : `${scope}, credit used. What the spoke owes the hub ÷ the draw cap the hub set for it${atStored(c)}.`,
    via: `${storedLane(c)} · ${what === "utilisation" ? "Σ getSpokeTotalOwed ÷ Σ getSpokeAddedAssets" : "getSpokeTotalOwed ÷ getSpokeConfig.drawCap"}`,
    formula: what === "utilisation" ? "borrowed ÷ supplied" : "owed ÷ draw cap",
  };
}

/** A stored hub rate: the drawn rate, the supply rate, the liquidity fee. */
export function storedRateProv(
  what: "drawn rate" | "supply rate" | "liquidity fee",
  scope: string,
  c: StoredCoords,
): Provenance {
  if (what === "drawn rate")
    return {
      kind: "chain",
      pclass: "indexed",
      summary: `${scope}, drawn rate. The rate the hub set for the asset when it last accrued interest, the same for every spoke drawing it, as an APR. Borrowers pay it plus a premium set by their collateral's risk.`,
      via: `${storedLane(c)} · hub UpdateAsset log · drawnRate ÷ 10^27`,
    };
  if (what === "liquidity fee")
    return {
      kind: "chain",
      pclass: "indexed",
      summary: `${scope}, liquidity fee. The share of borrowers' interest the hub keeps; suppliers get the rest.`,
      via: `${storedLane(c)} · hub getAssetConfig(assetId).liquidityFee, in basis points`,
    };
  return {
    kind: "chain-derived",
    pclass: "indexed",
    source: { block: c.block ?? undefined },
    summary: `${scope}, supply rate. The drawn rate × borrowed ÷ supplied × (1 − liquidity fee), as an APR. Borrowed carries the premium, so the rate includes what borrowers pay above the drawn rate. ${ESTIMATE}`,
    via: `${storedLane(c)} · drawnRate × (Σ owed ÷ Σ added) × (1 − liquidityFee)`,
    formula: "drawn rate × utilisation × (1 − liquidity fee)",
  };
}

/** A stored spoke term: the collateral factor, active or halted. */
export function storedTermProv(
  what: "collateral factor" | "status",
  scope: string,
  c: StoredCoords,
  block?: number,
): Provenance {
  if (what === "collateral factor")
    return {
      kind: "chain",
      pclass: block != null ? "state" : "indexed",
      source: { block: block ?? c.block ?? undefined },
      summary: `${scope}, collateral factor. The share of the asset's value the spoke counts toward a borrow, at the reserve's current config key${block != null ? `, read at block ${n(block)}` : ""}. A position keeps the factor it last took.`,
      via: `${storedLane(c)} · spoke getDynamicReserveConfig(reserveId, key).collateralFactor`,
    };
  return {
    kind: "chain",
    pclass: "indexed",
    source: { block: c.block ?? undefined },
    summary: `${scope}, line status. Whether the hub lets the spoke add and draw (active) or has halted the line${atStored(c)}.`,
    via: `${storedLane(c)} · hub getSpokeConfig(assetId, spoke).active, .halted`,
  };
}

// ── Head figures (spoke page, reserve page) ──────────────────────────────────

const atHead = (f: V4ReserveFigures) => ` at block ${n(f.block)}`;
const hubContract = (f: V4ReserveFigures, hub: string) => ({ name: `${hub} hub`, address: f.hubAddress });
const spokeContract = (f: V4ReserveFigures, spoke: string) => ({ name: `${spoke} spoke`, address: f.spokeAddress });

const CONFIG_LOG = "GET /api/aave-v4/reserve-config-log";
/** Aave's V4 source at the commit read for the change log's words. */
const V4_SRC = "https://github.com/aave/aave-v4/blob/a3ef63ea6415d25237a9775bf66e76e9993561c2/src";
const sourceLine = (label: string, path: string, note: string) => ({
  label,
  kind: "offchain" as const,
  pclass: "offchain" as const,
  note,
  verify: { kind: "link" as const, href: `${V4_SRC}/${path}`, text: label },
});
/** The source lines a kind's words rest on. */
const KIND_SOURCES: Record<string, ProvInput[]> = {
  "dynamic-added": [
    sourceLine(
      "Spoke.sol: a position's terms follow its key",
      "spoke/Spoke.sol#L728-L733",
      "a position's collateral factor is read under the key it last took; the key moves to the reserve's latest only when the spoke refreshes it",
    ),
    sourceLine(
      "Spoke.sol: what refreshes the key",
      "spoke/Spoke.sol#L244-L300",
      "borrow, and withdraw while the asset is collateral, refresh every collateral's key; setUsingAsCollateral (L391-L413) refreshes it on switching collateral on or off; updateUserDynamicConfig (L424) refreshes on request",
    ),
  ],
  "dynamic-updated": [
    sourceLine(
      "Spoke.sol: an update rewrites a key in place",
      "spoke/Spoke.sol#L206-L215",
      "every position on that key reads the new terms at once",
    ),
  ],
  "reserve-config": [
    sourceLine(
      "ISpoke.sol: receiveSharesEnabled",
      "spoke/interfaces/ISpoke.sol#L60",
      "true if the liquidator can receive collateral shares during liquidation",
    ),
    sourceLine(
      "LiquidationLogic.sol: taking shares",
      "spoke/libraries/LiquidationLogic.sol#L552-L557",
      "a liquidator asking for shares needs the collateral reserve unfrozen and receiveSharesEnabled",
    ),
  ],
};

/** The contract by role, as a receipt names it. */
export const v4ContractName = (role: "spoke" | "hub" | "strategy", o: { spoke: string; hub: string }) =>
  role === "spoke" ? `${o.spoke} spoke` : role === "hub" ? `${o.hub} hub` : `${o.hub} hub's rate strategy`;

/** One configuration change: the event, the contract that emitted it, and
 *  its block, transaction and log, each linked to the explorer. */
export function v4ConfigChangeProv(
  c: {
    row: { kind: string; block: number; txHash: string; logIndex: number; [k: string]: unknown };
    words: string;
    contract: { role: "spoke" | "hub" | "strategy"; address: string };
    event: string;
  },
  o: { spoke: string; hub: string },
  explorer: { block: string; tx: string; name: string },
): Provenance {
  const r = c.row;
  const name = v4ContractName(c.contract.role, o);
  const scope =
    r.kind === "liquidation-config"
      ? " It holds for every reserve on the spoke."
      : r.kind === "credit-line"
        ? ` It is the ${o.spoke} spoke's line on the hub for this asset.`
        : r.kind === "price-source"
          ? ` The new source is ${String(r.source)}.`
          : r.kind === "dynamic-added" || r.kind === "dynamic-updated"
            ? ` Collateral terms key ${String(r.key)}.`
            : "";
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: r.block, txHash: r.txHash },
    summary: `${c.words}. The ${name}'s ${c.event} event at block ${n(r.block)}, log ${r.logIndex} of transaction ${r.txHash}.${scope}`,
    contract: { name, address: c.contract.address },
    via: `${CONFIG_LOG} · ${c.event}`,
    verify: { kind: "etherscan", href: explorer.tx, text: `The transaction on ${explorer.name}` },
    inputs: [
      // Labelled apart from the spine's "block" chip, which draws unlinked.
      {
        label: "in block",
        value: n(r.block),
        kind: "chain",
        pclass: "emitted",
        verify: { kind: "etherscan", href: explorer.block, text: `Block ${n(r.block)} on ${explorer.name}` },
      },
      {
        label: "log",
        value: `${r.logIndex}`,
        kind: "chain",
        pclass: "emitted",
        note: `${c.event}, log ${r.logIndex} of the transaction`,
        verify: {
          kind: "etherscan",
          href: `${explorer.tx}#eventlog`,
          text: `The transaction's logs on ${explorer.name}`,
        },
      },
      ...(KIND_SOURCES[r.kind] ?? []),
    ],
  };
}

/** Base: the change log's tables are Ethereum's only. */
export function configChangesBaseProv(
  f: V4ReserveFigures,
  o: { symbol: string; spoke: string; hub: string },
): Provenance {
  return {
    kind: "chain",
    summary: `Every change to ${o.symbol}'s settings on ${o.spoke} is an event on-chain. The ${o.spoke} spoke logs its reserve, collateral and liquidation settings, the ${o.hub} hub the asset's settings and this spoke's credit line. ${CONFIG_LOG} reads them from Ethereum's tables; Base has none yet.`,
    contract: spokeContract(f, o.spoke),
    inputs: [
      {
        label: `${o.spoke} spoke`,
        value: f.spokeAddress,
        kind: "chain",
        note: "reserve, collateral and liquidation settings",
      },
      { label: `${o.hub} hub`, value: f.hubAddress, kind: "chain", note: "asset settings and the spoke's credit line" },
    ],
  };
}

/** A token amount from the head read, valued at the spoke oracle's price. */
export function headValueProv(
  f: V4ReserveFigures,
  side: "spoke" | "hub",
  what: "supplied" | "borrowed",
  o: { symbol: string; spoke: string; hub: string },
): Provenance {
  const call =
    side === "spoke"
      ? what === "supplied"
        ? "getSpokeAddedAssets(assetId, spoke)"
        : "getSpokeTotalOwed(assetId, spoke)"
      : what === "supplied"
        ? "getAddedAssets(assetId)"
        : "getAssetTotalOwed(assetId)";
  const scope = side === "spoke" ? `on ${o.spoke}` : `on the ${o.hub} hub, every spoke together`;
  const words = what === "supplied" ? "added (Aave's added assets)" : "owed, drawn and premium, with interest";
  const priced = f.price != null;
  return {
    kind: "chain-derived",
    pclass: priced ? "oracle" : "state",
    source: { block: f.block },
    summary: `${o.symbol} ${what} ${scope}. The tokens ${words}, read from the hub${atHead(f)}${priced ? ", valued at the spoke oracle's price at the same block" : ""}.`,
    contract: hubContract(f, o.hub),
    via: `${HEAD} · hub ${call}${priced ? " · × oracle getReservePrice" : ""}`,
    formula: priced ? "amount × price" : undefined,
    inputs: priced
      ? [
          { label: "amount", kind: "chain", pclass: "state", contract: hubContract(f, o.hub), note: `hub ${call}` },
          {
            label: "price",
            value: `$${f.price!.toLocaleString("en-US", { maximumFractionDigits: 6 })}`,
            kind: "chain",
            pclass: "oracle",
            contract: f.oracle ? { name: `${o.spoke} oracle`, address: f.oracle } : undefined,
            note: "the spoke oracle's getReservePrice",
          },
        ]
      : undefined,
  };
}

/** A sum of head amounts over a spoke's reserves. */
export function spokeValueProv(
  spoke: string,
  what: "supplied" | "borrowed",
  block: number,
  count: number,
  sum: PricedSum,
): Provenance {
  const call = what === "supplied" ? "getSpokeAddedAssets" : "getSpokeTotalOwed";
  const market = sum.market.length
    ? ` ${list(sum.market)} had no price from the spoke's oracle and ${sum.market.length === 1 ? "is" : "are"} valued at an off-chain market feed (DefiLlama).`
    : "";
  const gap = sum.unpriced.length ? ` The total leaves out ${list(sum.unpriced)}, which no price source holds.` : "";
  return {
    kind: sum.market.length ? "derived" : "chain-derived",
    pclass: sum.market.length ? "offchain" : "oracle",
    source: { block },
    summary: `${spoke} ${what}${sum.unpriced.length ? " (partial)" : ""}. Each of its ${count} reserves' ${what === "supplied" ? "added assets" : "owed, drawn and premium,"} on the hub it draws from, read near block ${n(block)} and valued at the spoke oracle's price, then added up.${market}${gap}`,
    via: `${HEAD} per reserve · hub ${call}(assetId, spoke) × oracle getReservePrice · summed`,
    formula: "Σ (amount × price)",
  };
}

/** Available: what the spoke can still draw. */
export function availableProv(f: V4ReserveFigures, o: { symbol: string; spoke: string; hub: string }): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: f.block },
    summary: `${o.symbol} available to ${o.spoke}. The hub's liquidity, capped by the draw cap less what the spoke owes${atHead(f)}.`,
    contract: hubContract(f, o.hub),
    via: `${HEAD} · min(hub getAssetLiquidity, getSpokeConfig.drawCap − getSpokeTotalOwed)`,
    formula: "min(liquidity, draw cap − owed)",
    inputs: [
      {
        label: "liquidity",
        value: n(Math.round(f.liquidity)),
        kind: "chain",
        pclass: "state",
        note: "hub getAssetLiquidity",
      },
      {
        label: "draw cap",
        value: f.drawCap == null ? "none" : n(f.drawCap),
        kind: "chain",
        pclass: "state",
        note: "hub getSpokeConfig(assetId, spoke).drawCap, whole tokens",
      },
      {
        label: "owed",
        value: n(Math.round(f.spokeBorrowed)),
        kind: "chain",
        pclass: "state",
        note: "hub getSpokeTotalOwed",
      },
    ],
  };
}

/** The hub's utilisation. */
export function utilisationProv(f: V4ReserveFigures, o: { symbol: string; hub: string }): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: f.block },
    summary: `${o.symbol} utilisation on the ${o.hub} hub. Drawn ÷ (drawn + liquidity), the usage its rate strategy reads${atHead(f)}.`,
    contract: hubContract(f, o.hub),
    via: `${HEAD} · hub getAssetOwed drawn ÷ (drawn + getAssetLiquidity)`,
    formula: "drawn ÷ (drawn + liquidity)",
  };
}

/** The drawn rate: what borrowers pay before the premium. */
export function drawnRateProv(f: V4ReserveFigures, o: { symbol: string; hub: string }): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    source: { block: f.block },
    summary: `${o.symbol} borrow rate on the ${o.hub} hub. The drawn rate${atHead(f)}, as an APR. Each borrower pays it plus a premium set by the collateral risk of what it posts.`,
    contract: hubContract(f, o.hub),
    via: `${HEAD} · hub getAssetDrawnRate(assetId) ÷ 10^27`,
    scaling: f.raw.hub.drawnRateRay
      ? {
          raw: f.raw.hub.drawnRateRay,
          from: "call",
          places: 27,
          why: "the hub writes the rate as a ray, 10^27 for 100% a year",
          unit: "",
        }
      : undefined,
  };
}

/** The supply rate, the premium included. */
export function supplyRateProv(f: V4ReserveFigures, o: { symbol: string; hub: string }): Provenance {
  const pct = (x: number | null) => (x == null ? "unknown" : `${(x * 100).toFixed(2)}%`);
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: f.block },
    summary: `${o.symbol} supply rate on the ${o.hub} hub. As an APR, the drawn rate × utilisation × (1 + premium ÷ drawn) × (1 − liquidity fee)${atHead(f)}. Suppliers earn the premium borrowers pay as well as the drawn rate, less the hub's fee.`,
    contract: hubContract(f, o.hub),
    via: `${HEAD} · getAssetDrawnRate × usage × (1 + premium ÷ drawn, from getAssetOwed) × (1 − getAssetConfig.liquidityFee)`,
    formula: "drawn rate × utilisation × (1 + premium ÷ drawn) × (1 − liquidity fee)",
    inputs: [
      { label: "drawn rate", value: pct(f.drawnApr), kind: "chain", pclass: "state", note: "hub getAssetDrawnRate" },
      {
        label: "utilisation",
        value: pct(f.utilisation),
        kind: "chain-derived",
        pclass: "state",
        note: "drawn ÷ (drawn + liquidity)",
      },
      {
        label: "premium ÷ drawn",
        value: pct(f.premiumRatio),
        kind: "chain-derived",
        pclass: "state",
        note: "hub getAssetOwed: premium owed over drawn owed",
      },
      {
        label: "liquidity fee",
        value: pct(f.liquidityFee),
        kind: "chain",
        pclass: "state",
        note: "hub getAssetConfig.liquidityFee",
      },
    ],
  };
}

/** Credit used: what the spoke owes ÷ its draw cap. */
export function creditUsedProv(f: V4ReserveFigures, o: { symbol: string; spoke: string; hub: string }): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: f.block },
    summary: `${o.symbol} credit used by ${o.spoke} on the ${o.hub} hub. What the spoke owes ÷ the draw cap the hub set for it${atHead(f)}.`,
    contract: hubContract(f, o.hub),
    via: `${HEAD} · hub getSpokeTotalOwed ÷ getSpokeConfig.drawCap`,
    formula: "owed ÷ draw cap",
  };
}

/** One spoke or hub parameter from the head read. */
export function headParamProv(
  f: V4ReserveFigures,
  side: "spoke" | "hub" | "oracle",
  what: string,
  call: string,
  meaning: string,
  o: { spoke: string; hub: string },
): Provenance {
  const contract =
    side === "hub"
      ? hubContract(f, o.hub)
      : side === "oracle" && f.oracle
        ? { name: `${o.spoke} oracle`, address: f.oracle }
        : spokeContract(f, o.spoke);
  return {
    kind: "chain",
    pclass: side === "oracle" ? "oracle" : "state",
    source: { block: f.block },
    summary: `${what} (${side === "hub" ? `the ${o.hub} hub` : `the ${o.spoke} spoke`}). ${meaning[0].toUpperCase()}${meaning.slice(1)}, read${atHead(f)}.`,
    contract,
    via: `${HEAD} · ${side === "hub" ? "hub" : side === "oracle" ? "spoke oracle" : "spoke"} ${call}`,
  };
}

/** The rate curve: the hub strategy's four numbers. */
export function curveProv(f: V4ReserveFigures, o: { symbol: string; hub: string }): Provenance {
  const inputs: ProvInput[] = f.curve
    ? [
        { label: "optimal usage", value: `${(f.curve.optimal * 100).toFixed(2)}%`, kind: "chain", pclass: "state" },
        { label: "base drawn rate", value: `${(f.curve.base * 100).toFixed(2)}%`, kind: "chain", pclass: "state" },
        {
          label: "growth before optimal",
          value: `${(f.curve.slope1 * 100).toFixed(2)}%`,
          kind: "chain",
          pclass: "state",
        },
        {
          label: "growth after optimal",
          value: `${(f.curve.slope2 * 100).toFixed(2)}%`,
          kind: "chain",
          pclass: "state",
        },
      ]
    : [];
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: f.block },
    summary: `${o.symbol} rate curve on the ${o.hub} hub. The drawn rate the hub's interest rate strategy sets at each utilisation, from its getInterestRateData${atHead(f)}. The supply line multiplies by utilisation, by 1 + premium ÷ drawn and by 1 − the liquidity fee.`,
    contract: f.strategy ? { name: `${o.hub} rate strategy`, address: f.strategy } : undefined,
    via: `${HEAD} · strategy getInterestRateData(assetId), basis points`,
    formula: "base + growth₁ × U ÷ optimal, then + growth₂ × (U − optimal) ÷ (1 − optimal)",
    inputs,
  };
}

/** The spoke's liquidation settings. */
export function liquidationConfigProv(f: V4ReserveFigures, spoke: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    source: { block: f.block },
    summary: `${spoke}'s liquidation settings. The health factor a liquidation aims to restore, the health factor at which the bonus reaches its maximum, and the share of the maximum bonus paid from the start, read${atHead(f)}.`,
    contract: spokeContract(f, spoke),
    via: `${HEAD} · spoke getLiquidationConfig()`,
  };
}

// ── History and holders ──────────────────────────────────────────────────────

export function historyRateProv(
  symbol: string,
  hub: string,
  p: { date: string; closeBlock: number; update: { block: number } },
): Provenance {
  return {
    kind: "chain",
    pclass: "indexed",
    source: { block: p.update.block },
    summary: `${symbol} drawn rate on the ${hub} hub, ${p.date}. The rate of the hub's last UpdateAsset at or before block ${n(p.closeBlock)}, the day's close (UTC), as an APR.`,
    via: `${HISTORY} · aave_v4_reserve_rates · UpdateAsset.drawnRate ÷ 10^27`,
  };
}

export function holderAmountProv(
  side: "supplied" | "borrowed",
  symbol: string,
  wallet: string,
  amount: string,
  decimals: number,
  readBlock: number,
): Provenance {
  return {
    kind: "chain",
    pclass: "indexed",
    source: { block: readBlock },
    summary: `${symbol} ${side} by ${wallet.slice(0, 6)}…${wallet.slice(-4)}. The amount on this spoke reserve, as the spoke answered at block ${n(readBlock)}${side === "borrowed" ? ", drawn debt plus premium" : ""}.`,
    via: `${HOLDERS} · position table reserves (${side === "supplied" ? "supply balance" : "debt balance"})`,
    scaling: { raw: amount, from: "call", places: decimals, why: `${symbol} has ${decimals} decimals` },
  };
}

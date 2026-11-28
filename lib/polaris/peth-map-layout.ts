// The Polaris map's layout (ui-jobs 873): every box and every possible arrow,
// the same for each address. Sources sit above the address and mechanisms
// below it. lib/polaris/peth-map-fill.ts fills it per address. Pure, and
// imports nothing through `@/`, so scripts/test loads it directly.

import { MAP_HOLDER, type MapEdge, type MapLayout, type MapNode } from "../shared/protocol-map/types";

const P = "polaris";

/** The node ids the fill writes to. */
export const PM = {
  eth: `${P}:eth`,
  fee: `${P}:fee`,
  other: `${P}:other`,
  zap: `${P}:zap`,
  curve: `${P}:curve`,
  outside: `${P}:outside`,
  cdp: `${P}:cdp`,
  sp: `${P}:sp`,
  loan: `${P}:loan`,
  splitter: `${P}:splitter`,
  pools: `${P}:pools`,
  svpeth: `${P}:svpeth`,
  morpho: `${P}:morpho`,
} as const;

/** The edge between two nodes, by its one spelling. */
export const pmEdge = (from: string, to: string): string => `${from}->${to}`;

const nodes: MapNode[] = [
  { id: PM.eth, band: "source", col: 4, span: 1, row: 1, title: "ETH and WETH", blurb: "outside Polaris" },
  {
    id: PM.fee,
    band: "source",
    col: 6,
    span: 1,
    row: 1,
    title: "Fee Router",
    blurb: "burns curve fees and rebuys reward pETH for CDP minters and svpETH holders",
  },
  {
    id: PM.other,
    band: "source",
    col: 1,
    span: 2,
    row: 2,
    title: "Other tokens",
    blurb: "USDp, GOLDp and POLAR bought by zap",
  },
  {
    id: PM.zap,
    band: "source",
    col: 4,
    span: 1,
    row: 2,
    title: "Zap router",
    blurb: "one-click trades between ETH and Polaris tokens",
  },
  {
    id: PM.curve,
    band: "source",
    col: 6,
    span: 1,
    row: 2,
    title: "Bonding curve",
    blurb: "mints and burns pETH against ETH",
  },
  {
    id: PM.outside,
    band: "source",
    col: 7,
    span: 1,
    row: 2,
    title: "Other addresses",
    blurb: "wallets and contracts outside Polaris that sent or received pETH",
  },
  { id: MAP_HOLDER, band: "holder", col: 3, span: 3, row: 3, title: "This address", blurb: "" },
  { id: PM.cdp, band: "mechanism", col: 1, span: 1, row: 4, title: "CDPs", blurb: "lock pETH, mint USDp or GOLDp" },
  {
    id: PM.sp,
    band: "mechanism",
    col: 2,
    span: 1,
    row: 4,
    title: "Stability Pools",
    blurb: "deposit USDp or GOLDp, earn pETH",
  },
  {
    id: PM.loan,
    band: "mechanism",
    col: 3,
    span: 1,
    row: 4,
    title: "Reserve loans",
    blurb: "borrow reserve ETH against fpETH",
  },
  {
    id: PM.splitter,
    band: "mechanism",
    col: 4,
    span: 1,
    row: 4,
    title: "Splitter",
    blurb: "pETH into fpETH + vpETH, and back",
  },
  {
    id: PM.pools,
    band: "mechanism",
    col: 5,
    span: 1,
    row: 4,
    title: "Pools",
    blurb: "Curve tripool, POLAR/pETH, pETH/WETH",
  },
  {
    id: PM.svpeth,
    band: "mechanism",
    col: 6,
    span: 1,
    row: 4,
    title: "svpETH vault",
    blurb: "stake vpETH; the vault supplies it to Morpho",
  },
  {
    id: PM.morpho,
    band: "mechanism",
    col: 7,
    span: 1,
    row: 4,
    title: "Morpho Blue",
    blurb: "vpETH market; Rails does not decode it yet",
  },
];

const edge = (from: string, to: string, places: string[], lane?: -1 | 0 | 1): MapEdge => ({
  id: pmEdge(from, to),
  protocol: P,
  from,
  to,
  ...(lane != null ? { lane } : {}),
  places,
});

/** Both directions between the address and a place, from the address first. */
const pair = (node: string, places: string[]): MapEdge[] => [
  edge(MAP_HOLDER, node, places, -1),
  edge(node, MAP_HOLDER, places, 1),
];

/** Where each place kind (ui-jobs 872's `place.kind`) sits on the map. Rows
 *  with no place that moved pETH to or from another address count under
 *  "transfer". */
export const PM_NODE_OF_PLACE: Record<string, string> = {
  zap: PM.zap,
  curve: PM.curve,
  transfer: PM.outside,
  cdp: PM.cdp,
  sp_deposit: PM.sp,
  loan: PM.loan,
  splitter: PM.splitter,
  venue: PM.pools,
  svpeth: PM.svpeth,
  morpho: PM.morpho,
};

export const POLARIS_MAP_LAYOUT: MapLayout = {
  id: P,
  columns: 7,
  nodes,
  edges: [
    edge(PM.eth, PM.zap, ["zap"], -1),
    edge(PM.zap, PM.eth, ["zap"], 1),
    edge(PM.zap, PM.other, ["zap"], -1),
    edge(PM.other, PM.zap, ["zap"], 1),
    edge(PM.zap, PM.curve, ["zap"]),
    edge(PM.curve, PM.fee, ["zap", "curve"]),
    ...pair(PM.zap, ["zap"]),
    ...pair(PM.curve, ["curve"]),
    ...pair(PM.outside, ["transfer"]),
    ...pair(PM.cdp, ["cdp"]),
    ...pair(PM.sp, ["sp_deposit"]),
    ...pair(PM.loan, ["loan"]),
    ...pair(PM.splitter, ["splitter"]),
    ...pair(PM.pools, ["venue"]),
    ...pair(PM.svpeth, ["svpeth"]),
    ...pair(PM.morpho, ["morpho"]),
  ],
};

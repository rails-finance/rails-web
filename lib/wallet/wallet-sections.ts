// The wallet page's sections (ui-jobs 738): one per protocol the wallet holds,
// each the listing's holder band (N7) over that protocol's cards, open first
// by risk, then closed newest first; and the totals row above them, every
// figure the sum of the section figures. Client-safe and pure: built from the
// wallet read alone (lib/wallet/read-wallet.ts).
//
// A section's dollars count in the totals only where every open position in it
// states its dollars at the protocol's oracle (decision 0050, open point 7);
// a section that does not is named under the total. Liquity V2's band is its
// listing's (lib/liquity-v2/holder-strip.ts), from the Trove rows the wallet
// read carries; every other protocol's sums its cards' dollars.

import type { HolderLeg, HolderStripProps } from "@/components/shared/holder-strip";
import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { liquityV2HolderStrip } from "@/lib/liquity-v2/holder-strip";
import { formatUsdValue } from "@/lib/utils/format";
import { walletProtocol } from "@/lib/wallet/wallet-filters";
import type { WalletPosition } from "@/lib/wallet/types";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";

/** The dust floor on the risk sort (open point 5): collateral under this many
 *  dollars lists below the sorted set. */
export const DUST_USD = 10;

/** The dollars the floor reads: the card's, or a rank-only figure. */
const dustFigure = (p: WalletPosition) => p.collateralUsd ?? p.dustUsd;
export const isDust = (p: WalletPosition) => {
  const d = dustFigure(p);
  return d != null && d < DUST_USD;
};

/** Buffer ascending where stated, then collateral dollars descending. */
export function byRisk(a: WalletPosition, b: WalletPosition): number {
  if (a.buffer != null && b.buffer != null) return a.buffer - b.buffer;
  if (a.buffer != null) return -1;
  if (b.buffer != null) return 1;
  return (b.collateralUsd ?? -1) - (a.collateralUsd ?? -1);
}

const cents = (v: number): number => Math.round(v * 100) / 100;

/** A section's figure in dollars and the receipt that rebuilds it. */
export interface SectionFigure {
  usd: number;
  prov: Provenance;
}

export interface WalletSection {
  slug: string;
  name: string;
  /** Open by risk (sorted, then under the floor, then not read), then closed
   *  newest first. */
  positions: WalletPosition[];
  open: WalletPosition[];
  /** The open positions the risk sort ranks: read, over the floor. */
  ranked: WalletPosition[];
  closed: WalletPosition[];
  /** Open positions under the dust floor. */
  dust: number;
  band: HolderStripProps;
  /** Absent where the section holds no open position, or one of them states
   *  no dollars at the protocol's oracle. */
  collateral?: SectionFigure;
  debt?: SectionFigure;
}

const closedAt = (p: WalletPosition) => p.history?.closedAt ?? 0;

/** The label a receipt row gives one position: its market, or its id. */
const positionLabel = (p: WalletPosition) =>
  p.market
    ? `${p.market} · ${p.positionId.slice(0, 8)}`
    : p.positionId.length > 12
      ? `${p.positionId.slice(0, 8)}…`
      : p.positionId;

/** Σ one dollar field over a section's open positions, each as its card
 *  states it at the protocol's oracle, to the cent. */
function sumOfCards(
  name: string,
  open: WalletPosition[],
  field: "collateralUsd" | "debtUsd",
): SectionFigure | undefined {
  if (open.length === 0) return undefined;
  if (!open.every((p) => p.usdOwnOracle && p[field] != null)) return undefined;
  const word = field === "collateralUsd" ? "collateral" : "debt";
  const rows: ProvInput[] = open.map((p) => ({
    label: `${positionLabel(p)} ${word}`,
    value: formatUsdValue(cents(p[field]!)),
    kind: "chain-derived",
    pclass: "oracle",
    note: `the position's ${word} in dollars at ${p.usdSource ?? `${name}'s oracle`}`,
  }));
  const usd = cents(open.reduce((s, p) => s + cents(p[field]!), 0));
  const many = open.length > 1;
  return {
    usd,
    prov: {
      kind: "chain-derived",
      pclass: "oracle",
      summary: `The wallet's ${name} ${word} in USD — ${
        many ? `the sum of its ${open.length} open positions' ${word}` : `its open position's ${word}`
      }, each in dollars at ${name}'s oracle, to the cent.`,
      via: "GET /api/chain/wallet/<address> · each open position's dollars",
      formula: many ? `Σ ${word} over the open positions` : word,
      inputs: many ? [...rows, { label: "sum", value: formatUsdValue(usd), kind: "derived", step: true }] : rows,
    },
  };
}

/** A section's figure as a band leg: the compact dollars, no token. */
const usdLeg = (id: string, label: string, f: SectionFigure): HolderLeg => ({
  id,
  label,
  value: formatUsdValue(f.usd),
  approx: false,
  prov: f.prov,
  figure: { tokens: [], usd: f.usd },
});

/** Liquity V2's band from the Trove rows the wallet read carries, and its
 *  figures as the band states them. */
function liquityV2Section(positions: WalletPosition[]): Pick<WalletSection, "band" | "collateral" | "debt"> | null {
  const rows: TroveSummary[] = [];
  let prices: OraclePricesData | null = null;
  for (const p of positions) {
    if (p.card.kind !== "liquity-v2") return null;
    rows.push(p.card.row);
    prices ??= p.card.prices;
  }
  if (!prices) return null;
  const passedOn = rows.filter((t) => t.formerHold).length;
  // The wallet read carries every row, so the band is never a slice.
  const band = liquityV2HolderStrip(rows, rows.length, prices, Math.max(rows.length, 1), passedOn);
  const coll = band.legs.find((l) => l.id === "collateral");
  const debt = band.legs.find((l) => l.id === "debt");
  const figure = (l: HolderLeg | undefined): SectionFigure | undefined => {
    const usd = l?.figure?.usd;
    if (l == null || usd == null) return undefined;
    // A one-branch leg's dollars sit on its USD line, with their receipt.
    return { usd, prov: l.figure?.amount != null && l.figure.usdProv ? l.figure.usdProv : l.prov };
  };
  const open = rows.some((t) => t.status === "open" && !t.formerHold);
  return {
    band,
    collateral: open ? figure(coll) : undefined,
    // Open Troves owing nothing state a debt of none.
    debt: open ? (debt ? figure(debt) : zeroDebt("Liquity V2")) : undefined,
  };
}

const zeroDebt = (name: string): SectionFigure => ({
  usd: 0,
  prov: {
    kind: "derived",
    summary: `The wallet's ${name} debt in USD — its open positions owe nothing.`,
    via: "GET /api/chain/wallet/<address>",
  },
});

/** One section per protocol, in the order of their riskiest open position;
 *  sections without a ranked buffer after, by collateral; sections with no
 *  open position last, by their latest close. */
export function walletSections(positions: WalletPosition[], opts: { bands: boolean }): WalletSection[] {
  const bySlug = new Map<string, WalletPosition[]>();
  for (const p of positions) bySlug.set(p.family, [...(bySlug.get(p.family) ?? []), p]);
  const sections: WalletSection[] = [];
  for (const [slug, mine] of bySlug) {
    const name = walletProtocol(slug)?.name ?? mine[0].familyName;
    const openAll = mine.filter((p) => p.status === "open");
    const ranked = openAll.filter((p) => !p.notRead && !isDust(p)).sort(byRisk);
    const dust = openAll.filter((p) => !p.notRead && isDust(p)).sort(byRisk);
    const notRead = openAll.filter((p) => p.notRead);
    const open = [...ranked, ...dust, ...notRead];
    const closed = mine.filter((p) => p.status !== "open").sort((a, b) => closedAt(b) - closedAt(a));
    const readable = open.filter((p) => !p.notRead);
    const liquity = slug === "liquity-v2" ? liquityV2Section(mine) : null;
    let band: HolderStripProps;
    let collateral: SectionFigure | undefined;
    let debt: SectionFigure | undefined;
    if (liquity) {
      ({ band, collateral, debt } = liquity);
    } else {
      collateral = sumOfCards(name, readable, "collateralUsd");
      debt = sumOfCards(name, readable, "debtUsd");
      const st = (s: string) => closed.filter((p) => p.status === s).length;
      const legs: HolderLeg[] = [];
      if (collateral) legs.push(usdLeg("collateral", "Total collateral", collateral));
      if (debt && debt.usd > 0) legs.push(usdLeg("debt", "Total debt", debt));
      band = {
        countsLine: "",
        counts: { open: open.length, closed: st("closed") + st("redeemed"), liquidated: st("liquidated") },
        legs,
        truncated: false,
        positions: mine.filter((p) => p.status !== "moved").length,
      };
    }
    // The section's heading and cards state the counts; the band carries
    // no sentence repeating them (Miles, 18 Nov 2026).
    band = { ...band, countsLine: "" };
    if (!opts.bands) band = { ...band, positions: 0 };
    sections.push({
      slug,
      name,
      positions: [...open, ...closed],
      open,
      ranked,
      closed,
      dust: dust.length,
      band,
      collateral,
      debt,
    });
  }
  const tier = (s: WalletSection) => (s.ranked.some((p) => p.buffer != null) ? 0 : s.open.length > 0 ? 1 : 2);
  return sections.sort((a, b) => {
    const t = tier(a) - tier(b);
    if (t !== 0) return t;
    if (tier(a) === 0) return byRisk(a.ranked[0], b.ranked[0]);
    if (tier(a) === 1) return (b.collateral?.usd ?? -1) - (a.collateral?.usd ?? -1);
    return closedAt(b.closed[0]) - closedAt(a.closed[0]);
  });
}

/** One total over the sections: each section's figure as its band states it,
 *  summed to the cent, with the sections that state none named. */
export interface WalletTotal {
  usd: number;
  prov: Provenance;
  /** Sections counted, and sections holding an open position. */
  counted: number;
  of: number;
  /** The sections with an open position that state no dollars. */
  left: string[];
}

export function walletTotal(sections: WalletSection[], which: "collateral" | "debt"): WalletTotal | null {
  const holding = sections.filter((s) => s.open.some((p) => !p.notRead));
  const counted = holding.filter((s) => s[which] != null);
  if (counted.length === 0) return null;
  const usd = cents(counted.reduce((s, x) => s + x[which]!.usd, 0));
  const left = holding.filter((s) => s[which] == null).map((s) => s.name);
  const many = counted.length > 1;
  const rows: ProvInput[] = counted.map((s) => ({
    label: `${s.name} ${which}`,
    value: formatUsdValue(s[which]!.usd),
    kind: "chain-derived",
    pclass: "oracle",
    note: `the ${s.name} section's ${which}, worked out on its receipt`,
  }));
  const leftOut = left.length
    ? ` ${left.join(" and ")} ${left.length === 1 ? "states" : "state"} no dollars at ${left.length === 1 ? "its" : "their"} oracle and ${left.length === 1 ? "is" : "are"} left out.`
    : "";
  return {
    usd,
    counted: counted.length,
    of: holding.length,
    left,
    prov: {
      kind: "chain-derived",
      pclass: "oracle",
      summary: `The wallet's ${which} in USD — ${
        many ? `the sum of each protocol's ${which} below` : `the ${counted[0].name} ${which} below`
      }, each at that protocol's oracle.${leftOut}`,
      via: "GET /api/chain/wallet/<address> · Σ over the protocols below",
      formula: many ? `Σ ${which} over the protocols` : which,
      inputs: many ? [...rows, { label: "sum", value: formatUsdValue(usd), kind: "derived", step: true }] : rows,
    },
  };
}

/** Collateral less debt, where both totals cover the same protocols. */
export function walletNet(coll: WalletTotal | null, debt: WalletTotal | null): SectionFigure | null {
  if (!coll || !debt || coll.counted !== debt.counted || coll.left.join() !== debt.left.join()) return null;
  const usd = cents(coll.usd - debt.usd);
  return {
    usd,
    prov: {
      kind: "derived",
      summary: "The wallet's net in USD — the collateral total less the debt total, both shown beside it.",
      via: "the Collateral and Debt totals",
      formula: "collateral − debt",
      inputs: [
        { label: "collateral", value: formatUsdValue(coll.usd), kind: "derived", step: true },
        { label: "debt", value: formatUsdValue(debt.usd), kind: "derived", step: true },
        { label: "net", value: formatUsdValue(usd), kind: "derived", step: true },
      ],
    },
  };
}

// The wallet page's sections (ui-jobs 738): one per protocol the wallet holds,
// each the listing's holder band (N7) over that protocol's cards, open first
// by risk, then closed newest first; and the totals row above them, every
// figure the sum of the section figures. Client-safe and pure: built from the
// wallet read alone (lib/wallet/read-wallet.ts).
//
// A section's dollars count in the totals only where every open position in it
// states its dollars at the protocol's oracle (decision 0050, open point 7).
// The wallet total sums the sections that state both figures and names the
// ones it leaves out under the row (Miles, 24 Nov 2026, "wallet total b";
// rails-ops infra item 37). Liquity V1's and V2's
// bands are their listings' (lib/liquity-v1/holder-strip.ts,
// lib/liquity-v2/holder-strip.ts), from the Trove and deposit rows the wallet
// read carries, a deposit its own total; every other protocol's sums its
// cards' dollars. A deposit's dollars count with the collateral in the
// section's figures. While a protocol's listing read did not answer
// (read-wallet.ts, readListingRows), its section states no total and the
// wallet total leaves it out.
//
// An open Trove on a branch whose pool the admin emptied after its shutdown
// (lib/wallet/trove-shutdown.ts; ui-jobs 802) states no collateral dollars, so
// its section states no collateral total, as with an unpriced deposit; the
// band carries its collateral as "Recorded collateral" in its token, and the
// note names it once per branch. A Trove on a shut-down branch states no
// buffer, so the risk sort and "Closest to liquidation" leave it out.
//
// A vault share's dollars are the holder census's at its census block (ui-jobs
// 783), a stored figure: its card states them, and its section states them as
// a dated subtotal outside the wallet total (`census`). So does a section
// whose every open position is a stored read with dollars (`storedSubtotal`);
// a section mixing stored and head figures states none (rule 743).

import type { HolderLeg, HolderStripProps } from "@/components/shared/holder-strip";
import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { liquityV2HolderStrip } from "@/lib/liquity-v2/holder-strip";
import { liquityV1HolderStrip } from "@/lib/liquity-v1/holder-strip";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import type { LiquityV1DepositRow } from "@/lib/sources/api/liquity-v1-sp";
import type { LiquityV1StakeRow } from "@/lib/sources/api/liquity-v1-staking";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import { headDepositLeg, headStakeLeg } from "@/lib/wallet/deposit-claim";
import { scaled } from "@/lib/wallet/summary-row";
import { formatUsdValue } from "@/lib/utils/format";
import { walletProtocol } from "@/lib/wallet/wallet-filters";
import type { WalletPosition } from "@/lib/wallet/types";
import { onEmptiedBranch, recordedCollateralLeg } from "@/lib/wallet/trove-shutdown";
import { CHAINS } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { SP_DEPLOYMENTS, spPool, type SpDeploymentId } from "@/lib/liquity-v2/sp-deployment";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";

/** The dust floor on the risk sort (open point 5): collateral under this many
 *  dollars lists below the sorted set. */
export const DUST_USD = 10;

/** The dollars the floor reads: the card's, or a rank-only figure. */
const dustFigure = (p: WalletPosition) => p.collateralUsd ?? p.dustUsd;
/** A stake's dollars are its fees pending, the LQTY not valued, so they say
 *  nothing of its size: no stake is dust. */
export const isDust = (p: WalletPosition) => {
  if (p.kind === "stakes") return false;
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
  /** Open positions not read at head (`unreadAtHead`): while any, the
   *  section states no figure. */
  unread: number;
  band: HolderStripProps;
  /** Absent where the section holds no open position, or one of them states
   *  no dollars at the protocol's oracle. */
  collateral?: SectionFigure;
  debt?: SectionFigure;
  /** Every position on a testnet (Polaris on Sepolia): the section stands
   *  outside the wallet's totals and its risk tile (WALLET_COUNTS_SCOPE). */
  testnet: boolean;
  /** Every open position is a vault share at its census block, read on this
   *  visit: the section states a dated subtotal outside the wallet total
   *  (`CENSUS_NOTE`), or no figure where a share states no dollars. */
  census: boolean;
}

/** A vault share's figures are the holder census's, at its block. */
const atCensus = (p: WalletPosition) => p.card.kind === "vault" && p.headRead === "stored";

/** The band's note for a vault-share section: its subtotal stands outside
 *  the wallet total, or, where a share states no dollars, it has none. */
export const CENSUS_NOTE =
  "The vault values are the census's at each vault's census block, so the wallet total leaves them out.";
export const CENSUS_NO_TOTAL =
  "The vault values are the census's at each vault's census block, so the section states no total.";

/** A position on a testnet, which no wallet count or total takes in. */
export const onTestnet = (p: Pick<WalletPosition, "chain">): boolean => CHAINS[p.chain]?.testnet === true;

/** "A", "A and B", "A, B and C". */
export const andList = (xs: string[]) =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

const closedAt = (p: WalletPosition) => p.history?.closedAt ?? 0;

/** An open position whose figures were not read at head this visit: an
 *  account the chain has not been read for, a head read that did not answer
 *  (its card keeps the stored figures), or the last visit's stored read (the
 *  Arbitrum lane). A section holding one states no total, so no stored figure
 *  is summed with head-read ones (rule 743). */
export const unreadAtHead = (p: WalletPosition) =>
  p.notRead === true || p.headRead === "failed" || p.headRead === "stored";

/** A section's note where some of its open positions went unread at head:
 *  all of them, some of them, or none (no note). `subtotal`: the band states
 *  their stored figures, dated, outside the wallet total. */
export function unreadNote(unread: number, open: number, subtotal = false): string | undefined {
  if (unread <= 0 || open <= 0) return undefined;
  const who =
    unread < open
      ? `${unread} of the ${open} open positions`
      : open === 1
        ? "The open position"
        : `None of the ${open} open positions`;
  const could = unread === open && open > 1 ? "could be read" : "could not be read";
  return subtotal
    ? `${who} ${could} at the chain head, so the subtotal is the stored figures and the wallet total leaves it out.`
    : `${who} ${could} at the chain head, so the section states no total.`;
}

/** A position's dollars in one field. A missing debt counts as none only on
 *  a deposit or a stake no head read contradicts: a head read states its debt, so one
 *  missing there is unpriced, not zero. */
const dollarsOf = (p: WalletPosition, field: "collateralUsd" | "debtUsd") =>
  p[field] ??
  (field === "debtUsd" && (p.kind === "deposits" || p.kind === "stakes") && p.headRead !== "read" ? 0 : undefined);

/** A deposit or stake with no head read and no debt figure: it owes nothing. */
const owesNothingUnread = (p: WalletPosition) =>
  (p.kind === "deposits" || p.kind === "stakes") && p.headRead !== "read" && p.debtUsd == null;

/** The position states its dollars in the field at the protocol's oracle. */
const stated = (p: WalletPosition, field: "collateralUsd" | "debtUsd") =>
  p.usdOwnOracle === true && dollarsOf(p, field) != null;

/** The label a receipt row gives one position: its market, or its id. */
const positionLabel = (p: WalletPosition) => {
  // A stake's id is "stake:<address>", apart from the address's deposit.
  const id = p.positionId.replace(/^stake:/, "");
  return p.market ? `${p.market} · ${id.slice(0, 8)}` : id.length > 12 ? `${id.slice(0, 8)}…` : id;
};

/** Σ one dollar field over a section's open positions, each as its card
 *  states it at the source its row names, to the cent. */
function sumOfCards(
  name: string,
  held: WalletPosition[],
  field: "collateralUsd" | "debtUsd",
  /** A vault share's value at the census's price, which is no protocol's
   *  oracle: summed as its card states it, under this word. */
  census?: string,
): SectionFigure | undefined {
  if (held.length === 0) return undefined;
  // A deposit or stake no head read prices (a fork's deposit) owes nothing:
  // it leaves the debt sum, and a section of them alone owes none.
  const open = field === "debtUsd" ? held.filter((p) => !owesNothingUnread(p)) : held;
  if (open.length === 0) return zeroDebt(name);
  if (!open.every((p) => (census ? dollarsOf(p, field) != null : stated(p, field)))) return undefined;
  const word = census ?? (field === "collateralUsd" ? "collateral" : "debt");
  const deposits = field === "collateralUsd" && open.every((p) => p.kind === "deposits");
  // A position whose dollars come from more than one source (a deposit's
  // $1 face and its gain at a price feed) is one row per source.
  const partsOf = (p: WalletPosition) => (field === "collateralUsd" ? p.usdParts : undefined);
  const dollars = (p: WalletPosition) =>
    partsOf(p)?.reduce((s, x) => s + cents(x.usd ?? 0), 0) ?? cents(dollarsOf(p, field)!);
  const rows: ProvInput[] = open.flatMap((p): ProvInput[] => {
    const parts = partsOf(p);
    if (parts)
      return parts.map((x) => ({
        label: `${positionLabel(p)} ${x.label}`,
        value: x.usd == null ? "not valued" : formatUsdValue(cents(x.usd)),
        kind: "chain-derived",
        ...(x.pclass ? { pclass: x.pclass } : {}),
        note: x.usd == null ? `the ${x.label}, not valued: no price is read for it` : `in dollars at ${x.source}`,
      }));
    const what = field === "collateralUsd" && p.kind === "deposits" ? "deposit" : word;
    return [
      {
        label: `${positionLabel(p)} ${what}`,
        value: formatUsdValue(cents(dollarsOf(p, field)!)),
        kind: "chain-derived",
        pclass: p.usdClass ?? "oracle",
        note: `the position's ${what} in dollars at ${p.usdSource ?? `${name}'s oracle`}`,
      },
    ];
  });
  const usd = cents(open.reduce((s, p) => s + dollars(p), 0));
  const many = open.length > 1;
  const noun = deposits ? "deposit" : "position";
  const oracle = rows.every((r) => r.pclass === "oracle");
  return {
    usd,
    prov: {
      kind: "chain-derived",
      ...(oracle ? { pclass: "oracle" as const } : {}),
      summary: `The wallet's ${name} ${deposits ? "deposits" : word} in USD — ${
        many
          ? `the sum of its ${open.length} open ${noun}s' dollars, each at the ${rows.length > open.length ? "sources named on its rows" : "source named on its row"}`
          : rows.length > 1
            ? `its open ${noun}'s dollars, at the sources named on its rows`
            : `its open ${noun}'s dollars, at the source named on its row`
      }, to the cent.`,
      via: "GET /api/chain/wallet/<address> · each open position's dollars",
      formula: many ? `Σ ${deposits ? "deposits" : word} over the open ${noun}s` : deposits ? "deposit" : word,
      inputs:
        rows.length > 1 ? [...rows, { label: "sum", value: formatUsdValue(usd), kind: "derived", step: true }] : rows,
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

/** The band's legs where every open position is a stored read (a vault
 *  share at its census block, a last-visit read): each figure the cards'
 *  stored dollars, dated by the reads (Miles, 24 Nov 2026, "wallet total
 *  b"). None where a position states no dollars or no read time. */
function storedSubtotal(name: string, open: WalletPosition[], census: boolean): HolderLeg[] | null {
  const times = open.map((p) => p.readAt);
  if (open.length === 0 || times.some((t) => t == null)) return null;
  const from = formatDate(Math.min(...(times as number[])));
  const to = formatDate(Math.max(...(times as number[])));
  const when = from === to ? `as read on ${from}` : `as read from ${from} to ${to}`;
  const coll = sumOfCards(name, open, "collateralUsd", census ? "value" : undefined);
  if (!coll) return null;
  const debt = census ? undefined : sumOfCards(name, open, "debtUsd");
  if (!census && !debt) return null;
  const dated = (l: HolderLeg): HolderLeg => ({
    ...l,
    footnote: { text: census ? `at the census blocks, ${when}` : when },
  });
  return [
    dated(usdLeg("collateral", census ? "Subtotal" : "Collateral subtotal", coll)),
    ...(debt && debt.usd > 0 ? [dated(usdLeg("debt", "Debt subtotal", debt))] : []),
  ];
}

/** The band's deposit leg from the head read, where every open deposit has
 *  one, and on Liquity V1 its stake leg from LQTYStaking's stakes(staker);
 *  the listing adapter's legs otherwise. */
function withHeadDeposits(
  band: HolderStripProps,
  positions: WalletPosition[],
  protocol: "V1" | "V2",
): HolderStripProps {
  const heads: { amount: number; block?: number }[] = [];
  for (const p of positions) {
    if (p.status !== "open") continue;
    if (p.card.kind !== "liquity-v1-deposit" && p.card.kind !== "liquity-v2-deposit") continue;
    if (!p.card.head) {
      heads.length = 0;
      break;
    }
    heads.push({ amount: scaled(p.card.head.compoundedRaw, 18), block: p.readAtBlock });
  }
  const stakes: { amount: number; block?: number }[] = [];
  let stakesRead = true;
  for (const p of positions) {
    if (p.status !== "open" || p.card.kind !== "liquity-v1-stake") continue;
    if (!p.card.head) stakesRead = false;
    else stakes.push({ amount: scaled(p.card.head.stakeRaw, 18), block: p.readAtBlock });
  }
  const opts =
    protocol === "V1"
      ? { symbol: "LUSD", getter: "getCompoundedLUSDDeposit", protocol: "Liquity V1" }
      : { symbol: "BOLD", getter: "getCompoundedBoldDeposit", protocol: "Liquity V2" };
  return {
    ...band,
    legs: band.legs.map((l) =>
      l.id === "deposit" && heads.length > 0
        ? headDepositLeg(l, heads, opts)
        : l.id === "stake" && stakesRead && stakes.length > 0
          ? headStakeLeg(l, stakes)
          : l,
    ),
  };
}

/** Two section figures as one: the Troves' and the deposits'. */
function plusFigure(
  name: string,
  a: SectionFigure | undefined,
  b: SectionFigure | undefined,
): SectionFigure | undefined {
  if (!a || !b) return a ?? b;
  const usd = cents(a.usd + b.usd);
  return {
    usd,
    prov: {
      kind: "chain-derived",
      summary: `The wallet's ${name} Troves' collateral and Stability Pool deposits in USD — the Troves' collateral at the branch prices and the deposits at the source named on their rows, summed to the cent.`,
      via: "GET /api/chain/wallet/<address> · each open position's dollars",
      formula: "Troves' collateral + Stability Pool deposits",
      inputs: [
        { label: "Troves' collateral", value: formatUsdValue(a.usd), kind: "derived", step: true },
        { label: "Stability Pool deposits", value: formatUsdValue(b.usd), kind: "derived", step: true },
        { label: "sum", value: formatUsdValue(usd), kind: "derived", step: true },
      ],
    },
  };
}

/** Liquity V2's band from the Trove and deposit rows the wallet read
 *  carries, and its figures: the Troves' as the band states them, the open
 *  deposits' at head beside them. */
function liquityV2Section(positions: WalletPosition[]): Pick<WalletSection, "band" | "collateral" | "debt"> | null {
  const rows: TroveSummary[] = [];
  const deposits: LiquityV2DepositRow[] = [];
  const openDeposits: WalletPosition[] = [];
  let prices: OraclePricesData | null = null;
  for (const p of positions) {
    if (p.card.kind === "liquity-v2-deposit") {
      deposits.push(p.card.row);
      if (p.status === "open") openDeposits.push(p);
      continue;
    }
    if (p.card.kind !== "liquity-v2") return null;
    rows.push(p.card.row);
    prices ??= p.card.prices;
  }
  const open = rows.some((t) => t.status === "open" && !t.formerHold);
  // The Troves' collateral needs the branch prices; a wallet with no open
  // Trove sums none.
  if (!prices && open) return null;
  const passedOn = rows.filter((t) => t.formerHold).length;
  // The wallet read carries every row, so the band is never a slice.
  const listed = liquityV2HolderStrip(
    rows,
    rows.length,
    prices ?? ({} as OraclePricesData),
    Math.max(rows.length, 1),
    passedOn,
    undefined,
    deposits.length ? { rows: deposits, total: deposits.length } : undefined,
  );
  const band = withHeadDeposits(listed, positions, "V2");
  const coll = band.legs.find((l) => l.id === "collateral");
  const debt = band.legs.find((l) => l.id === "debt");
  const figure = (l: HolderLeg | undefined): SectionFigure | undefined => {
    const usd = l?.figure?.usd;
    if (l == null || usd == null) return undefined;
    // A one-branch leg's dollars sit on its USD line, with their receipt.
    return { usd, prov: l.figure?.amount != null && l.figure.usdProv ? l.figure.usdProv : l.prov };
  };
  const deposited = sumOfCards("Liquity V2", openDeposits, "collateralUsd");
  const troves = open ? figure(coll) : undefined;
  return {
    band,
    // An open deposit whose figure does not stand leaves the section's.
    collateral:
      openDeposits.length && !deposited
        ? undefined
        : open && !troves
          ? undefined
          : plusFigure("Liquity V2", troves, deposited),
    // Open Troves owing nothing state a debt of none.
    debt: open
      ? debt
        ? figure(debt)
        : zeroDebt("Liquity V2")
      : openDeposits.length
        ? zeroDebt("Liquity V2")
        : undefined,
  };
}

/** Liquity V1's band from its Trove, deposit and stake rows; its figures are
 *  its open cards' dollars at head, as every other protocol's. */
function liquityV1Band(positions: WalletPosition[]): HolderStripProps {
  const troves: LiquityV1PositionSummary[] = [];
  const deposits: LiquityV1DepositRow[] = [];
  const stakes: LiquityV1StakeRow[] = [];
  for (const p of positions) {
    if (p.card.kind === "liquity-v1") troves.push(p.card.row);
    else if (p.card.kind === "liquity-v1-deposit") deposits.push(p.card.row);
    else if (p.card.kind === "liquity-v1-stake") stakes.push(p.card.row);
  }
  return withHeadDeposits(
    liquityV1HolderStrip(
      troves.length ? { rows: troves, total: troves.length } : undefined,
      deposits.length ? { rows: deposits, total: deposits.length } : undefined,
      Math.max(troves.length, 1),
      undefined,
      stakes.length ? { rows: stakes, total: stakes.length } : undefined,
    ),
    positions,
    "V1",
  );
}

const zeroDebt = (name: string): SectionFigure => ({
  usd: 0,
  prov: {
    kind: "derived",
    summary: `The wallet's ${name} debt in USD — its open positions owe nothing.`,
    via: "GET /api/chain/wallet/<address>",
  },
});

/** The emptied Troves' recorded collateral, each branch named once: "the
 *  stcUSD Trove's recorded collateral", "the stcUSD Troves' …" for several. */
function shutNames(emptied: WalletPosition[]): string[] {
  const byMarket = new Map<string, number>();
  for (const p of emptied) if (p.market) byMarket.set(p.market, (byMarket.get(p.market) ?? 0) + 1);
  return [...byMarket].map(([m, n]) => (n > 1 ? `the ${m}s' recorded collateral` : `the ${m}'s recorded collateral`));
}

/** One section per protocol, in the order of their riskiest open position;
 *  sections without a ranked buffer after, by collateral; sections with no
 *  open position last, by their latest close. */
export function walletSections(
  positions: WalletPosition[],
  opts: {
    bands: boolean;
    /** Listing reads that did not answer: each one's protocol slug and what it reads. */
    unanswered?: { family: string; what: string }[];
  },
): WalletSection[] {
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
    const unread = open.filter(unreadAtHead).length;
    const census = open.length > 0 && open.every(atCensus);
    // An open Trove on an emptied branch leaves the collateral dollars: its
    // recorded collateral is the band's own leg (ui-jobs 802).
    const emptied = open.filter(onEmptiedBranch);
    const priced = open.filter((p) => !onEmptiedBranch(p));
    const liquity = slug === "liquity-v2" ? liquityV2Section(mine.filter((p) => !onEmptiedBranch(p))) : null;
    let band: HolderStripProps;
    let collateral: SectionFigure | undefined;
    let debt: SectionFigure | undefined;
    if (liquity) {
      ({ band, collateral, debt } = liquity);
      // The emptied Troves still count among the section's positions.
      if (emptied.length > 0)
        band = {
          ...band,
          counts: { ...band.counts, open: band.counts.open + emptied.length },
          positions: (band.positions ?? 0) + emptied.length,
        };
    } else if (slug === "liquity-v1") {
      collateral = sumOfCards(name, priced, "collateralUsd");
      debt = sumOfCards(name, open, "debtUsd");
      band = liquityV1Band(mine);
    } else {
      collateral = sumOfCards(name, priced, "collateralUsd");
      debt = sumOfCards(name, open, "debtUsd");
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
    // The emptied Troves' recorded collateral, after the dollar total.
    const recordedNames = shutNames(emptied);
    if (emptied.length > 0) {
      // A section total covers every open position or none (Miles, 18 Nov
      // 2026): with an emptied branch's Trove the section states no
      // collateral total, as with an unpriced deposit.
      collateral = undefined;
      const dep = SP_DEPLOYMENTS[slug as SpDeploymentId];
      const leg = recordedCollateralLeg(slug, emptied, dep ? (c) => spPool(dep, c)?.collateralAddr : undefined);
      const rest = band.legs.filter((l) => l.id !== "collateral");
      band = { ...band, legs: [...(leg ? [leg] : []), ...rest] };
    }
    // The section's heading and cards state the counts; the band carries
    // no sentence repeating them (Miles, 18 Nov 2026).
    band = { ...band, countsLine: "" };
    const missing = (opts.unanswered ?? []).filter((u) => u.family === slug).map((u) => u.what);
    if (missing.length > 0) {
      collateral = undefined;
      debt = undefined;
      band = { ...band, legs: [], note: `${andList(missing)} could not be read, so the section states no total.` };
    } else if (unread > 0) {
      collateral = undefined;
      debt = undefined;
      // A section of stored reads alone states them as a dated subtotal;
      // stored and head figures are never summed together (rule 743).
      const legs = unread === open.length && !open.some((p) => p.notRead) ? storedSubtotal(name, open, census) : null;
      band = {
        ...band,
        legs: legs ?? [],
        note: census ? (legs ? CENSUS_NOTE : CENSUS_NO_TOTAL) : unreadNote(unread, open.length, legs != null),
      };
    } else if (open.length > 0 && (collateral == null) !== (debt == null)) {
      // One figure stands: the band says the other states none, so a lone
      // "Total collateral" never reads as owing nothing.
      const missing = collateral == null ? "collateral" : "debt";
      const field = missing === "collateral" ? "collateralUsd" : "debtUsd";
      const lacking = (field === "collateralUsd" ? priced : open).filter(
        (p) => !stated(p, field) && !(field === "debtUsd" && owesNothingUnread(p)),
      );
      // Unpriced deposits are named (a fork's deposit states no dollars),
      // each market once, after the emptied Troves' recorded collateral.
      const deposits = lacking.every((p) => p.kind === "deposits" && p.market);
      const names = [
        ...(field === "collateralUsd" ? recordedNames : []),
        ...(deposits ? [...new Set(lacking.map((p) => `the ${p.market} deposit`))] : []),
      ];
      const named =
        deposits && names.length > 0
          ? `${andList(names)} ${names.length === 1 ? "states" : "state"} no dollars`
          : `an open position's ${missing} states no dollars`;
      band = { ...band, note: `No ${missing} total: ${named}.` };
    }
    if (!opts.bands) band = { ...band, positions: 0 };
    sections.push({
      slug,
      name,
      positions: [...open, ...closed],
      open,
      ranked,
      closed,
      dust: dust.length,
      unread,
      band,
      collateral,
      debt,
      testnet: mine.every(onTestnet),
      census,
    });
  }
  const tier = (s: WalletSection) => (s.ranked.some((p) => p.buffer != null) ? 0 : s.open.length > 0 ? 1 : 2);
  return sections.sort((a, b) => {
    // A testnet's sections follow every mainnet one.
    if (a.testnet !== b.testnet) return Number(a.testnet) - Number(b.testnet);
    const t = tier(a) - tier(b);
    if (t !== 0) return t;
    if (tier(a) === 0) return byRisk(a.ranked[0], b.ranked[0]);
    if (tier(a) === 1) return (b.collateral?.usd ?? -1) - (a.collateral?.usd ?? -1);
    return closedAt(b.closed[0]) - closedAt(a.closed[0]);
  });
}

/** The "Closest to liquidation" tile's position (W2): the smallest buffer
 *  any section ranks that states its risk figure. A Trove on a shut-down
 *  branch states neither (lib/wallet/trove-shutdown.ts), so it is never the
 *  one; undefined where no position states one. */
export function closestToLiquidation(sections: WalletSection[]): WalletPosition | undefined {
  return sections
    .filter((s) => !s.testnet)
    .flatMap((s) => s.ranked)
    .filter((p) => p.buffer != null && p.riskFigure)
    .sort(byRisk)[0];
}

/** One total over the sections: each section's figure as its band states it,
 *  summed to the cent. The total covers every section that states both
 *  figures and names the rest (Miles, 24 Nov 2026, "wallet total b"); each
 *  of those keeps its own band, a dated subtotal where its figures are
 *  stored ones. */
export interface WalletTotal {
  /** Absent while no section holding an open position states both figures. */
  figure?: SectionFigure;
  /** The sections summed. */
  of: number;
  /** Where nothing is summed: "No wallet total: Morpho Blue states no dollars". */
  gap?: string;
  /** Beside a figure, what it leaves out: "Leaves out Morpho Blue and
   *  Fluid (no dollars); Vaults (valued at the census blocks)." */
  leaves?: string;
}

export function walletTotal(
  sections: WalletSection[],
  which: "collateral" | "debt",
  /** What the listing reads that did not answer read ("Liquity V1 Troves"). */
  unanswered: string[] = [],
): WalletTotal | null {
  const open = sections.filter((s) => s.open.length > 0 && !s.testnet);
  if (open.length === 0 && unanswered.length === 0) return null;
  // One rule for both figures: a section missing either is left out of
  // both, so Net reads over the same sections (Miles, 18 Nov 2026). A
  // listing read that did not answer may hold an open position: named too.
  const missing = open.filter((s) => s.collateral == null || s.debt == null);
  const holding = open.filter((s) => !missing.includes(s));
  const named = missing.filter((s) => !unanswered.some((u) => u.startsWith(`${s.name} `)));
  const census = named.filter((s) => s.census).map((s) => s.name);
  const unread = named.filter((s) => !s.census && s.unread > 0).map((s) => s.name);
  const priced = named.filter((s) => !s.census && s.unread === 0).map((s) => s.name);
  if (holding.length === 0) {
    const why = [
      unanswered.length ? `${andList(unanswered)} could not be read` : null,
      census.length ? "vault shares are valued at their census blocks" : null,
      priced.length ? `${andList(priced)} ${priced.length === 1 ? "states" : "state"} no dollars` : null,
      unread.length ? `${andList(unread)} ${unread.length === 1 ? "was" : "were"} not read at the chain head` : null,
    ].filter(Boolean);
    return { of: 0, gap: `No wallet total: ${why.join(" and ")}` };
  }
  // One group per reason, each naming its sections once.
  const left = [
    unanswered.length ? `${andList(unanswered)} (could not be read)` : null,
    census.length ? `${andList(census)} (valued at the census blocks)` : null,
    priced.length ? `${andList(priced)} (no dollars)` : null,
    unread.length ? `${andList(unread)} (not read at the chain head)` : null,
  ].filter((x): x is string => x != null);
  const usd = cents(holding.reduce((s, x) => s + x[which]!.usd, 0));
  const many = holding.length > 1;
  const rows: ProvInput[] = holding.map((s) => ({
    label: `${s.name} ${which}`,
    value: formatUsdValue(s[which]!.usd),
    kind: "chain-derived",
    ...(s[which]!.prov.pclass ? { pclass: s[which]!.prov.pclass } : {}),
    note: `the ${s.name} section's ${which}, worked out on its receipt`,
  }));
  const oracle = holding.every((s) => s[which]!.prov.pclass === "oracle");
  return {
    of: holding.length,
    ...(left.length ? { leaves: `Leaves out ${left.join("; ")}.` } : {}),
    figure: {
      usd,
      prov: {
        kind: "chain-derived",
        ...(oracle ? { pclass: "oracle" as const } : {}),
        summary: `The wallet's ${which} in USD — ${
          many ? `the sum of each protocol's ${which} below` : `the ${holding[0].name} ${which} below`
        }, each at the sources its receipt names.`,
        via: "GET /api/chain/wallet/<address> · Σ over the protocols below",
        formula: many ? `Σ ${which} over the protocols` : which,
        inputs: many ? [...rows, { label: "sum", value: formatUsdValue(usd), kind: "derived", step: true }] : rows,
      },
    },
  };
}

/** Collateral less debt, where both totals stand. */
export function walletNet(coll: WalletTotal | null, debt: WalletTotal | null): SectionFigure | null {
  if (!coll?.figure || !debt?.figure) return null;
  const c = coll.figure.usd;
  const d = debt.figure.usd;
  const usd = cents(c - d);
  return {
    usd,
    prov: {
      kind: "derived",
      summary: "The wallet's net in USD — the collateral total less the debt total, both shown beside it.",
      via: "the Collateral and Debt totals",
      formula: "collateral − debt",
      inputs: [
        { label: "collateral", value: formatUsdValue(c), kind: "derived", step: true },
        { label: "debt", value: formatUsdValue(d), kind: "derived", step: true },
        { label: "net", value: formatUsdValue(usd), kind: "derived", step: true },
      ],
    },
  };
}

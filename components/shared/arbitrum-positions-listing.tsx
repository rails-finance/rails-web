"use client";

// The positions page of a position-first Arbitrum explorer (rails-ops
// TO-DO-arbitrum-scoping.md item 18): the wallets rails-server has recorded a
// position read for, in the standard listing (ChainTruthListingPage, the
// memory tier over the route's rows), fed by the daily discovery and the
// reader's open (item 16). A wallet that held nothing at its read is not a
// position: the server page passes the rows the chain read found open.
//
// A row is one wallet's stored read: dollar totals and asset counts at one
// block, and no per-asset list. The family cards build their headlines from
// those lists (Aave's reserves, a Comet's base and collateral, a Morpho
// market's legs) and the Compound and Morpho cards describe one market each,
// so the row feeds the shared PositionCard they draw through: wallet,
// status, the totals as headlines, and the read's block at the foot.
//
// The footer sets the open rows against the server's census, the wallets
// holding an open position on the protocol at its daily chain read (rails-ops
// reference/arbitrum-position-first-lane.md, "The census"). Without a census
// it states the indexed count alone.
//
// A Compound row that carries the stored visit's `markets` draws one card per
// open (wallet, Comet), each linking to that Comet's section of the wallet
// page (lib/compound-arbitrum/comet-cards.ts; rails-ops
// reference/arbitrum-position-first-lane.md). A row without it keeps the
// wallet's card.

import type { ReactNode } from "react";
import { ChainTruthListingPage, memoryStrategy } from "@/components/shared/chain-truth-listing-page";
import { PositionCard, type PositionCardHead, type PositionCardStatus } from "@/components/shared/position-card";
import { WalletPill } from "@/components/shared/wallet-pill";
import { RailHeader } from "@/components/shared/rail-header";
import { RevealTip } from "@/components/shared/reveal-tip";
import { MountedAge } from "@/components/shared/mounted-age";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import type { BaseListFilters, ListDimension } from "@/lib/shared/list-filter";
import { rangeAdmits, sizeDimensions } from "@/lib/shared/size-dimensions";
import { protocolForSession } from "@/lib/shared/protocols";
import type { SessionProtocol } from "@/lib/shared/sessions";
import type { CensusFigures } from "@/lib/home/census-leg";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { formatCompactUsd } from "@/lib/shared/format-compact";
import { formatUsdValue } from "@/lib/utils/format";
import { hfLabelV3 } from "@/lib/aave-v3/position-state";
import { AAVE_V3_ARBITRUM_POOL } from "@/lib/aave-v3-arbitrum/asset-catalog";
import { MORPHO_ARBITRUM_BLUE } from "@/lib/morpho-arbitrum/asset-catalog";
import { ListingTag } from "@/components/shared/listing-tag";
import type { CompoundArbitrumVisitMarket } from "@/lib/compound-arbitrum/api-contract";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";
import { compoundArbitrumMarketHref } from "@/lib/compound-arbitrum/routes";
import {
  cometFooterLead,
  expandCards,
  footerFigures,
  type CometCard,
  type ListingCard,
} from "@/lib/compound-arbitrum/comet-cards";

/** The fields the three families' rows share (lib/<family>-arbitrum/api-contract.ts). */
export interface ArbitrumReadRow {
  wallet: string;
  blockNumber: number | null;
  /** Aave only: the Pool's health factor; null without debt. */
  healthFactor?: number | null;
  /** Compound and Morpho only: the lent side. */
  totalSupplyUsd?: number | null;
  totalCollateralUsd: number | null;
  totalDebtUsd: number | null;
  supplyCount: number;
  borrowCount: number;
  /** Compound and Morpho only. */
  collateralCount?: number;
  chainOpen: boolean | null;
  chainStale: boolean;
  refreshedAt: string | null;
  lastVisitedAt: string | null;
  /** The wallet's last block in the daily discovery log read; absent or null
   *  for a wallet no discovery named. */
  lastActivityBlock?: number | null;
  /** Compound only: the stored visit's Comets; absent until the server sends it. */
  markets?: CompoundArbitrumVisitMarket[];
}

type Card = ListingCard<ArbitrumReadRow>;

export type ArbitrumPositionsFamily = "aave-v3" | "compound-v3" | "morpho";

interface FamilyConfig {
  session: SessionProtocol;
  /** The receipt for a stored dollar total, or the health factor. */
  receipt: (what: string, row: ArbitrumReadRow) => Provenance;
}

const blockOf = (row: ArbitrumReadRow) => row.blockNumber ?? "unknown";
const RECORDED = "recorded by rails-server when the wallet's page was opened";

const FAMILIES: Record<ArbitrumPositionsFamily, FamilyConfig> = {
  "aave-v3": {
    session: "aave-v3-arbitrum",
    receipt: (what, row) => ({
      kind: "chain",
      pclass: "state",
      source: { block: blockOf(row) },
      contract: { name: "Aave V3 Pool (Arbitrum)", address: AAVE_V3_ARBITRUM_POOL },
      via: `Pool.getUserAccountData(${row.wallet}) at block ${blockOf(row)}, ${RECORDED}`,
      summary:
        what === "Health factor"
          ? `The account's health factor as the Pool gave it at block ${blockOf(row)}.`
          : `${what} in dollars, as the Pool's getUserAccountData gave it at block ${blockOf(row)}, priced at the Pool's oracle.`,
      verify: {
        kind: "recompute",
        text: `Call getUserAccountData(${row.wallet}) on the Pool at block ${blockOf(row)}`,
      },
    }),
  },
  "compound-v3": {
    session: "compound-v3-arbitrum",
    receipt: (what, row) => ({
      kind: "chain-derived",
      pclass: "state",
      source: { block: blockOf(row) },
      via: `GET /api/chain/compound-arbitrum/wallet at block ${blockOf(row)}, ${RECORDED}`,
      formula: "Σ Comet figure × Comet getPrice",
      summary: `${what} in dollars across the four Comets — each balance read from its Comet at block ${blockOf(row)} and priced at that Comet's getPrice, the WETH Comet's ETH figures converted at the USDC Comet's WETH feed.`,
      verify: { kind: "recompute", text: `Re-read each Comet's balances and getPrice at block ${blockOf(row)}` },
    }),
  },
  morpho: {
    session: "morpho-arbitrum",
    receipt: (what, row) => ({
      kind: "chain-derived",
      pclass: "state",
      source: { block: blockOf(row) },
      contract: { name: "Morpho Blue (Arbitrum)", address: MORPHO_ARBITRUM_BLUE },
      via: `GET /api/chain/morpho-arbitrum/wallet at block ${blockOf(row)}, ${RECORDED}`,
      formula: "Σ market figure × loan token price",
      summary: `${what} in dollars — each held market's figure in its loan token, read from the singleton at block ${blockOf(row)}, times the loan token's price on the Aave V3 Arbitrum oracle at that block, summed over the markets that oracle prices.`,
      verify: { kind: "recompute", text: `Re-run Morpho.position and Morpho.market at block ${blockOf(row)}` },
    }),
  },
};

// ── Filters ──────────────────────────────────────────────────────────────────

interface ArbitrumPositionsFilters extends BaseListFilters {
  /** Debt range in USD, one encodeRange value or [] for no bound. */
  debt: string[];
  /** Collateral-plus-supply range in USD, as `debt`; read from the old
   *  `size` bracket too. */
  coll: string[];
}

const DEFAULTS: ArbitrumPositionsFilters = { q: "", sortBy: "activity", sortOrder: "desc", debt: [], coll: [] };

const SORTS: SortOption[] = [
  { value: "activity", label: "Last activity" },
  { value: "visited", label: "Last opened" },
  { value: "collateral", label: "Collateral" },
  { value: "debt", label: "Debt" },
];

/** A card's dollar figures: its Comet's where it draws one, the wallet's
 *  totals otherwise. */
const collateralOf = (c: Card) => (c.comet ? c.comet.market.collateralUsd : c.row.totalCollateralUsd);
const debtOf = (c: Card) => (c.comet ? c.comet.market.borrowUsd : c.row.totalDebtUsd);
const supplyOf = (c: Card) => (c.comet ? c.comet.market.supplyUsd : c.row.totalSupplyUsd);

/** Collateral plus the lent side: what the card has in, in dollars; null
 *  when the row holds neither figure. */
const collateralRangeOf = (c: Card): number | null => {
  const coll = collateralOf(c);
  const supply = supplyOf(c);
  return coll == null && supply == null ? null : (coll ?? 0) + (supply ?? 0);
};

/** The Size panel's price line. */
const SIZE_NOTE = "At each protocol's own oracle at the row's read block.";

/** The Size panel over the cards: Debt, and Collateral as collateral plus
 *  supply. The old `?size=1000` bracket reads as `coll=1000-`. */
function dimensions(): ListDimension<ArbitrumPositionsFilters, Card>[] {
  const [debt, coll] = sizeDimensions<ArbitrumPositionsFilters>({
    getDebt: (f) => f.debt,
    setDebt: (f, d) => ({ ...f, debt: d }),
    getColl: (f) => f.coll,
    setColl: (f, c) => ({ ...f, coll: c }),
    panelNote: SIZE_NOTE,
  });
  return [
    { ...debt, matches: (c, v) => rangeAdmits(v, debtOf(c)) },
    {
      ...coll,
      aliases: ["size"],
      set: (f, v) =>
        coll.set(
          f,
          v.map((x) => (/^\d+$/.test(x) ? `${x}-` : x)),
        ),
      matches: (c, v) => rangeAdmits(v, collateralRangeOf(c)),
    },
  ];
}

const APPLY = {
  search: (c: Card, q: string) => c.row.wallet.includes(q),
  sort: {
    // Rows without a discovery block sort last; a wallet's Comet cards share
    // its block.
    activity: (c: Card) => c.row.lastActivityBlock ?? -1,
    visited: (c: Card) => c.row.lastVisitedAt ?? "",
    collateral: (c: Card) => collateralOf(c) ?? -1,
    debt: (c: Card) => debtOf(c) ?? -1,
  },
};

// ── The card ─────────────────────────────────────────────────────────────────

function UsdValue({ usd, info }: { usd: number; info: Provenance }) {
  return (
    <RevealTip tip={formatUsdValue(usd)}>
      <Prov info={info}>{formatCompactUsd(usd)}</Prov>
    </RevealTip>
  );
}

const assets = (n: number | undefined, verb: string) =>
  n != null && n > 0 ? `${n} ${n === 1 ? "asset" : "assets"} ${verb}` : undefined;

/** A dollar headline: the figure where the row holds one and the side is
 *  not empty, a dash otherwise. */
function usdHead(
  id: string,
  label: string,
  usd: number | null | undefined,
  count: number | undefined,
  verb: string,
  info: Provenance,
): PositionCardHead {
  const held = (count ?? 0) > 0 || (usd ?? 0) > 0;
  return {
    id,
    label,
    value: held && usd != null ? <UsdValue usd={usd} info={info} /> : null,
    sub: assets(count, verb),
  };
}

function ReadLine({ row }: { row: ArbitrumReadRow }) {
  if (row.blockNumber == null) return null;
  const at = row.refreshedAt ? Math.floor(Date.parse(row.refreshedAt) / 1000) : null;
  return (
    <span className="text-xs text-rb-500" data-prov-exempt="" data-read-block={row.blockNumber}>
      Read at block {row.blockNumber.toLocaleString("en-US")}
      {at != null && <MountedAge from={at} short prefix=" · " suffix=" ago" />}
    </span>
  );
}

/** The receipt for one Comet's stored dollar figure. */
function cometReceipt(what: string, row: ArbitrumReadRow, c: CometCard): Provenance {
  const block = blockOf(row);
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block },
    contract: { name: `Compound V3 ${c.label} Comet (Arbitrum)`, address: c.market.comet },
    via: `${c.label} Comet.userBasic / collateralBalanceOf(${row.wallet}) at block ${block}, ${RECORDED}`,
    formula: "Comet figure × Comet getPrice",
    summary: `${what} in dollars in the ${c.label} Comet — read from it at block ${block} and priced at its getPrice${c.key === "weth" ? ", the ETH figure converted at the USDC Comet's WETH feed" : ""}.`,
    verify: {
      kind: "recompute",
      text: `Re-read userBasic, collateralBalanceOf and getPrice on ${c.market.comet} at block ${block}`,
    },
  };
}

/** One Comet of a wallet: its collateral, debt and lent base in dollars. */
function CometReadCard({ row, comet }: { row: ArbitrumReadRow; comet: CometCard }) {
  const session = FAMILIES["compound-v3"].session;
  const m = comet.market;
  const r = (what: string) => cometReceipt(what, row, comet);
  const posted = m.collateral.filter((c) => BigInt(c.amount) > BigInt(0)).length;
  const base = comet.baseSymbol ?? "Base";
  const baseHead = (id: string, label: string, raw: string, usd: number | null, verb: string, what: string) => {
    const held = BigInt(raw) > BigInt(0);
    return {
      id,
      label,
      value: held && usd != null ? <UsdValue usd={usd} info={r(what)} /> : null,
      sub: held ? `${base} ${verb}` : undefined,
    };
  };
  const heads: PositionCardHead[] = [
    usdHead("collateral", CARD_VOCAB.collateral, m.collateralUsd, posted, "posted", r("Collateral")),
    baseHead("debt", CARD_VOCAB.debt, m.baseBorrowed, m.borrowUsd, "borrowed", "Debt"),
    baseHead("supply", CARD_VOCAB.supply, m.baseSupplied, m.supplyUsd, "lent", "Supply"),
  ];
  const status: PositionCardStatus | null = m.isLiquidatable ? { word: "Liquidatable", tone: "caution" } : null;
  return (
    <div data-wallet-row={row.wallet} data-comet={m.comet}>
      <PositionCard
        slots={{
          surface: "listing",
          status,
          heads,
          identity: (
            <WalletPill wallet={row.wallet} ensName={null} filterProtocol={session} bookmarkProtocol={session} />
          ),
          counters: { extra: <ReadLine row={row} /> },
          menu: null,
          tag: <ListingTag market={comet.label} />,
        }}
      />
    </div>
  );
}

function ArbitrumReadCard({ row, family }: { row: ArbitrumReadRow; family: ArbitrumPositionsFamily }) {
  const cfg = FAMILIES[family];
  const r = (what: string) => cfg.receipt(what, row);
  const heads: PositionCardHead[] =
    family === "aave-v3"
      ? [
          usdHead(
            "collateral",
            CARD_VOCAB.collateral,
            row.totalCollateralUsd,
            row.supplyCount,
            "supplied",
            r("Collateral"),
          ),
          usdHead("debt", CARD_VOCAB.debt, row.totalDebtUsd, row.borrowCount, "borrowed", r("Debt")),
          {
            id: "health-factor",
            label: ratioLabel("pooled"),
            value:
              row.healthFactor == null ? (
                <span className="text-rb-400">No debt</span>
              ) : (
                <Prov info={r("Health factor")}>{hfLabelV3(row.healthFactor)}</Prov>
              ),
          },
        ]
      : [
          usdHead(
            "collateral",
            CARD_VOCAB.collateral,
            row.totalCollateralUsd,
            row.collateralCount,
            "posted",
            r("Collateral"),
          ),
          usdHead("debt", CARD_VOCAB.debt, row.totalDebtUsd, row.borrowCount, "borrowed", r("Debt")),
          usdHead("supply", CARD_VOCAB.supply, row.totalSupplyUsd, row.supplyCount, "lent", r("Supply")),
        ];
  // Every row is an open read, so the only state worth a word is the one the
  // health factor adds.
  const status: PositionCardStatus | null =
    row.healthFactor != null && row.healthFactor < 1 ? { word: "Liquidatable", tone: "caution" } : null;
  return (
    <div data-wallet-row={row.wallet}>
      <PositionCard
        slots={{
          surface: "listing",
          status,
          heads,
          identity: (
            <WalletPill
              wallet={row.wallet}
              ensName={null}
              filterProtocol={cfg.session}
              bookmarkProtocol={cfg.session}
            />
          ),
          counters: { extra: <ReadLine row={row} /> },
          menu: null,
        }}
      />
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export function ArbitrumPositionsListing({
  family,
  rows,
  recorded,
  census,
}: {
  family: ArbitrumPositionsFamily;
  /** The store's rows the chain read found open; the page drops the rest
   *  before they reach the client. */
  rows: ArbitrumReadRow[];
  /** Every wallet the store has recorded, the open ones included. */
  recorded: number;
  /** The server's census of open wallets on the protocol; absent or null
   *  until a complete one is read. */
  census?: CensusFigures | null;
}) {
  const cfg = FAMILIES[family];
  const entry = protocolForSession(cfg.session)!;
  const cards: Card[] =
    family === "compound-v3" ? expandCards(rows, COMPOUND_ARBITRUM_DEPLOYMENT.markets) : rows.map((row) => ({ row }));
  const fig = footerFigures(cards);
  const n = fig.cards;
  // The per-Comet words once any row carries its Comets.
  const perComet = family === "compound-v3" && rows.some((r) => r.markets);
  const checkedMs = census?.checkedAt ? Date.parse(census.checkedAt) : NaN;
  const checkedAt = Number.isFinite(checkedMs) ? Math.floor(checkedMs / 1000) : null;
  const footer: ReactNode = (
    <p
      className="mt-6 text-[11px] leading-relaxed text-rb-500"
      data-arbitrum-positions={n}
      data-arbitrum-wallets={fig.wallets}
      data-arbitrum-recorded={recorded}
      data-arbitrum-census-open={census?.open}
    >
      {perComet && census ? (
        <>
          {cometFooterLead(fig, census.open)}
          {checkedAt != null ? <MountedAge from={checkedAt} short prefix=" " suffix=" ago" /> : null}. From each
          day&rsquo;s most active wallets since 20 Oct 2026 and any wallet a reader opened.
        </>
      ) : perComet ? (
        <>
          {cometFooterLead(fig, null)}, from each day&rsquo;s most active wallets since 20 Oct 2026 and any wallet a
          reader opened.
        </>
      ) : census ? (
        <>
          Indexed {n.toLocaleString("en-US")} of {census.open.toLocaleString("en-US")} open positions, counted on the
          chain
          {checkedAt != null ? <MountedAge from={checkedAt} short prefix=" " suffix=" ago" /> : null}. From each
          day&rsquo;s most active wallets since 20 Oct 2026 and any wallet a reader opened.
        </>
      ) : (
        <>
          Indexed {n.toLocaleString("en-US")} {n === 1 ? "position" : "positions"}, from each day&rsquo;s most active
          wallets since 20 Oct 2026 and any wallet a reader opened.
        </>
      )}
    </p>
  );
  return (
    <>
      <ChainTruthListingPage<Card, ArbitrumPositionsFilters>
        title={`${entry.label} positions read`}
        noun="positions"
        basePath={`${entry.href}/positions`}
        bookmarksProtocol={cfg.session}
        defaults={DEFAULTS}
        sortOptions={SORTS}
        searchPlaceholder="Search wallet address"
        // The roster resolves an explorer's own route only, so the rail header
        // comes in as the identity, and the title goes sr-only beneath it.
        identity={<RailHeader session={cfg.session} venue="listing" stamp />}
        titleHidden
        renderCard={(c) =>
          c.comet ? <CometReadCard row={c.row} comet={c.comet} /> : <ArbitrumReadCard row={c.row} family={family} />
        }
        hrefFor={(c) =>
          c.comet?.key ? compoundArbitrumMarketHref(c.comet.key, c.row.wallet) : `${entry.href}/${c.row.wallet}`
        }
        keyFor={(c) => (c.comet ? `${c.row.wallet}:${c.comet.market.comet}` : c.row.wallet)}
        strategy={memoryStrategy<Card, ArbitrumPositionsFilters>({
          // The server page reads the store; the rows arrive with the render.
          fetchAll: async () => cards,
          dimensions,
          apply: APPLY,
        })}
        initialItems={cards}
      />
      {footer}
    </>
  );
}

"use client";

// The positions page of a position-first Arbitrum explorer (rails-ops
// TO-DO-arbitrum-scoping.md item 18): the wallets rails-server has recorded a
// position read for, in the standard listing (ChainTruthListingPage, the
// memory tier over the route's rows). The store keeps every wallet a reader
// opened, and a wallet that held nothing at its read is not a position: the
// server page passes the rows the chain read found open, and the footer says so.
//
// A row is one wallet's stored read: dollar totals and asset counts at one
// block, and no per-asset list. The family cards build their headlines from
// those lists (Aave's reserves, a Comet's base and collateral, a Morpho
// market's legs) and the Compound and Morpho cards describe one market each,
// so the row feeds the shared PositionCard they draw through: wallet,
// status, the totals as headlines, and the read's block at the foot.

import type { ReactNode } from "react";
import { ChainTruthListingPage, memoryStrategy } from "@/components/shared/chain-truth-listing-page";
import { PositionCard, type PositionCardHead, type PositionCardStatus } from "@/components/shared/position-card";
import { WalletPill } from "@/components/shared/wallet-pill";
import { RailHeader } from "@/components/shared/rail-header";
import { RevealTip } from "@/components/shared/reveal-tip";
import { MountedAge } from "@/components/shared/mounted-age";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { joinOptionLabels } from "@/components/shared/filter-bar/types";
import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import type { BaseListFilters, ListDimension } from "@/lib/shared/list-filter";
import { protocolForSession } from "@/lib/shared/protocols";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { formatCompactUsd } from "@/lib/shared/format-compact";
import { formatUsdValue } from "@/lib/utils/format";
import { hfLabelV3 } from "@/lib/aave-v3/position-state";
import { AAVE_V3_ARBITRUM_POOL } from "@/lib/aave-v3-arbitrum/asset-catalog";
import { MORPHO_ARBITRUM_BLUE } from "@/lib/morpho-arbitrum/asset-catalog";

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
}

export type ArbitrumPositionsFamily = "aave-v3" | "compound-v3" | "morpho";

interface FamilyConfig {
  session: SessionProtocol;
  /** Where the footer says the reads were taken. */
  where: string;
  /** The receipt for a stored dollar total, or the health factor. */
  receipt: (what: string, row: ArbitrumReadRow) => Provenance;
}

const blockOf = (row: ArbitrumReadRow) => row.blockNumber ?? "unknown";
const RECORDED = "recorded by rails-server when the wallet's page was opened";

const FAMILIES: Record<ArbitrumPositionsFamily, FamilyConfig> = {
  "aave-v3": {
    session: "aave-v3-arbitrum",
    where: "on this Pool",
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
    where: "in these four Comets",
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
    where: "on this singleton",
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
  /** A whole-dollar lower bound on collateral plus supply. */
  size?: string;
}

const DEFAULTS: ArbitrumPositionsFilters = { q: "", sortBy: "visited", sortOrder: "desc" };

const SORTS: SortOption[] = [
  { value: "visited", label: "Last opened" },
  { value: "collateral", label: "Collateral" },
  { value: "debt", label: "Debt" },
];

/** Collateral plus the lent side: what the wallet has in, in dollars. */
const sizeOf = (r: ArbitrumReadRow) => (r.totalCollateralUsd ?? 0) + (r.totalSupplyUsd ?? 0);

const SIZE_BRACKETS = [1000, 10000, 100000] as const;
const SIZE_OPTIONS: FilterOptionDef[] = SIZE_BRACKETS.map((b) => ({
  value: String(b),
  label: `$${b.toLocaleString("en-US")} or more`,
}));
function dimensions(): ListDimension<ArbitrumPositionsFilters, ArbitrumReadRow>[] {
  return [
    {
      id: "size",
      label: "Size",
      group: "Size",
      cardinality: "single",
      param: "size",
      options: SIZE_OPTIONS,
      get: (f) => (f.size ? [f.size] : []),
      set: (f, v) => ({ ...f, size: v[0] || undefined }),
      chipLabel: (vals, opts) => `Size: ${joinOptionLabels(vals, opts)}`,
      matches: (r, v) => sizeOf(r) >= Number(v[0]),
    },
  ];
}

const APPLY = {
  search: (r: ArbitrumReadRow, q: string) => r.wallet.includes(q),
  sort: {
    visited: (r: ArbitrumReadRow) => r.lastVisitedAt ?? "",
    collateral: (r: ArbitrumReadRow) => r.totalCollateralUsd ?? -1,
    debt: (r: ArbitrumReadRow) => r.totalDebtUsd ?? -1,
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
}: {
  family: ArbitrumPositionsFamily;
  /** The store's rows the chain read found open; the page drops the rest
   *  before they reach the client. */
  rows: ArbitrumReadRow[];
  /** Every wallet the store has recorded, the open ones included. */
  recorded: number;
}) {
  const cfg = FAMILIES[family];
  const entry = protocolForSession(cfg.session)!;
  const footer: ReactNode = (
    <p
      className="mt-6 text-[11px] leading-relaxed text-rb-500"
      data-arbitrum-positions={rows.length}
      data-arbitrum-recorded={recorded}
    >
      <span className="text-foreground">Indexed positions.</span> Rails reads a wallet {cfg.where} when its page is
      opened and keeps the read. {recorded.toLocaleString("en-US")} {recorded === 1 ? "wallet" : "wallets"} recorded so
      far; the ones holding nothing at their read are not listed.
    </p>
  );
  return (
    <>
      <ChainTruthListingPage<ArbitrumReadRow, ArbitrumPositionsFilters>
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
        renderCard={(row) => <ArbitrumReadCard row={row} family={family} />}
        hrefFor={(row) => `${entry.href}/${row.wallet}`}
        keyFor={(row) => row.wallet}
        strategy={memoryStrategy<ArbitrumReadRow, ArbitrumPositionsFilters>({
          // The server page reads the store; the rows arrive with the render.
          fetchAll: async () => rows,
          dimensions,
          apply: APPLY,
        })}
        initialItems={rows}
      />
      {footer}
    </>
  );
}

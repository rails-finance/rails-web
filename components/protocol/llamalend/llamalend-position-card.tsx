"use client";

// LlamaLend position card: one (controller, user) pair, as a slot builder for
// the shared position card (components/shared/position-card.tsx; rails-ops
// TO-DO-position-card 322).
//
// THE GRAIN IS THE PAIR: the card is one position in one isolated market,
// never a user — controllers liquidate independently, and one card per user
// would assert a single health across markets that share nothing. The
// identity slot carries the user AND the market (collateral / borrowed pair,
// version-tagged), because both halves are the key.
//
// ⇒ SOFT-LIQUIDATION LEADS. When the live overlay says the AMM has already
// converted part of this position's collateral (user_state.stablecoin > 0 —
// a state-only figure no event carries), the status tag says so and the
// panel's Converted row states the amount, traced to the two-contract
// cross-check. No risk color on the figures — the numbers carry the meaning.
//
// ⇒ LIQUIDATABLE OUTRANKS IT. When health(user, true) reads below 0, anyone
// may liquidate the position now, whatever the AMM has converted: the panel's
// Liquidatable row says so in CRITICAL red (color-grammar.md: the line is the
// protocol's, so the colour is a claim of fact), and a listing row, which has
// no panel, says it in its pill.
//
// ⚠️ USD only where the borrowed token IS crvUSD (~$1): debt is already in
// crvUSD, collateral through the AMM's own price_oracle. The handful of
// markets that borrow WETH / tBTC / ynETH / CRV render in their own tokens —
// the token amount IS the headline there, and no dollar is asserted.
//
// STATUS IS TWO-AXIS. The tag says Closed or Liquidated, where 'liquidated'
// names only a CLOSED position; an OPEN survivor stays an OPEN card with the
// counters' count.

import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardOutcome,
  type PositionCardSlots,
  type PositionCardStatus,
} from "@/components/shared/position-card";
import { StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { formatUsd } from "@/lib/shared/format-event";
import { positionStateProv, positionIndexProv, llamalendUsdProv } from "@/lib/llamalend/event-provenance";
import { llamalendPositionContent } from "@/lib/llamalend/position-content";
import { type LlamalendFactoryKind, type LlamalendVersion } from "@/lib/llamalend/asset-catalog";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import type { LlamalendPositionSummary } from "@/lib/sources/api/llamalend-positions";
import type { LlamalendChainResponse } from "@/lib/api/fetch-llamalend-position";
import { LlamalendMenuRows } from "@/components/protocol/llamalend/llamalend-menu-rows";
import {
  LlamalendHealth,
  llamalendHasRisk,
  llamalendHealthSub,
  llamalendRiskRows,
} from "@/components/protocol/llamalend/llamalend-risk-slot";

export interface LlamalendPositionView {
  /** The isolated market's key. */
  controller: string;
  user: string;
  amm: string | null;
  version: LlamalendVersion;
  /** Which factory made the market: a mint market or a lend market (V1), or V2. */
  factory?: LlamalendFactoryKind | null;
  /** "wstETH / crvUSD" — display; the controller address is the key. */
  marketLabel: string;
  collateralSymbol: string;
  collateralDecimals: number;
  borrowedSymbol: string;
  borrowedDecimals: number;
  borrowedIsCrvusd: boolean;
  status: "open" | "closed" | "liquidated";
  /** The orthogonal hard-liquidation flag — true on open survivors too. */
  everLiquidated: boolean;
  liquidationCount: number;
  /** Collateral still held as collateral (collateral-token units).
   *  ⚠️ NULL = the chain did not state it (the deployed controller's
   *  sentinel path, NULLed backend-side) — rendered "unstated", never 0. */
  collateral: number | null;
  collateralRaw: string | null;
  /** Debt (borrowed-token units). */
  debt: number;
  debtRaw: string;
  /** "chain" = live user_state at head; "index" = last emitted absolute. */
  stateBasis: "chain" | "index";
  /** Converted amount (borrowed units) — soft-liq NOW. Null = unknown (the
   *  overlay didn't land), never zero. */
  converted: number | null;
  convertedRaw: string | null;
  inSoftLiq: boolean | null;
  /** Controller.health(user, true) at head (fraction) and its raw 1e18; null
   *  when the read did not land. */
  healthFull?: number | null;
  healthFullRaw?: string | null;
  /** health(user, true) below 0 on a live loan: anyone may liquidate it now.
   *  Null or absent = unknown. */
  liquidatable?: boolean | null;
  /** Whether the AMM's own statement of `converted` matched the Controller's at
   *  this read. Travels on the LIVE overlay only — the listing summary row
   *  carries no such field, so it is absent there and the converted receipt
   *  (inert without a receipts scope anyway) says the second answer didn't
   *  land. */
  convertedCrossCheckExact?: boolean | null;
  /** AMM.price_oracle at head — borrowed per collateral. */
  priceOracle: number | null;
  collateralUsd: number | null;
  debtUsd: number | null;
  eventCount: number;
  txCount: number;
  lastActivityAt: number;
}

const stateProv = (v: LlamalendPositionView, sym: string, which: "collateral" | "debt") =>
  v.stateBasis === "chain" ? positionStateProv(sym, which, v.controller) : positionIndexProv(sym, which, v.controller);

/** The kind of market beside the pair: mint (crvUSD minted against the loan)
 *  or lend (borrowed from lenders' deposits); a V2 market says V2. */
const MARKET_KIND: Partial<Record<LlamalendFactoryKind, string>> = { crvusd: "mint market", oneway: "lend market" };

/** The position + market identity: whose position, in which isolated market.
 *  The detail page draws the owner on the wallet row above the card
 *  (ui-jobs 228). */
function PositionIdentity({ v, wallet = true }: { v: LlamalendPositionView; wallet?: boolean }) {
  const kind = v.factory ? MARKET_KIND[v.factory] : undefined;
  return (
    <span className="flex items-center gap-2">
      {wallet && <WalletPill wallet={v.user} ensName={null} filterProtocol="llamalend" bookmarkProtocol="llamalend" />}
      <span className="text-xs text-rb-500">
        {v.marketLabel}
        {kind && <span data-llamalend-market-kind=""> · {kind}</span>}
        {v.version === "v2" && <span data-llamalend-market-kind=""> · V2 market</span>}
      </span>
    </span>
  );
}

export interface LlamalendPositionCardProps {
  v: LlamalendPositionView;
  /** `detail` on the position page (receipts, panel, (i)); `listing` in a row. */
  surface: "detail" | "listing";
  /** The page's live chain read. Its health is the third headline; its
   *  converted amount, soft-liquidation multiple and band figures are panel
   *  rows. */
  chain?: LlamalendChainResponse | null;
  /** The chain read is still in flight: the health waits behind a pulsing bar. */
  chainPending?: boolean;
  /** Collateral lost to soft-liquidation over the position's life, where it can
   *  be stated (llamalendLostToSoftLiq): a panel row. */
  lost?: number | null;
  /** Collateral the AMM has sold net of buy-backs, on a position in its bands
   *  now (llamalendSoldInBands): a panel row. */
  sold?: number | null;
  /** The card's Explanation section (narration describing the position NOW). */
  explanation?: React.ReactNode;
  /** The pane's copy-this-view link: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** A line that stays in the card's foot: the loans line on a position with
   *  more than one loan, the owner's outcome on a liquidated one. */
  foot?: React.ReactNode;
  /** The ⋮'s export shapes. `null`: the ⋮ holds the position's rows and the
   *  provenance row alone. */
  exports?: PositionCardExports | null;
}

/** The USD line beneath a figure: the oracle-priced dollars where the borrowed
 *  token is crvUSD. `null` keeps the line's height while the oracle price is
 *  unread; absent where the market borrows another token and no dollar is
 *  asserted. */
function usdLine(
  v: LlamalendPositionView,
  usd: number | null,
  what: "Collateral" | "Borrowed",
): React.ReactNode | null | undefined {
  if (usd == null) return v.borrowedIsCrvusd ? null : undefined;
  return (
    <Prov info={llamalendUsdProv(what, v.borrowedSymbol, v.amm ?? undefined)}>
      <span
        className="font-bold text-green-400"
        title={"$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      >
        {formatUsd(usd)}
      </span>
    </Prov>
  );
}

/** The LlamaLend position's slots for the shared position card: the heads, the
 *  panel, the tag, the ⋮ and the counters, from the position's view and the
 *  page's live read. */
export function useLlamalendCardSlots({
  v,
  surface,
  chain,
  chainPending = false,
  lost,
  sold,
  explanation,
  viewHref,
  foot,
  exports,
}: LlamalendPositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const open = v.status === "open";

  // What the position is doing NOW, neutral unless anyone may liquidate it. A
  // detail card names Liquidatable in its panel; a listing row has none, so its
  // pill says it.
  const liquidatable = open && v.liquidatable === true && v.healthFull != null;
  const status: PositionCardStatus | null =
    v.status === "liquidated"
      ? { word: "Liquidated", tone: "danger" }
      : v.status === "closed"
        ? { word: "Closed", tone: "muted" }
        : !detail && liquidatable
          ? { word: "Liquidatable", tone: "danger" }
          : v.inSoftLiq
            ? { word: "In soft-liquidation", tone: "caution" }
            : null;
  const counters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    liquidationCount: v.liquidationCount,
    ...(detail ? { order: "age-last" as const } : {}),
  };
  const common = { status, identity: <PositionIdentity v={v} wallet={!detail} />, counters };

  // Closed / liquidated: the last emitted absolutes are back at zero, so the
  // card states the outcome (no USD: the oracle prices the PRESENT, not
  // history). The LIQUIDATED outcome appears only here: an open survivor never
  // reaches this branch.
  let heads: PositionCardHead[];
  let outcome: PositionCardOutcome | undefined;
  if (!open) {
    // The values are the LAST emitted absolutes (usually zero on an unwound
    // position) — never claim the shared default "Highest recorded": the API
    // carries no peak figures. A closed loan holds nothing: the Controller
    // withdraws the collateral when the debt reaches 0, so an unstated
    // collateral here is 0.
    heads = [
      {
        id: "final-collateral",
        label: CARD_VOCAB.finalCollateral,
        value: (
          <AssetAmount
            value={v.collateral ?? 0}
            symbol={v.collateralSymbol}
            exact={v.collateralRaw != null ? formatUnitsExact(v.collateralRaw, v.collateralDecimals) : "0"}
          />
        ),
      },
      {
        id: "final-debt",
        label: CARD_VOCAB.finalDebt,
        value: (
          <AssetAmount
            value={v.debt}
            symbol={v.borrowedSymbol}
            exact={formatUnitsExact(v.debtRaw, v.borrowedDecimals)}
          />
        ),
      },
    ];
    outcome = {
      word: v.status === "liquidated" ? "Liquidated" : "Closed",
      dates: v.lastActivityAt ? [{ at: v.lastActivityAt }] : undefined,
    };
  } else {
    const hasColl = v.collateral != null && v.collateral > 0;
    heads = [
      {
        id: "collateral",
        label: CARD_VOCAB.collateral,
        value: hasColl ? (
          <Prov info={stateProv(v, v.collateralSymbol, "collateral")}>
            <AssetAmount
              value={v.collateral!}
              symbol={v.collateralSymbol}
              exact={v.collateralRaw != null ? formatUnitsExact(v.collateralRaw, v.collateralDecimals) : undefined}
            />
          </Prov>
        ) : v.collateral == null ? (
          // ⚠️ The chain did not state this figure (the deployed controller's
          // sentinel path) — unstated, never zero. The live read repairs it.
          <span
            className="text-xs text-rb-500"
            title="The last emitted UserState carried the controller's 2^256−1 sentinel here — the chain did not state the figure; the live read on the position page carries the current one."
          >
            unstated
          </span>
        ) : v.converted != null && v.converted > 0 ? (
          // Everything is converted — the band is fully crossed; the panel's
          // Converted row carries the whole holding.
          <span className="text-xs text-rb-500">fully converted</span>
        ) : null,
        usd: hasColl ? usdLine(v, v.collateralUsd, "Collateral") : undefined,
      },
      {
        id: "debt",
        label: CARD_VOCAB.debt,
        value:
          v.debt > 0 ? (
            <Prov info={stateProv(v, v.borrowedSymbol, "debt")}>
              <AssetAmount
                value={v.debt}
                symbol={v.borrowedSymbol}
                exact={formatUnitsExact(v.debtRaw, v.borrowedDecimals)}
              />
            </Prov>
          ) : null,
        usd: v.debt > 0 ? usdLine(v, v.debtUsd, "Borrowed") : undefined,
      },
    ];
    // The health rides the detail page's live read; the listing carries none,
    // so a listing card has two headlines.
    if (detail) {
      heads.push({
        id: "health",
        label: "Health",
        labelTip:
          "The Controller's health for this position: what its bands would hold with the price through their bottom, less the liquidation discount, over the debt, minus 1. Below 0 anyone may liquidate it.",
        value: chain && llamalendHasRisk(chain) ? <LlamalendHealth chain={chain} /> : null,
        pending: chainPending && !chain,
        sub: chain ? llamalendHealthSub(chain) : undefined,
      });
    }
  }

  if (!detail) return { ...common, heads, surface: "listing", menu: null, outcome };

  const detailCommon = {
    ...common,
    heads,
    surface: "detail" as const,
    explainer: { body: explanation ?? null, viewHref },
    learnMore: llamalendPositionContent(
      open
        ? { status: v.status, inSoftLiq: v.inSoftLiq ?? undefined, bands: chain?.hasLoan ? chain.bands : null }
        : { status: v.status, liquidationCount: v.liquidationCount },
    ),
    menu: {
      leading: () => (
        <LlamalendMenuRows controller={v.controller} pagePath={`/ethereum/llamalend/${v.controller}/${v.user}`} />
      ),
      exports: exports ?? null,
    },
    foot: foot ? <div className="mt-3 border-t border-rb-300/40 pt-3 dark:border-rb-700/40">{foot}</div> : undefined,
  };
  if (outcome) return { ...detailCommon, outcome };
  return {
    ...detailCommon,
    outcome: undefined,
    panel: chain && open ? llamalendRiskRows(chain, { lost, sold }) : [[], []],
  };
}

/** The LlamaLend position card: its slots, drawn by the shared card. */
export function LlamalendPositionCard(props: LlamalendPositionCardProps) {
  return <PositionCard slots={useLlamalendCardSlots(props)} />;
}

/** Build a card view from the LIVE chain read alone — the degrade path while
 *  the index is unavailable (or hasn't caught this position yet): every
 *  figure is a head-block eth_call, so the card renders chain-state-first
 *  with empty history metadata (0 counts, no timestamp — the meta cluster
 *  simply omits them; nothing is fabricated). */
export function viewFromChain(
  c: import("@/lib/api/fetch-llamalend-position").LlamalendChainResponse,
): LlamalendPositionView {
  return {
    controller: c.controller,
    user: c.user,
    amm: c.amm || null,
    version: c.version,
    marketLabel: `${c.collateralSymbol} / ${c.borrowedSymbol}`,
    collateralSymbol: c.collateralSymbol,
    collateralDecimals: c.collateralDecimals,
    borrowedSymbol: c.borrowedSymbol,
    borrowedDecimals: c.borrowedDecimals,
    borrowedIsCrvusd: c.borrowedIsCrvusd,
    status: "open",
    everLiquidated: false,
    liquidationCount: 0,
    collateral: c.collateral ?? 0,
    collateralRaw: c.collateralRaw ?? "0",
    debt: c.debt ?? 0,
    debtRaw: c.debtRaw ?? "0",
    stateBasis: "chain",
    converted: c.converted,
    convertedRaw: c.convertedRaw,
    inSoftLiq: c.inSoftLiq,
    healthFull: c.healthFull,
    healthFullRaw: c.healthFullRaw,
    liquidatable: c.hasLoan && c.healthFull != null ? c.healthFull < 0 : null,
    convertedCrossCheckExact: c.convertedCrossCheckExact,
    priceOracle: c.priceOracle,
    collateralUsd:
      c.borrowedIsCrvusd && c.priceOracle != null && c.collateral != null ? c.collateral * c.priceOracle : null,
    debtUsd: c.borrowedIsCrvusd && c.debt != null ? c.debt : null,
    eventCount: 0,
    txCount: 0,
    lastActivityAt: 0,
  };
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: LlamalendPositionSummary): LlamalendPositionView {
  return {
    controller: s.controller,
    user: s.user,
    amm: s.amm,
    version: s.version,
    factory: s.factory ?? null,
    marketLabel: s.marketLabel,
    collateralSymbol: s.collateralSymbol,
    collateralDecimals: s.collateralDecimals,
    borrowedSymbol: s.borrowedSymbol,
    borrowedDecimals: s.borrowedDecimals,
    borrowedIsCrvusd: s.borrowedIsCrvusd,
    status: s.status,
    everLiquidated: s.everLiquidated,
    liquidationCount: s.liquidationCount,
    collateral: s.collateral,
    collateralRaw: s.collateralRaw,
    debt: s.debt,
    debtRaw: s.debtRaw,
    stateBasis: s.stateBasis,
    converted: s.converted,
    convertedRaw: s.convertedRaw,
    inSoftLiq: s.inSoftLiq,
    healthFull: s.healthFull,
    healthFullRaw: s.healthFullRaw,
    liquidatable: s.liquidatable,
    priceOracle: s.priceOracle,
    collateralUsd: s.collateralUsd,
    debtUsd: s.debtUsd,
    eventCount: s.eventCount,
    txCount: s.txCount,
    lastActivityAt: s.lastActivityAt,
  };
}

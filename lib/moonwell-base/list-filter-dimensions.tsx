// Moonwell Base listing filter registry — Ethereum's dimensions, with the asset
// facets rebuilt on a roster nobody wrote down.
// ----------------------------------------------------------------------------
// Status, position side, liquidation history and wallet search are the same
// questions asked of the same Comptroller model, so they are Ethereum's
// dimensions unchanged — including the resting-view rule, which lands here
// through them: the status dimension carries Ethereum's contextual default
// (lib/moonwell/listing-visibility.ts), so this directory rests on the open
// wallets and relaxes to every status on a wallet search, with no chip either
// way. Nothing in this file states the rule; it inherits it. The Supplying / Borrowing chips are not, and until
// 2026-08-30 this listing offered none at all: Ethereum's are populated from a
// four-market catalog, and this deployment deliberately writes no roster down
// (lib/moonwell-base/asset-catalog.ts) — twenty-one markets, governance still
// listing more.
//
// What changed is not that stance but the source. A roster no longer has to be
// written down to be offered: rails-server ships `marketState` beside every
// page of rows, and /api/moonwell-base/markets forwards it. So the options are
// the markets the Base sweep actually captured, at the block it read them —
// which is also the only set a facet MAY offer, since `supplyMarkets` /
// `borrowMarkets` filter over each row's captured per-market balances.
//
// Two properties of this deployment shape the facets:
//
//   • A chip's VALUE is the mToken address, never a symbol. Two Base markets
//     answer symbol() = "mUSDC" (the bridged and the native USDC), so only the
//     address identifies a market — which is also why the proxy passes these
//     facets straight down while Ethereum's maps symbols to market keys.
//   • The registry always returns every dimension, roster or no roster. The
//     codec must not depend on whether the roster landed, or a shared
//     `?supply=` URL would decode on one render and not the next.
//     encode/decode/listKey (lib/shared/list-filter.ts) read only
//     `param` / `get` / `set`, so options may legitimately differ between the
//     server render and the client's.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import {
  moonwellListDimensions,
  moonwellFiltersToFetchParams,
  MOONWELL_LIST_DEFAULTS,
  type MoonwellListFilters,
} from "@/lib/moonwell/list-filter-dimensions";
import type { FetchMoonwellPositionsParams } from "@/lib/api/fetch-moonwell-positions";
import type { MoonwellBaseRosterMarket, MoonwellBaseRosterState } from "@/lib/api/fetch-moonwell-base-markets";

// This lane's own constant, NOT Ethereum's MOONWELL_SORT_OPTIONS: the two
// backends page different tables (rails-server's /api/moonwell-base/positions
// sortBy against its own Base listing tables vs mig 181's
// debt_usd/collateral_usd on mv_moonwell_wallets for Ethereum), so sharing
// one constant would let this lane drift onto values its own backend cannot
// honor if Ethereum's list grows independently. Values match Liquity V2's
// URL grammar. app/api/moonwell-base/positions/route.ts allowlists debt/coll
// through, the same stance the Ethereum proxy and the Compound proxy take.
export const MOONWELL_BASE_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
];

export const MOONWELL_BASE_POSITIONS_ROUTE = "/api/moonwell-base/positions";

export const MOONWELL_BASE_LIST_DEFAULTS: MoonwellListFilters = {
  ...MOONWELL_LIST_DEFAULTS,
  supplying: [],
  borrowing: [],
};

/** An mToken address as a chip can show it, for a selection made before the
 *  roster landed. */
const shortMarket = (v: string): string =>
  v.startsWith("0x") && v.length === 42 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v;

/** Options standing in for a selection made before the roster landed (or made
 *  against a roster that never arrives). Without them an active chip would have
 *  no row to un-tick, which strands the reader with a filter they cannot clear. */
function selectionOptions(values: string[]): FilterOptionDef[] {
  return values.map((v) => ({ value: v, label: shortMarket(v) }));
}

/** One option per captured market, ordered by the label a reader scans for.
 *
 *  The labels are the UNDERLYING symbols, which are all distinct today (the
 *  bridged market's underlying is USDbC, the native one's USDC) — it is the
 *  mToken symbols that collide. The dedupe below therefore guards a market
 *  governance has not listed yet rather than one on the page now: should two
 *  markets ever share an underlying symbol, both labels take an address tail so
 *  neither chip is ambiguous. */
function marketOptions(markets: MoonwellBaseRosterMarket[]): FilterOptionDef[] {
  const seen = new Map<string, number>();
  for (const m of markets) seen.set(m.symbol, (seen.get(m.symbol) ?? 0) + 1);
  return [...markets]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((m) => ({
      value: m.market,
      label: (seen.get(m.symbol) ?? 0) > 1 ? `${m.symbol} ${shortMarket(m.market)}` : m.symbol,
      icon: <TokenChipIcon symbol={m.symbol} address={m.underlying} size={18} filterable={false} />,
    }));
}

/**
 * The registry as a function of the roster. Ethereum's status / position /
 * history dimensions come through untouched; the two asset dimensions are
 * replaced rather than filtered out, keeping Ethereum's `supply` / `borrow`
 * params and "Assets" group so both deployments share one URL grammar.
 */
export function moonwellBaseListDimensions(
  filters: MoonwellListFilters,
  state: MoonwellBaseRosterState | undefined,
): SerializableDimension<MoonwellListFilters>[] {
  const markets = state?.status === "ready" ? state.markets : null;
  const offered = markets != null && markets.length > 0;
  const options = offered ? marketOptions(markets) : null;

  return moonwellListDimensions().map((d) => {
    if (d.id !== "supplying" && d.id !== "borrowing") return d;
    const selected = d.get(filters);
    return {
      ...d,
      options: options ?? selectionOptions(selected),
      // Hide the facet while the roster is absent, unless a shared URL already
      // carries a selection — that one still needs a row to un-tick.
      available: (f: MoonwellListFilters) => offered || d.get(f).length > 0,
    };
  });
}

/** Map the decoded selection + page onto the fetch params. The asset facets
 *  pass through as the mToken addresses the chips carry: the Base proxy renames
 *  them to `supplyMarkets` / `borrowMarkets` and does no symbol mapping.
 *
 *  No prune hook accompanies this. An address the roster does not name still
 *  filters correctly — the backend matches on the address, not on membership of
 *  any list — so dropping it would break a valid shared URL rather than repair
 *  one. (Aave V4 prunes because its universe is scoped to the selected market;
 *  this one is the whole deployment.) */
export function moonwellBaseFiltersToFetchParams(
  filters: MoonwellListFilters,
  page: number,
): FetchMoonwellPositionsParams {
  return { ...moonwellFiltersToFetchParams(filters, page), route: MOONWELL_BASE_POSITIONS_ROUTE };
}

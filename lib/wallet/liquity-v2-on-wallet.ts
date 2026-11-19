// Liquity V2 on the wallet page (ui-jobs 738): the listing's pills, sort and
// read, with the wallet in place of the search. The listing's dimensions read
// their default from the search (a holder's search rests on every status), so
// each is handed the wallet as its query; the URL carries none. Shared by the
// page's first render and the client listing, so both derive one list key.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension } from "@/lib/shared/list-filter";
import {
  liquityV2FiltersToFetchParams,
  liquityV2ListDimensions,
  LIQUITY_V2_LIST_DEFAULTS,
  type LiquityV2ListFilters,
} from "@/lib/liquity-v2/list-filter-dimensions";
import type { FetchTrovesParams } from "@/lib/api/fetch-troves";
import { protocolDimension, type WalletPillFilters, type WalletProtocolCount } from "@/lib/wallet/wallet-filters";

export type WalletLiquityV2Filters = LiquityV2ListFilters & WalletPillFilters;

export const WALLET_LIQUITY_V2_DEFAULTS: WalletLiquityV2Filters = { ...LIQUITY_V2_LIST_DEFAULTS, kinds: [] };

/** A listing dimension that reads its selection as if the search named the wallet. */
function asWallet(
  d: SerializableDimension<LiquityV2ListFilters>,
  address: string,
): SerializableDimension<WalletLiquityV2Filters> {
  const named = (f: WalletLiquityV2Filters): WalletLiquityV2Filters => ({ ...f, q: address });
  const back = (next: LiquityV2ListFilters, f: WalletLiquityV2Filters): WalletLiquityV2Filters => ({
    ...f,
    ...next,
    q: f.q,
  });
  return {
    ...d,
    get: (f) => d.get(named(f)),
    set: (f, values) => back(d.set(named(f), values), f),
    defaultValues: d.defaultValues && ((f) => d.defaultValues!(named(f))),
    defaultChip: d.defaultChip && ((f) => d.defaultChip!(named(f))),
    clearDefault: d.clearDefault && ((f) => back(d.clearDefault!(named(f)), f)),
    pinned: d.pinned && ((f) => d.pinned!(named(f))),
    available: d.available && ((f) => d.available!(named(f))),
  };
}

/** The Protocol pill, then the listing's own pills. */
export function walletLiquityV2Dimensions(
  address: string,
  held: WalletProtocolCount[] = [],
  collateralOptions?: FilterOptionDef[],
): SerializableDimension<WalletLiquityV2Filters>[] {
  return [
    protocolDimension<WalletLiquityV2Filters>(held),
    ...liquityV2ListDimensions(collateralOptions).map((d) => asWallet(d, address)),
  ];
}

export const walletLiquityV2FetchParams = (
  address: string,
  filters: WalletLiquityV2Filters,
  page: number,
): FetchTrovesParams => liquityV2FiltersToFetchParams({ ...filters, q: address }, page);

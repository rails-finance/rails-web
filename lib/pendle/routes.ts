// The Pendle explorer's routes, from its roster entry.

import { explorerHref } from "@/lib/shared/protocols";

const ROOT = explorerHref(1, "pendle");

export const pendleMarketHref = (market: string) => `${ROOT}/markets/${market.toLowerCase()}`;
export const pendleWalletHref = (wallet: string) => `${ROOT}/${wallet.toLowerCase()}`;

// ============================================================================
// FETCH MOONWELL SHARE-RATE STEPS (Base and Ethereum)
// ============================================================================
//
// The market side of a Moonwell position page, on either deployment. One
// request per market the account supplied into, each answering that market's
// own exchange-rate STEPS — the places the rate moved further than the
// interest it could have accrued over the same seconds, with no Mint or
// Redeem in the market to explain it. Base proxies
// app/api/chain/moonwell-base/share-rate (rails-server's
// /api/moonwell-base/markets/:mtoken/share-rate?steps=1, keyed by mToken
// address); Ethereum proxies app/api/chain/moonwell/share-rate (rails-server's
// /api/moonwell/markets/:key/share-rate?steps=1, keyed by the short market key
// — 'weth' | 'usdc' | 'usdt' | 'cbbtc').
//
// Nothing here decides what renders. The steps are the MARKET's; which of them
// this position was actually holding across, and what its own slice was worth
// at each end, is `shareRateNotesFor` in lib/shared/market-note.ts — pure, and
// verified on its own. So this module fetches and stops, and the page keeps the
// responses rather than the notes: a reader who loads more of their history
// re-reduces the same steps against the deeper event list without a second
// request.
//
// It FAILS OPEN. A market that errors, a response that is not JSON, a box that
// is slow — each contributes nothing, and `loadMoonwellShareRates` never
// rejects. A note states a receipted fact or it does not exist, so "the market
// could not be read" has nothing to render and no placeholder to render it in.

import type { ShareRateStep } from "@/lib/shared/market-note";

/** The route's answer. `decimals` is null for an address that is not one of
 *  the Comptroller's markets — the endpoint answers 200 with an empty step
 *  list rather than 404, so a caller never has to treat "not a market" as a
 *  failure. */
export interface MoonwellShareRateResponse {
  /** Base: the mToken address, lowercased. Ethereum: the short market key
   *  ('weth' | 'usdc' | 'usdt' | 'cbbtc'). */
  market: string;
  /** The mToken address — present on Ethereum (Base already keys `market` by
   *  it), so a caller can key by either. */
  mtoken?: string;
  symbol?: string | null;
  mSymbol?: string | null;
  decimals: number | null;
  steps: ShareRateStep[];
}

/** How long a page will hold its timeline waiting for the notes, in total and
 *  across every market. The endpoint is edge-cached for ten minutes per
 *  market, so a warm read is a few milliseconds and this budget only ever
 *  binds on a cold one — at which point the reader gets the events alone and
 *  the note is simply absent, which is the correct rendering of "not read". */
export const MARKET_NOTE_BUDGET_MS = 2_000;

/** Which Moonwell deployment a request is for — selects the proxy route.
 *  Defaults to Base so every existing call site is unchanged. */
export type MoonwellShareRateDeployment = "moonwell" | "moonwell-base";

const ROUTE_BY_DEPLOYMENT: Record<MoonwellShareRateDeployment, string> = {
  moonwell: "/api/chain/moonwell/share-rate",
  "moonwell-base": "/api/chain/moonwell-base/share-rate",
};

export interface FetchMoonwellShareRateParams {
  /** Base: mToken address (also the market key an event carries in
   *  `context.data.market` — lib/sources/chain/moonwell-roster.ts: two Base
   *  markets both answer symbol() = "mUSDC", so the address IS the key).
   *  Ethereum: the short market key ('weth' | 'usdc' | 'usdt' | 'cbbtc'). */
  market: string;
  deployment?: MoonwellShareRateDeployment;
  baseUrl?: string;
  signal?: AbortSignal;
}

export async function fetchMoonwellShareRateSteps(p: FetchMoonwellShareRateParams): Promise<MoonwellShareRateResponse> {
  const qs = new URLSearchParams({ market: p.market });
  const route = ROUTE_BY_DEPLOYMENT[p.deployment ?? "moonwell-base"];
  const url = `${p.baseUrl ?? ""}${route}?${qs.toString()}`;
  const res = await fetch(url, { signal: p.signal });
  if (!res.ok) throw new Error(`fetchMoonwellShareRateSteps failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as MoonwellShareRateResponse;
}

export interface LoadMoonwellShareRatesParams {
  /** Base: mToken addresses. Ethereum: the short market keys. Whichever this
   *  account ever supplied into. */
  markets: readonly string[];
  deployment?: MoonwellShareRateDeployment;
  baseUrl?: string;
  budgetMs?: number;
}

/**
 * Every market's steps, asked for at once and answered within `budgetMs`
 * whatever happens: whatever has landed by then is returned and the rest are
 * abandoned, so one slow market costs only its own note. Never rejects.
 */
export async function loadMoonwellShareRates(p: LoadMoonwellShareRatesParams): Promise<MoonwellShareRateResponse[]> {
  if (p.markets.length === 0) return [];
  const budget = p.budgetMs ?? MARKET_NOTE_BUDGET_MS;
  const landed: MoonwellShareRateResponse[] = [];
  const controller = new AbortController();
  const all = Promise.allSettled(
    p.markets.map(async (market) => {
      const res = await fetchMoonwellShareRateSteps({
        market,
        deployment: p.deployment,
        baseUrl: p.baseUrl,
        signal: controller.signal,
      });
      if (Array.isArray(res?.steps) && res.steps.length > 0) landed.push(res);
    }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, budget);
  });
  await Promise.race([all, expiry]);
  if (timer) clearTimeout(timer);
  // A no-op once every request has settled; on expiry it releases the ones
  // still in flight, whose rejections `allSettled` already absorbs.
  controller.abort();
  return landed;
}

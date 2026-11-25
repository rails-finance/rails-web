// The explorers the home count is drawn from, and the chains it names. No
// secrets here, so the scope phrase (components/home/covered-stats.tsx) reads
// the same set the loader (covered-positions-data.ts, server-only) sums over.

import { CHAINS } from "@/lib/shared/chains";
import { launchedProductionChains, LAUNCHED_PROTOCOLS } from "@/lib/shared/protocols";

/**
 * Explorers whose subject is not a position, and so cannot join a position count.
 *
 * Currently EMPTY — Compound V2, the machinery's first occupant, left when its
 * position explorer landed (2026-07-16; the exclusion was always "no position
 * roster exists to count YET", never "this subject has no positions"). The set
 * stays because the concept is real: an explorer listed here is exempt from the
 * LISTING_ENDPOINT / CENSUS_ENDPOINT requirement below and contributes nothing to the headline,
 * keeping the headline a claim about positions, which is what it says it is.
 *
 * ⚠️ If a future entry lands here alongside a LISTING_ENDPOINT for the same id,
 * the exclusion wins and silences `assertRosterCovered()` — the headline would
 * quietly drop a whole explorer and still render a confident number. Remove the
 * exclusion in the SAME change that adds the endpoint; removing it first is the
 * safe failure (the guard trips and the figure disappears, loudly).
 */
export const NOT_POSITION_EXPLORERS = new Set<string>([
  // Aave's vault layer. Not "no listing yet" but the other kind: a holder's
  // share in a vault carries no debt and no threshold to breach, so it is not a
  // position in the sense the headline counts (rails-ops decisions 0014 and
  // 0027 call 2). It has no LISTING_ENDPOINT and must never gain one.
  "aave-vaults",
  // Yearn V3, here for the same reason and permanently: its whole product is
  // vaults, so every one of its rows would be a share rather than a position.
  "yearn",
  // CoW: trades, not positions (ui-jobs 489); it has no listing or census to
  // count, and the headline counts positions.
  "cow",
  // Pendle: a wallet's PT, YT and LP per market, read when the wallet is
  // visited; no census of holders, and nothing in a market is a loan.
  "pendle",
  // Uniswap V3 and V4: a wallet's liquidity positions are read when the wallet
  // is visited; no census of holders is built, and nothing in a pool is a loan.
  "uniswap-v3",
  "uniswap-v4",
  // Aerodrome Slipstream, for the Uniswap reason (ui-jobs 566), and Velodrome
  // on Optimism (ui-jobs 578).
  "aerodrome",
  "velodrome",
  // Uniswap on Base and Arbitrum and PancakeSwap V3, for the same reason
  // (ui-jobs 568, 573, 575).
  "uniswap-v3-base",
  "uniswap-v3-arbitrum",
  "uniswap-v4-arbitrum",
  "uniswap-v3-optimism",
  "uniswap-v4-optimism",
  "pancakeswap-v3-base",
  "pancakeswap-v3-arbitrum",
  "uniswap-v3-arc",
  "uniswap-v4-arc",
  // Compound V3 on Optimism: no census of accounts (ui-jobs 578).
  "compound-v3-optimism",
  // Lido (ui-jobs 570): a stake carries no debt and no threshold.
  "lido",
  // Fluid on Base, read on visit: no census of positions (ui-jobs 574).
  "fluid-base",
  // Morpho Blue on Arc: no census of positions (ui-jobs 577).
  "morpho-arc",
  // Morpho Blue on Optimism: no census of positions (ui-jobs 578).
  "morpho-optimism",
  // Aave V4 on Arc: no census of accounts (ui-jobs 577).
  "aave-v4-arc",
  // Aave V3 on Optimism: no census of accounts (ui-jobs 578).
  "aave-v3-optimism",
  // Euler V2 on Base and Arbitrum: a wallet's accounts are read when it is
  // visited, and no census of holders is built.
  "euler-v2-base",
  "euler-v2-arbitrum",
  // Balancer V3 (ui-jobs 569): its index counts the pool shares held now
  // (lib/api/fetch-index.ts, on the front door), and the headline counts every
  // position ever held, so it stays out until the index states that figure.
  "balancer-v3",
  "balancer-v3-arbitrum",
  // Sky Savings, for the same reason: an sUSDS balance carries no debt and no
  // threshold (Miles, 2026-09-29, rails-ops TO-DO-sky-savings-scoping §6.1).
  // It has a listing all the same; this set keeps it out of the count.
  "sky-savings",
  // Otherwise empty since 2026-08-26. The three Arbitrum explorers sat here
  // until their census landed and left in the change that added their
  // CENSUS_ENDPOINT. The five Base explorers (Aave V3 Base,
  // Moonwell Base, Morpho Blue Base, Compound V3 Base, Seamless) sat here from
  // 2026-08-23 for the same reason Compound V2 once did — they had positions
  // to show but no listing to count them from, Base's history not being
  // indexed. The Sieve indexer indexes it now and each has a listing, so each
  // left in the change that added its LISTING_ENDPOINT. Whether a Base
  // listing's history is COMPLETE is a different question, and it is answered
  // per hour by the listing itself (`coverage.historyComplete` → the `pending`
  // state in fetchRosterCount), not by a name in this set.
]);

/** The explorers whose rosters the count is drawn from.
 *
 *  Three cuts, on three different axes:
 *
 *  - Launch. The figure sits on the home page above a strip of tiles a reader
 *    can open, so it counts the explorers that strip offers. An explorer
 *    flagged `unlaunched` on the roster serves at its URL and is linked from
 *    nowhere, so counting its positions would be a number about pages the site
 *    does not show — hence `LAUNCHED_PROTOCOLS` rather than `PROTOCOLS`, and
 *    hence the scope phrase beside the figure is drawn from the same set
 *    (components/home/covered-stats.tsx).
 *
 *  - Chain. The headline is a claim about real money on production chains. An
 *    explorer on a testnet chain (`CHAINS[chainId].testnet`, Polaris on Sepolia)
 *    is left out here regardless of its id: its numbers are test numbers, not
 *    a position in that claim, and the rule reads off the chain axis so the
 *    next testnet explorer needs no change here either.
 *  - Explorer. What is excluded beyond that is the explorers that have no
 *    roster to count (`NOT_POSITION_EXPLORERS`), which is decision 0014's
 *    rule: the headline names what the reader can actually reach. An explorer
 *    whose listing or census exists but whose history is still incomplete is
 *    asked, and answers "not yet" — see fetchRosterCount and census-leg.ts.
 */
export const COUNTED_PROTOCOLS = LAUNCHED_PROTOCOLS.filter(
  (p) => !CHAINS[p.chainId].testnet && !NOT_POSITION_EXPLORERS.has(p.id),
);

/** The chains the count is drawn from, as the copy names them: the launched production chains with a
 *  counted explorer, in their roster order, three or more with an Oxford comma. A chain whose explorers
 *  are all outside the count (Optimism's, read on visit; ui-jobs 578) is not named. */
export function countedChainNames(): string {
  const counted = new Set(COUNTED_PROTOCOLS.map((p) => p.chainId));
  const names = launchedProductionChains()
    .filter((c) => counted.has(c.id))
    .map((c) => c.name);
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

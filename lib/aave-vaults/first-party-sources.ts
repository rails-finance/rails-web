// Aave's own pages about the three families this directory lists.
// ----------------------------------------------------------------------------
// A CITATION, NOT AN ATTRIBUTION. The retired find door drew a grid of provider tiles
// because the Base chain record identifies apps whose wallet contracts hold
// shares of a catalogued vault. This is the other case: the venue publishes the
// vaults itself, so what there is to point at is the VENUE'S OWN DOCUMENTATION —
// the pages Aave writes about savings GHO, the Umbrella stake tokens and the
// static aTokens, plus the two app surfaces its own front end serves them on.
//
// WHY AAVE ITSELF EARNS NO TILE (rails-ops plan §7, confirmed 2026-09-06). The
// tile rule is two-pronged and the first prong fails here: Aave's app is a
// connect-your-own-wallet front. It deploys no per-customer smart account,
// publishes no wallet implementation and installs no EIP-7702 delegate, so
// nothing in the chain record says a holder arrived through app.aave.com. A
// holder of one of these vaults is that holder's own address, and this section
// names no app on any row. The tile rule exists to refuse claims of that shape,
// and it refuses this one too — including for the venue.
//
// WHAT IS AND IS NOT CLAIMED ABOUT THESE PAGES. Every URL below was fetched on
// FETCHED_ON and answered 200; `aave.com/docs/*` serves the same page as raw
// markdown under `Accept: text/markdown`, which is how a verifier re-reads a
// citation without a browser. Nothing here claims their prose is unchanged
// since, and NO FIGURE on this site comes from them: they are pages a reader can
// open, not a source this repo reads.
//
// ⚠️ ONE URL IS DELIBERATELY ABSENT. `https://aave.com/docs/aave-v3/guides/sgho`
// is not a page — it answered 404 when the plan was written and answers a 308
// redirect to the canonical sGHO page today. Either way it is not the page Aave
// publishes, and a citation that resolves only by redirect is a citation of
// somewhere else. The verifier asserts it is absent rather than merely unlisted.

/** The day every URL below was last fetched and answered 200 (ISO; the page
 *  prints it "en-GB" through lib/date.ts). */
export const AAVE_FIRST_PARTY_FETCHED_ON = "2026-09-06";

/** One page Aave publishes, and what it is about. `label` is this repo's own
 *  short name for the subject — never a quotation of the page's title, which
 *  can change without notice. */
export interface AaveFirstPartySource {
  /** Which of the three families, or the app surface, the page is about. */
  label: string;
  url: string;
  /** One line: what a reader will find there, in this repo's words. */
  note: string;
}

/** The venue's own pages, docs first and the two app surfaces last. */
export const AAVE_FIRST_PARTY_SOURCES: readonly AaveFirstPartySource[] = [
  {
    label: "Savings GHO",
    url: "https://aave.com/docs/ecosystem/gho/sgho",
    note: "Aave’s page for sGHO: the ERC-4626 savings vault over GHO, and the address it names as the contract.",
  },
  {
    label: "Umbrella",
    url: "https://aave.com/docs/aave-v3/umbrella",
    note: "Aave’s contract reference for the staking layer the four stake tokens belong to, including the cooldown rule.",
  },
  {
    label: "Static aTokens",
    url: "https://aave.com/docs/aave-v3/smart-contracts/tokenization",
    note: "Aave’s tokenization reference, where the static aToken wrapper and the factory that enumerates it are described.",
  },
  {
    label: "The sGHO surface in Aave’s app",
    url: "https://app.aave.com/sgho/",
    note: "The page Aave’s own front end serves savings GHO on.",
  },
  {
    label: "The staking surface in Aave’s app",
    url: "https://app.aave.com/staking/",
    note: "The page Aave’s own front end serves the Umbrella stake tokens on.",
  },
];

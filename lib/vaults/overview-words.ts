// The words of the /vaults overview (rails-ops ui-jobs 782): its lead, and the
// ways in (E6.3):
// a card for each way into vaults on Rails beside the family cards, each a
// title and a line, the whole card the link. "Look up a wallet" joins once
// the wallet page lists vault shares (ui-jobs 783).
//
// Pure: the routes only.

import { COMPARE_HREF } from "./compare";
import { FRONTS_HREF, PRODUCTS_HREF } from "./routes";

/** Under the head, above the family cards (E6; Miles, 20 Nov 2026): the
 *  cards' lead-in. The ?asset= view has its own line in its place. */
export const OVERVIEW_LEAD =
  "The cards below are the vault families Rails reads from the chain, with a count of each family's vaults on each chain at the block read.";

export interface WayIn {
  key: string;
  title: string;
  line: string;
  href: string;
}

export const WAYS_IN_WORDS = {
  heading: "Explore vaults on Rails",
  lead: "The three cards below are the other ways into vaults on Rails: how each vault family works, the apps that put a vault behind their product, and comparing vaults side by side.",
};

export const WAYS_IN: readonly WayIn[] = [
  {
    key: "products",
    title: "Vault products",
    line: "For each vault family, how a deposit is redeemed, who can change a vault, what waits and what it charges.",
    href: PRODUCTS_HREF,
  },
  {
    key: "fronts",
    title: "Vault fronts",
    line: "Apps that put an on-chain vault behind their product, each cited to the page the app publishes.",
    href: FRONTS_HREF,
  },
  {
    key: "compare",
    title: "Compare vaults",
    line: "Put two to four vaults side by side, from any family or chain, and see where they differ.",
    href: COMPARE_HREF,
  },
];

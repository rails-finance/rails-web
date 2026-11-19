// Every word of the vault fronts page (rails-ops ui-jobs 774; anatomy E5) and
// its search rows. Each states what a front's page says, cited as theirs
// (decision 0017 point 5).
//
// Pure: a type import only.

import type { FrontPositionSits, VaultFront } from "./fronts";

export const FRONTS_TITLE = "Vault fronts";

export const FRONTS_PAGE = {
  lead: "Apps that put an on-chain vault behind their own product, one row per product and vault, each cited to the page the app publishes with the day it was read.",
  caption: (front: string) => `${front}: the vaults behind its products`,
  columns: {
    front: "Front",
    product: "Product",
    chain: "Chain",
    family: "Vault family",
    vault: "Vault",
    position: "Position sits in",
    source: "Source",
  },
  /** The /vaults line pointing here. */
  indexLink: "Apps that put a vault behind their own product",
};

export const FRONT_VAULT = {
  noAddress: "Address not published",
  namedByCurator: "Named by the curator",
  copy: "Copy the vault's address",
  read: "Open on Rails",
  notRead: "Rails does not read this vault yet",
  unknown: "The vault index did not answer",
};

export const FRONT_POSITION: Record<FrontPositionSits, string> = {
  "user's wallet": "The user's wallet",
  "front's pooled address": "The front's pooled address",
  "not stated": "Not stated",
};

export const FRONT_SOURCE = {
  /** "read 19 Nov 2026" */
  read: (date: string) => `read ${date}`,
  curator: "curator's page",
};

/** A search row's reason it matched the front's name. */
export const frontSearchWhy = (f: Pick<VaultFront, "front" | "product" | "several">) =>
  `${f.front} publishes ${f.several ? "these vaults" : "this vault"} behind ${f.product}`;

// Every word of the vault fronts page (rails-ops ui-jobs 774; anatomy E5) and
// its search rows. Each states what a front's page says, cited as theirs
// (decision 0017 point 5).
//
// Pure: a type import only.

import type { FrontPositionSits } from "./fronts";

export const FRONTS_TITLE = "Vault fronts";

export const FRONTS_PAGE = {
  lead: "The tables below list the apps that put an on-chain vault behind their product. Each row is one product and vault, cited to the page the app publishes with the day it was read.",
  caption: (front: string) => `${front}: the vaults behind its products`,
  columns: {
    product: "Product",
    chain: "Chain",
    family: "Vault family",
    vault: "Vault",
    position: "Position sits in",
    source: "Source",
  },
};

export const FRONT_VAULT = {
  noAddress: "Address not published",
  namedByCurator: "Address from the curator",
  copy: "Copy the vault's address",
  copied: "Copied",
  copyFailed: "Could not copy",
  notRead: "Rails does not read this vault yet",
  familyNotRead: (family: string) => `Rails does not read ${family} vaults yet`,
  unnamed: "The vault is not named, so Rails cannot check it",
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

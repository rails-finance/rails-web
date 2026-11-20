// Every word of the vault products page (rails-ops ui-jobs 773; anatomy E7):
// how each vault family Rails reads is redeemed, who stewards it, what waits,
// what it charges and where a vault's withdrawable figure is stated.
// ----------------------------------------------------------------------------
// One source: a sentence a family's vault page, info page or modal already
// states is imported from the module that owns it, so this page cannot drift
// from them. The strings written here are the column heads and the sentences
// no other page states.
//
// Pure: no React, imports from pure word modules only.

import type { VaultFamily } from "./families";
import {
  IPOR_FEES_TEXT,
  IPOR_ROLES_TEXT,
  MAPLE_DELEGATE_TIP,
  MAPLE_LIQUID_TEXT,
  MAPLE_QUEUE_TEXT,
  METAMORPHO_FEE_TIP,
  METAMORPHO_ROLE_WHAT,
  SBOLD_OWNER_TIP,
  STATA_REWARDS_TEXT,
  UMBRELLA_COOLDOWN_TEXT,
  UMBRELLA_REWARDS_TEXT,
  YEARN_ACCOUNTANT_TIP,
} from "./card-words";
import { IDLE_READY, ROLE_SENTENCE, STEWARD_UNREAD, STRATEGIES_PAY, WITHDRAWALS_UNREAD } from "./health-words";
import {
  MAPLE_UPGRADES_WAIT,
  METAMORPHO_AT_ONCE,
  METAMORPHO_TIMELOCKED,
  YEARN_HANDOVER,
  YEARN_NO_WAIT,
} from "./protects-words";

export const PRODUCTS_TITLE = "Vault products";

export const PRODUCTS_PAGE = {
  lead: "How each vault family Rails reads works: how a deposit is redeemed, who can change the vault, what waits, what it charges, and where a vault's withdrawable figure is stated.",
  caption: "Each vault family Rails reads, and how it works",
  columns: {
    family: "Family",
    redemption: "Redemption",
    stewards: "Steward roles",
    timelock: "Timelock",
    fees: "Fees",
    vaults: "Vaults",
    leave: "Can leave now",
  },
  notRead: "Not read",
  countNotRead: "Count not read",
};

/** One cell: a short head, then the sentences under it. `read` false draws
 *  the head muted: Rails has not read it. */
export interface ProductCell {
  head: string;
  lines: string[];
  read: boolean;
}

/** A steward role and what it can change. */
export interface ProductRole {
  role: string;
  what: string;
}

export interface ProductFamilyWords {
  redemption: ProductCell;
  /** The roles, or a cell where Rails reads none here. */
  stewards: ProductRole[] | ProductCell;
  timelock: ProductCell;
  fees: ProductCell;
  leave: ProductCell;
}

/** "a holder starts…" → "A holder starts…": the modals' texts open lower-case. */
const sentence = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

const cell = (head: string, ...lines: string[]): ProductCell => ({ head, lines, read: true });
const unread = (...lines: string[]): ProductCell => ({ head: PRODUCTS_PAGE.notRead, lines, read: false });

const AAVE_GOV_WAIT = "Aave governance can change the vault; each vault's page states both lengths.";

export const PRODUCT_FAMILY_WORDS: Record<VaultFamily, ProductFamilyWords> = {
  metamorpho: {
    redemption: cell(
      "Instant",
      "A withdrawal takes from the markets in the vault's withdraw queue, in order, as far as each holds unborrowed.",
    ),
    stewards: [
      { role: "Owner", what: METAMORPHO_ROLE_WHAT.owner },
      { role: "Curator", what: METAMORPHO_ROLE_WHAT.curator },
      { role: "Guardian", what: METAMORPHO_ROLE_WHAT.guardian },
    ],
    timelock: cell(
      "The vault's timelock()",
      `${METAMORPHO_TIMELOCKED} each wait it.`,
      METAMORPHO_AT_ONCE,
      "Each vault's page states its length.",
    ),
    fees: cell("Performance fee", METAMORPHO_FEE_TIP),
    leave: cell(
      "Stated per vault",
      "Each vault's page states the share of its assets withdrawable at its block: what the markets in its withdraw queue hold unborrowed.",
    ),
  },
  sgho: {
    redemption: cell("Instant", "A withdrawal is capped at the GHO the contract holds."),
    stewards: unread(STEWARD_UNREAD.sgho!),
    timelock: cell("An Aave vote, then a wait", AAVE_GOV_WAIT),
    fees: unread(),
    leave: unread(WITHDRAWALS_UNREAD.sgho!),
  },
  stata: {
    redemption: cell("Instant", "A withdrawal takes cash from its Aave reserve."),
    stewards: unread(STEWARD_UNREAD.stata!),
    timelock: cell("An Aave vote, then a wait", AAVE_GOV_WAIT),
    fees: unread(sentence(STATA_REWARDS_TEXT)),
    leave: unread(),
  },
  "umbrella-stake": {
    redemption: cell("Cooldown, then a window", sentence(UMBRELLA_COOLDOWN_TEXT)),
    stewards: [{ role: "Owner", what: ROLE_SENTENCE.umbrellaOwner }],
    timelock: cell(
      "An Aave vote, then a wait",
      "Aave governance can change Umbrella; each vault's page states both lengths.",
    ),
    fees: unread(UMBRELLA_REWARDS_TEXT),
    leave: cell("Stated per vault", "Each vault's page states its cooldown and unstake window."),
  },
  "yearn-v3": {
    redemption: cell("Instant", IDLE_READY, STRATEGIES_PAY),
    stewards: [
      { role: "Role manager", what: ROLE_SENTENCE.roleManager },
      { role: "Accountant", what: YEARN_ACCOUNTANT_TIP },
    ],
    timelock: cell("None in the vault", YEARN_NO_WAIT, YEARN_HANDOVER),
    fees: cell("Charged by the accountant", "Rails does not read which kinds it charges."),
    leave: cell("Stated per vault", "Each vault's page states the share of its assets idle at its block."),
  },
  "maple-pool": {
    redemption: cell("Queued", sentence(MAPLE_QUEUE_TEXT)),
    stewards: [{ role: "Pool delegate", what: MAPLE_DELEGATE_TIP }],
    timelock: cell(
      "Maple's timelock",
      `${MAPLE_UPGRADES_WAIT}. Maple's security admin can upgrade without the wait.`,
      "Each pool's page states the wait.",
    ),
    fees: unread(),
    leave: cell("Stated per pool", `Liquid now: ${MAPLE_LIQUID_TEXT}`, "The pools page states it for each pool."),
  },
  sbold: {
    redemption: unread("The vault's page states paused() where it answers true."),
    stewards: [{ role: "Owner", what: SBOLD_OWNER_TIP }],
    timelock: unread(),
    fees: unread(),
    leave: unread(),
  },
  "ipor-fusion": {
    redemption: unread(),
    stewards: [{ role: "Owner and curator", what: sentence(IPOR_ROLES_TEXT) }],
    timelock: unread("The access manager's waits on each role are not read."),
    fees: cell("Performance and management", sentence(IPOR_FEES_TEXT)),
    leave: unread(),
  },
};

/** A count's words: "387 vaults", "1 vault". */
export const vaultCountText = (count: number, noun: { one: string; many: string } = { one: "vault", many: "vaults" }) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? noun.one : noun.many}`;

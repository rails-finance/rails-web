// Every word of the vault products page (rails-ops ui-jobs 773; anatomy E7):
// how a deposit in each vault family Rails reads is withdrawn, who stewards
// it, what waits, what it charges and where a vault's withdrawable figure is
// stated.
// ----------------------------------------------------------------------------
// One source: a sentence a family's vault page, info page or modal already
// states is imported from the module that owns it, so this page cannot drift
// from them. The strings written here are the column heads, the cell heads and
// the page-only sentences: the pointers to where a vault's or pool's page
// states a figure (`perVault`, `aaveGovLengths`, `aaveAdminPointer`,
// `sboldPaused`, Maple's two), and what Rails does not read (`kindsUnread`,
// `iporWaitsUnread`). "Not read yet." is the vault comparison's word.
//
// Pure: no React, imports from pure word modules only.

import type { VaultFamily } from "./families";
import {
  IPOR_FEES_TEXT,
  MORPHO_QUEUE_ORDER,
  MORPHO_QUEUE_SUPPLY,
  SGHO_WITHDRAW_CLAMP,
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
import { FEE_WORDS } from "./compare-words";
import {
  IDLE_READY,
  ROLE_SENTENCE,
  STATA_FROM_RESERVE,
  STEWARD_UNREAD,
  STRATEGIES_PAY,
  WITHDRAWALS_UNREAD,
} from "./health-words";
import {
  MAPLE_UPGRADES_WAIT,
  MAPLE_VERSIONS_GAP,
  mapleSecurityAdminText,
  SGHO_YIELD_MANAGER_GAP,
  STATA_GOV_TEXT,
  STATA_UNVOTED_GAP,
  METAMORPHO_AT_ONCE,
  METAMORPHO_TIMELOCKED,
  YEARN_HANDOVER,
  YEARN_NO_WAIT,
} from "./protects-words";

export const PRODUCTS_TITLE = "Vault products";

export const PRODUCTS_PAGE = {
  lead: "How each vault family Rails reads works: how a deposit is redeemed, who can change the vault, what waits, what it charges, and where a vault's withdrawable figure is stated.",
  caption: "Vault families Rails reads",
  columns: {
    family: "Family",
    withdrawals: "Withdrawals",
    stewards: "Steward roles",
    timelock: "Timelock",
    fees: "Fees",
    vaults: "Vaults",
    withdrawable: "Withdrawable",
  },
  /** The vault comparison's word for a figure Rails does not read. */
  notRead: FEE_WORDS.notRead.sentence,
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
  withdrawals: ProductCell;
  /** The roles, or a cell where Rails reads none here. */
  stewards: ProductRole[] | ProductCell;
  timelock: ProductCell;
  fees: ProductCell;
  withdrawable: ProductCell;
}

/** "a holder starts…" → "A holder starts…": the modals' texts open lower-case. */
const sentence = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

const cell = (head: string, ...lines: string[]): ProductCell => ({ head, lines, read: true });
const unread = (...lines: string[]): ProductCell => ({ head: PRODUCTS_PAGE.notRead, lines, read: false });

/** The page-only sentences (the header names them). */
const perVault = (what: string) => `Each vault's page states ${what}.`;
const aaveGovLengths = "Each vault's page states the vote's and the wait's lengths.";
const aaveAdminPointer = (subject: string) =>
  `Each vault's page states whether Aave governance holds ${subject}'s admin role, and the vote's and the wait's lengths.`;
const kindsUnread = "Rails does not read which kinds it charges.";
const iporWaitsUnread = "Rails does not read the access manager's waits on each role.";
const sboldPaused = "The vault's page states paused() where it answers true.";

export const PRODUCT_FAMILY_WORDS: Record<VaultFamily, ProductFamilyWords> = {
  metamorpho: {
    withdrawals: cell("Instant", `${MORPHO_QUEUE_SUPPLY}. ${MORPHO_QUEUE_ORDER}`),
    stewards: [
      { role: "Owner", what: METAMORPHO_ROLE_WHAT.owner },
      { role: "Curator", what: METAMORPHO_ROLE_WHAT.curator },
      { role: "Guardian", what: METAMORPHO_ROLE_WHAT.guardian },
    ],
    timelock: cell(
      "The vault's timelock()",
      `${METAMORPHO_TIMELOCKED} each wait.`,
      METAMORPHO_AT_ONCE,
      perVault("its length"),
    ),
    fees: cell("Performance fee", METAMORPHO_FEE_TIP),
    withdrawable: cell(
      "Stated per vault",
      perVault(
        "the share of its assets withdrawable at its block: what the markets in its withdraw queue hold unborrowed",
      ),
    ),
  },
  sgho: {
    withdrawals: cell("Instant", SGHO_WITHDRAW_CLAMP),
    stewards: unread(STEWARD_UNREAD.sgho!),
    timelock: cell("Aave governance", aaveAdminPointer("sGHO"), SGHO_YIELD_MANAGER_GAP),
    fees: unread(),
    withdrawable: unread(WITHDRAWALS_UNREAD.sgho!),
  },
  stata: {
    withdrawals: cell("Instant", `${STATA_FROM_RESERVE}.`),
    stewards: unread(STEWARD_UNREAD.stata!),
    timelock: cell("Aave governance", STATA_GOV_TEXT, aaveGovLengths, STATA_UNVOTED_GAP),
    fees: unread(sentence(STATA_REWARDS_TEXT)),
    withdrawable: unread(),
  },
  "umbrella-stake": {
    withdrawals: cell("Cooldown, then a window", sentence(UMBRELLA_COOLDOWN_TEXT)),
    stewards: [{ role: "Owner", what: ROLE_SENTENCE.umbrellaOwner }],
    timelock: cell("Aave governance", aaveAdminPointer("Umbrella")),
    fees: unread(UMBRELLA_REWARDS_TEXT),
    withdrawable: cell("Stated per vault", perVault("its cooldown and unstake window")),
  },
  "yearn-v3": {
    withdrawals: cell("Idle, then from strategies", IDLE_READY, STRATEGIES_PAY),
    stewards: [
      { role: "Role manager", what: ROLE_SENTENCE.roleManager },
      { role: "Accountant", what: YEARN_ACCOUNTANT_TIP },
    ],
    timelock: cell("None in the vault", YEARN_NO_WAIT, YEARN_HANDOVER),
    fees: cell("Charged by the accountant", kindsUnread),
    withdrawable: cell("Stated per vault", perVault("the share of its assets idle at its block")),
  },
  "maple-pool": {
    withdrawals: cell("Queued", sentence(MAPLE_QUEUE_TEXT)),
    stewards: [{ role: "Pool delegate", what: MAPLE_DELEGATE_TIP }],
    timelock: cell(
      "Maple's timelock",
      `${MAPLE_UPGRADES_WAIT}. ${mapleSecurityAdminText()}`,
      "Each pool's page states the wait.",
      MAPLE_VERSIONS_GAP,
    ),
    fees: unread(),
    withdrawable: cell(
      "Stated per pool",
      `Liquid now: ${MAPLE_LIQUID_TEXT}`,
      "The pools page states it for each pool.",
    ),
  },
  sbold: {
    withdrawals: unread(sboldPaused),
    stewards: [{ role: "Owner", what: SBOLD_OWNER_TIP }],
    timelock: unread(),
    fees: unread(),
    withdrawable: unread(),
  },
  "ipor-fusion": {
    withdrawals: unread(),
    stewards: [{ role: "Owner and curator", what: sentence(IPOR_ROLES_TEXT) }],
    timelock: unread(iporWaitsUnread),
    fees: cell("Performance and management", sentence(IPOR_FEES_TEXT)),
    withdrawable: unread(),
  },
};

/** A count's words: "387 vaults", "1 vault". */
export const vaultCountText = (count: number, noun: { one: string; many: string } = { one: "vault", many: "vaults" }) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? noun.one : noun.many}`;

// IPOR Fusion's per-chain contracts the factsheet reads besides the vault, from
// IPOR's own address files (IPOR-Labs/fusion-vault-launchpad,
// contexts/ipor-abi/mainnet-<chain>-fusion.json, read 2026-11-19), lowercased.
// No imports: a test reads this module.

/** The Fuse Whitelist (`IporFusionFuseWhitelistProxy`): the IPOR DAO's register
 *  of fuses, each ACTIVE, DEPRECATED or REMOVED, read per fuse with
 *  `getFuseByAddress(fuse)`. */
export const IPOR_FUSE_WHITELIST: Record<number, string> = {
  1: "0xf3d8785f351251f715c142132860df53318c2867",
  42161: "0xc1e4de288313b07d51fa49a202d231cceeb07a9a",
  8453: "0x3dd2455c55fef6e2445c0a085f4beeb1a275e3ba",
};

/** The roles an `IporFusionAccessManager` grants, by id, as IPOR's
 *  `contracts/libraries/Roles.sol` names them. Three carry a Rails word
 *  (rails-ops lexicon, "steward"; Miles 19 Nov 2026): role 1 is the vault's
 *  owner, role 200 (IPOR's Alpha) its curator, and role 100 keeps IPOR's word,
 *  Atomist. Every other role is named by its constant, as chain text. */
export const IPOR_ROLES: Record<string, { constant: string; word?: string; tip: string }> = {
  "0": { constant: "ADMIN_ROLE", tip: "Manages the access manager, every role included." },
  "1": { constant: "OWNER_ROLE", word: "Owner", tip: "Appoints the vault's owners, guardians and Atomists." },
  "2": { constant: "GUARDIAN_ROLE", tip: "Can cancel a time-locked change, and pause and unpause the vault." },
  "3": { constant: "TECH_PLASMA_VAULT_ROLE", tip: "The vault contract, set at creation." },
  "4": { constant: "IPOR_DAO_ROLE", tip: "The IPOR DAO, set at creation." },
  "5": { constant: "TECH_CONTEXT_MANAGER_ROLE", tip: "The vault's context manager, set at creation." },
  "6": { constant: "TECH_WITHDRAW_MANAGER_ROLE", tip: "The vault's withdraw manager." },
  "7": { constant: "TECH_VAULT_TRANSFER_SHARES_ROLE", tip: "May move the vault's shares where transfers are limited." },
  "100": {
    constant: "ATOMIST_ROLE",
    word: "Atomist",
    tip: "Manages the vault's settings and fuses; appointed by the owner.",
  },
  "200": {
    constant: "ALPHA_ROLE",
    word: "Curator",
    tip: "Runs the vault's strategy, moving its assets between markets through its fuses.",
  },
  "300": { constant: "FUSE_MANAGER_ROLE", tip: "Adds and removes the vault's fuses." },
  "301": { constant: "PRE_HOOKS_MANAGER_ROLE", tip: "Adds and removes the vault's pre-hooks." },
  "400": { constant: "TECH_PERFORMANCE_FEE_MANAGER_ROLE", tip: "The contract that sets the performance fee." },
  "500": { constant: "TECH_MANAGEMENT_FEE_MANAGER_ROLE", tip: "The contract that sets the management fee." },
  "600": { constant: "CLAIM_REWARDS_ROLE", tip: "Claims rewards through the vault's rewards claim manager." },
  "601": { constant: "TECH_REWARDS_CLAIM_MANAGER_ROLE", tip: "The vault's rewards claim manager." },
  "700": { constant: "TRANSFER_REWARDS_ROLE", tip: "Moves rewards from the vault to its rewards claim manager." },
  "800": { constant: "WHITELIST_ROLE", tip: "May deposit and withdraw where the vault limits who can." },
  "900": {
    constant: "CONFIG_INSTANT_WITHDRAWAL_FUSES_ROLE",
    tip: "Sets the order an instant withdrawal walks the fuses in.",
  },
  "901": { constant: "WITHDRAW_MANAGER_REQUEST_FEE_ROLE", tip: "Sets the fee on a withdrawal request." },
  "902": { constant: "WITHDRAW_MANAGER_WITHDRAW_FEE_ROLE", tip: "Sets the fee on a withdrawal." },
  "1000": { constant: "UPDATE_MARKETS_BALANCES_ROLE", tip: "May refresh the vault's balance in its markets." },
  "1100": { constant: "UPDATE_REWARDS_BALANCE_ROLE", tip: "May refresh the vault's rewards balance." },
  "1200": { constant: "PRICE_ORACLE_MIDDLEWARE_MANAGER_ROLE", tip: "Sets the vault's price sources." },
};

/** The role ids the steward stat names, in its order: owner, then curator. */
export const IPOR_STEWARD_ROLES = ["1", "200"] as const;

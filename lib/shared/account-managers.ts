// Who runs a contract account, where the chain states it (rails-ops ui-jobs
// 440): the product contracts an account's own state names, by chain. The
// address-kind read (lib/sources/chain/address-kind.ts) asks the account at
// head, and the wallet heading's chip and its receipt read the answer. Never
// from the transaction history: a Safe whose every transaction went through
// DeFi Saver but has no module enabled is a plain Safe here.
//
// ── Evidence ────────────────────────────────────────────────────────────────
// DeFi Saver: `defisaver/defisaver-v3-contracts` `addresses/{mainnet,base,
// arbitrum}.json` (read 23 Oct 2026), the file lib/shared/bar-owners.ts
// cites. `SafeModuleAuth` (contracts/core/strategy/SafeModuleAuth.sol) is the
// Safe module DeFi Saver's strategy executor calls `execTransactionFromModule`
// through; `ProxyAuth` (ProxyAuth.sol) calls a DSProxy's `execute`, which the
// proxy allows when its authority's `canCall(ProxyAuth, proxy, execute)`
// answers true. Neither entry has a `history`.
//
// Summer.fi: `OasisDEX/oasis-earn-sc` `packages/deploy-configurations/
// configs/{mainnet,base,arbitrum}.conf.ts` (read 23 Oct 2026), the
// `AccountGuard` entry. A DPM account (`AccountImplementation`, an EIP-1167
// clone the `AccountFactory` makes) answers `guard()` with it, and `owner()`
// with `guard.owners(account)`.
//
// Instadapp: `Instadapp/dsa-contracts` `docs/addresses.json` (read 23 Oct
// 2026), `InstaList` per chain. `accountID(address)` is non-zero for a DSA
// the InstaIndex built; `accountLink(id).first` and `accountList(id, a).next`
// walk its authorities.

import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

export type ManagerProduct = "defisaver" | "summerfi" | "instadapp";

/** DeFi Saver's Safe module, by chain. */
export const DFS_SAFE_MODULE_AUTH: Partial<Record<ChainId, string>> = {
  [MAINNET_CHAIN_ID]: "0x7407974ddbf539e552f1d051e44573090912cc3d",
  [BASE_CHAIN_ID]: "0xa9bfa0bfcffbb6d375ce61474bf184e879f4d533",
  [ARBITRUM_CHAIN_ID]: "0xb3d6b7f561c1f250bf7f0f00efd19fae6ce533dd",
};

/** DeFi Saver's DSProxy executor, by chain. */
export const DFS_PROXY_AUTH: Partial<Record<ChainId, string>> = {
  [MAINNET_CHAIN_ID]: "0x149667b6fae2c63d1b4317c716b0d0e4d3e2bd70",
  [BASE_CHAIN_ID]: "0xd34bbe7398f7f08952b033bbaf2d2c84231dcedc",
  [ARBITRUM_CHAIN_ID]: "0xf3a8479538319756e100c386b3e60bf783680d8f",
};

/** Summer.fi's DPM account guard, by chain. */
export const SUMMER_ACCOUNT_GUARD: Partial<Record<ChainId, string>> = {
  [MAINNET_CHAIN_ID]: "0xce91349d2a4577bbd0fc91fe6019600e047f2847",
  [BASE_CHAIN_ID]: "0x83c8bffd11913f0e94c1c0b615fc2fdb1b17a27e",
  [ARBITRUM_CHAIN_ID]: "0x746a6f9acb42bcb43c08c829a035dba7db9e7385",
};

/** Instadapp's DSA list, by chain. */
export const INSTA_LIST: Partial<Record<ChainId, string>> = {
  [MAINNET_CHAIN_ID]: "0x4c8a1beb8a87765788946d6b19c6c6355194abeb",
  [BASE_CHAIN_ID]: "0x9926955e0dd681dc303370c52f4ad0a4dd061687",
  [ARBITRUM_CHAIN_ID]: "0x3565f6057b7ffe36984779a507fc87b31efb0f09",
};

/** `execute(address,bytes)`, the DSProxy call ProxyAuth makes. */
export const DSPROXY_EXECUTE = "0x1cff79cd";

/** Where each product's contract is named: the receipt's name leaf. */
export const MANAGER_SOURCES: Record<ManagerProduct, { text: string; href: string }> = {
  defisaver: {
    text: "DeFi Saver's deployments (defisaver-v3-contracts, addresses/)",
    href: "https://github.com/defisaver/defisaver-v3-contracts/tree/main/addresses",
  },
  summerfi: {
    text: "Summer.fi's deployments (oasis-earn-sc, packages/deploy-configurations/configs/)",
    href: "https://github.com/OasisDEX/oasis-earn-sc/tree/dev/packages/deploy-configurations/configs",
  },
  instadapp: {
    text: "Instadapp's deployments (dsa-contracts, docs/addresses.json)",
    href: "https://github.com/Instadapp/dsa-contracts/blob/master/docs/addresses.json",
  },
};

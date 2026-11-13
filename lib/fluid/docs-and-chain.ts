// Where the docs and the contracts differ: rails-ops
// reference/official-docs/fluid.md, "Docs and chain disagree", entry 2
// (ui-jobs 633). The block and counts are the register's.

import type { InfoDocsAndChain } from "@/components/shared/protocol-info-page";
import type { Provenance } from "@/components/shared/provenance";
import { FLUID_ADDRESSES } from "@/lib/fluid/asset-catalog";

const REGISTER_BLOCK = 26_402_592;
const VAULT_1 = "0xeAbBfca72F8a8bf14C4ac59e69ECB2eB69F0811C";
const VAULTS_DOCS = "https://docs.fluid.io/fluid-integration/borrow/read/vaults.html";
const RESOLVER = { name: "Fluid VaultResolver", address: FLUID_ADDRESSES.VAULT_RESOLVER };

const totalPositionsProv: Provenance = {
  kind: "chain",
  pclass: "state",
  source: { block: REGISTER_BLOCK },
  contract: RESOLVER,
  summary:
    "Vault 1's totalPositions — VaultResolver.getVaultEntireData for vault 1 (ETH / USDC) at block 26,402,592, read 13 Nov 2026: vaultState.totalPositions is 129. Rails's index holds 129 position NFTs for the vault, and on all 182 vaults the resolver's count equals the NFTs Rails has indexed.",
  via: "VaultResolver.getVaultEntireData(vault 1) · vaultState.totalPositions @ block 26,402,592",
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node for VaultResolver.getVaultEntireData(${VAULT_1}) at block 26,402,592, and read vaultState.totalPositions.`,
  },
};

const heldProv: Provenance = {
  kind: "chain",
  pclass: "state",
  source: { block: REGISTER_BLOCK },
  contract: RESOLVER,
  summary:
    "Vault 1's positions that hold anything — VaultResolver.positionByNftId for each of the vault's 129 position NFTs at block 26,402,592, read 13 Nov 2026: 14 hold collateral or debt (6 with debt, 8 with collateral only) and 115 hold neither.",
  via: "VaultResolver.positionByNftId(nftId) for each of vault 1's 129 NFTs @ block 26,402,592",
  verify: {
    kind: "recompute",
    text: "To check: ask any Ethereum archive node for VaultResolver.positionByNftId of each of vault 1's position NFTs at block 26,402,592, and count those whose supply or borrow is above zero.",
  },
};

export const FLUID_DOCS_AND_CHAIN: readonly InfoDocsAndChain[] = [
  {
    claim:
      "The docs describe a vault's totalPositions as its open positions; the count holds every position NFT the vault has minted, including those that hold nothing. Rails shows it as positions opened, and counts open positions from its index.",
    docs: {
      quotes: [{ words: "Number of open positions (NFTs) in this vault.", href: VAULTS_DOCS }],
      read: "13 Nov 2026",
    },
    chain: [
      { words: "vault 1's totalPositions is 129 at block 26,402,592", prov: totalPositionsProv },
      { words: "14 of those 129 positions hold collateral or debt", prov: heldProv },
    ],
  },
];

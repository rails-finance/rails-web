// PWN contract catalog (chain-state tier).
// ----------------------------------------------------------------------------
// PWN is a P2P fixed-term loan protocol: the SimpleLoan contract structs a loan
// and the LOAN token (an NFT) represents the lender's claim. There is no curated
// asset list — a loan's collateral and credit are arbitrary tokens (ERC20 or, for
// collateral, frequently an ERC721/1155), so symbols/decimals are resolved on
// demand from the chain via the generic ERC20 resolver (lib/sources/chain/
// erc20-meta.ts). This file holds only the protocol's own addresses, used as the
// `contract` on every provenance entry (versioned — v1.1/v1.2/v1.3 are distinct
// SimpleLoan deployments; the LOAN token is shared).

export const PWN_ADDRESSES = {
  /** SimpleLoan v1.1 (factory model) — all seeded loans were struck here. */
  SIMPLE_LOAN_V11: "0x57c88d78f6d08b5c88b4a3b7bbb0c1aa34c3280a",
  /** SimpleLoan v1.2 (proposal model). */
  SIMPLE_LOAN_V12: "0x0773d5f2f7b3264a9eb285f085acccc53d5aaa4f",
  /** SimpleLoan v1.3. */
  SIMPLE_LOAN_V13: "0x719a69d0dc67bd3aa7648d4694081b3c87952797",
  /** PWN LOAN token — the ERC721 minted to the lender at creation, burned on close. */
  LOAN_TOKEN: "0x4440c069272cc34b80c7b11bee657d0349ba9c23",
  /** PWN Token Bundler — the protocol's own ERC-1155 that wraps several assets
   *  into one bundle token, the shape multi-asset collateral takes on PWN. The
   *  ERC-1155 standard has no symbol()/name() (both revert here), so the generic
   *  resolver can't name it; identity is confirmed by its on-chain uri(id) —
   *  https://api.pwn.xyz/bundle/1/<this address>/{id}/metadata — and its contents
   *  are chain-readable via tokensInBundle(id). */
  TOKEN_BUNDLER: "0x19e3293196aee99bb3080f28b9d3b4ea7f232b8d",
} as const;

/** The SimpleLoan deployment for a loan's version ('v11' | 'v12' | 'v13'). */
export function simpleLoanFor(version: string | null | undefined): { name: string; address: string } {
  switch (version) {
    case "v12":
      return { name: "PWN SimpleLoan v1.2", address: PWN_ADDRESSES.SIMPLE_LOAN_V12 };
    case "v13":
      return { name: "PWN SimpleLoan v1.3", address: PWN_ADDRESSES.SIMPLE_LOAN_V13 };
    default:
      return { name: "PWN SimpleLoan v1.1", address: PWN_ADDRESSES.SIMPLE_LOAN_V11 };
  }
}

/** The shared LOAN token (minted / burned events). */
export const PWN_LOAN_TOKEN = { name: "PWN LOAN token", address: PWN_ADDRESSES.LOAN_TOKEN };

/** The Token Bundler (bundle collateral provenance). */
export const PWN_BUNDLER = { name: "PWN Token Bundler", address: PWN_ADDRESSES.TOKEN_BUNDLER };

export const isPwnBundler = (addr: string | null | undefined): boolean =>
  addr?.toLowerCase() === PWN_ADDRESSES.TOKEN_BUNDLER;

/** Display name for PWN's own periphery assets, which the generic on-chain
 *  resolver cannot name (the bundler's ERC-1155 has no symbol()/name()).
 *  Checked before the resolver's meta by both timeline and positions builders. */
export const pwnAssetSymbolOverride = (addr: string | null | undefined): string | undefined =>
  isPwnBundler(addr) ? "PWN Bundle" : undefined;

/** Short, copy-friendly form of a wallet address. */
export const shortAddress = (addr: string): string => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

/** An NFT token id is an arbitrary uint256 — most are short (a Uniswap V3 mint
 *  counter), but hash-derived ids run the full 78 digits and blow out a card
 *  column. Abbreviate anything long to `first6…last4`; leave short ids intact.
 *  The caller keeps the full value in a hover `title`. */
export const shortTokenId = (id: string): string => (id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);

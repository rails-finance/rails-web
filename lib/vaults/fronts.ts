// The vault fronts: consumer apps (exchanges, wallets, fintechs) that put an
// on-chain vault behind their product (rails-ops ui-jobs 774; decision
// 0017 point 5). Rendered at /vaults/fronts and carried into the search index.
// ----------------------------------------------------------------------------
// HAND-KEPT, AND ADMITTED ONLY ON THE FRONT'S PAGE. A row enters when the
// front publishes the mapping on its page (a help article, a product page,
// its blog): decision 0017 point 5 lets a front's name render once the
// front publishes it, cited as theirs. A curator's page may support a row (the
// vault address where the front names the protocol and curator but not the
// address) and is cited beside the front's; it never admits one. Forums, news
// and aggregators are never a source.
//
// The rows are re-checked against their sources on a cadence: a row whose
// source page is gone comes out, and each source carries the date it was read.
//
// Whether Rails reads a row's vault is computed, never set here
// (lib/vaults/fronts-read.ts): from the vault's kind and chain, and for a kind
// Rails reads, from that roster.
//
// Pure: no imports, so the search's builder and the page both read it.

/** What the vault is, where a page or a reading says: MetaMorpho V1.x, Morpho
 *  Vault V2, Veda's BoringVault. Null where nothing says which. */
export type FrontVaultKind = "metamorpho" | "morpho-vault-v2" | "veda-boringvault";

/** Where the front's page says the position sits on chain. */
export type FrontPositionSits = "user's wallet" | "front's pooled address" | "not stated";

export interface FrontSource {
  url: string;
  /** "front": the front's page, which admits the row; "curator": a curator's
   *  page that supports it. */
  kind: "front" | "curator";
  /** The day the page was read, ISO date. */
  readOn: string;
}

export interface VaultFront {
  /** The front's name, as its page writes it. */
  front: string;
  /** The front's anchor on /vaults/fronts and its search group's key. */
  slug: string;
  /** The product the vault sits behind, as the front names it. */
  product: string;
  /** Null where the front's page names no chain. */
  chainId: number | null;
  chainLabel: string;
  /** The family as the cited page names it. */
  family: string;
  /** A version inferred beyond the page, with its basis; null where none. */
  familyBasis: string | null;
  /** Null where no page or reading says which; such a row has no address. */
  vaultKind: FrontVaultKind | null;
  /** Null where no page read publishes it. */
  vault: string | null;
  /** Who publishes the address: the front, or the curator's page. */
  vaultNamedBy: "front" | "curator";
  /** True where the product sits on more than one vault. */
  several?: true;
  positionSits: FrontPositionSits;
  /** The front's words for where the position sits; null where it says none. */
  positionQuote: string | null;
  /** The front's stated limits (where the product is not offered); null where none. */
  limits: string | null;
  sources: readonly FrontSource[];
}

const READ = "2026-11-19";

const STEAKHOUSE_PARTNERSHIPS: FrontSource = {
  url: "https://steakhouse.financial/docs/products/vault-products/partnership-vaults",
  kind: "curator",
  readOn: READ,
};

const BITGET: FrontSource = {
  url: "https://www.bitget.com/support/articles/12560603894348",
  kind: "front",
  readOn: READ,
};

const TREZOR: FrontSource = {
  url: "https://trezor.io/guides/sending-receiving-staking-funds/interacting-with-smart-contracts/stablecoin-yield-in-trezor-suite",
  kind: "front",
  readOn: READ,
};

const COINBASE_SOURCES: readonly FrontSource[] = [
  { url: "https://www.coinbase.com/blog/earn-competitive-yields-by-lending-your-usdc", kind: "front", readOn: READ },
  {
    url: "https://help.coinbase.com/en/coinbase/trading-and-funding/loan/lending-intro",
    kind: "front",
    readOn: READ,
  },
  STEAKHOUSE_PARTNERSHIPS,
];

const COINBASE_POSITION =
  "a smart contract wallet will be created by Coinbase to connect to the Morpho protocol via onchain vaults curated by Steakhouse Financial";

const COINBASE_LIMITS = "in the U.S. (excluding NY State) and additional countries";

const NOT_NAMED = "Not named";

/** Sorted by front, then product. */
export const VAULT_FRONTS: readonly VaultFront[] = [
  {
    front: "Bitget",
    slug: "bitget",
    product: "On-Chain Earn, USDC (Morpho x Arbitrum)",
    chainId: 42161,
    chainLabel: "Arbitrum",
    family: "Morpho",
    familyBasis: "Vault V2, by bytecode",
    vaultKind: "morpho-vault-v2",
    vault: "0xbeeff1D5dE8F79ff37a151681100B039661da518",
    vaultNamedBy: "curator",
    positionSits: "not stated",
    positionQuote: null,
    limits: null,
    sources: [BITGET, STEAKHOUSE_PARTNERSHIPS],
  },
  {
    front: "Bitget",
    slug: "bitget",
    product: "On-Chain Earn, USDT (Morpho x Arbitrum)",
    chainId: 42161,
    chainLabel: "Arbitrum",
    family: "Morpho",
    familyBasis: "Vault V2, by bytecode",
    vaultKind: "morpho-vault-v2",
    vault: "0xbeeff77CE5C059445714E6A3490E273fE7F2492F",
    vaultNamedBy: "curator",
    positionSits: "not stated",
    positionQuote: null,
    limits: null,
    sources: [BITGET, STEAKHOUSE_PARTNERSHIPS],
  },
  {
    front: "Coinbase",
    slug: "coinbase",
    product: "USDC lending, Core USDC Vault",
    chainId: 8453,
    chainLabel: "Base",
    family: "Morpho",
    familyBasis: "MetaMorpho V1, per Morpho's API",
    vaultKind: "metamorpho",
    vault: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
    vaultNamedBy: "curator",
    positionSits: "user's wallet",
    positionQuote: COINBASE_POSITION,
    limits: COINBASE_LIMITS,
    sources: COINBASE_SOURCES,
  },
  {
    front: "Coinbase",
    slug: "coinbase",
    product: "USDC lending, High Yield USDC Vault",
    chainId: 8453,
    chainLabel: "Base",
    family: "Morpho",
    familyBasis: "Vault V2, by bytecode",
    vaultKind: "morpho-vault-v2",
    vault: "0xbeeff2490FEffa212faC2f6553682C219E6a8845",
    vaultNamedBy: "curator",
    positionSits: "user's wallet",
    positionQuote: COINBASE_POSITION,
    limits: COINBASE_LIMITS,
    sources: COINBASE_SOURCES,
  },
  {
    front: "Kraken",
    slug: "kraken",
    product: "DeFi Earn",
    chainId: null,
    chainLabel: NOT_NAMED,
    family: "Veda BoringVault",
    familyBasis: null,
    vaultKind: "veda-boringvault",
    vault: null,
    vaultNamedBy: "front",
    several: true,
    positionSits: "user's wallet",
    positionQuote: "DeFi Earn relies on embedded wallets, which are fully controlled by the user.",
    limits: "not currently available in certain jurisdictions, such as the UK, Australia and UAE.",
    sources: [
      { url: "https://support.kraken.com/in/articles/defi-earn-faq", kind: "front", readOn: READ },
      { url: "https://blog.kraken.com/product/defi-earn/simplified-defi-rewards", kind: "front", readOn: READ },
    ],
  },
  {
    front: "Kraken",
    slug: "kraken",
    product: "Bitcoin (BTC) Vault",
    chainId: 57073,
    chainLabel: "Ink",
    family: "Veda BoringVault",
    familyBasis: null,
    vaultKind: "veda-boringvault",
    vault: null,
    vaultNamedBy: "front",
    positionSits: "user's wallet",
    positionQuote: "sent to your embedded wallet on the Ink network",
    limits: "BTC Vaults are not available in the UK, Australia, and the UAE.",
    sources: [{ url: "https://support.kraken.com/articles/bitcoin-vault", kind: "front", readOn: READ }],
  },
  {
    front: "Kraken",
    slug: "kraken",
    product: "xStocks Vaults (SPYx, QQQx, NVDAx)",
    chainId: 57073,
    chainLabel: "Ink",
    family: "Veda BoringVault",
    familyBasis: null,
    vaultKind: "veda-boringvault",
    vault: null,
    vaultNamedBy: "front",
    several: true,
    positionSits: "user's wallet",
    positionQuote: "your assets are held in a self-custodial embedded wallet",
    limits: "not available in the UK, US, Canada, or Australia, or in sanctioned countries.",
    sources: [{ url: "https://support.kraken.com/articles/xstocks-vaults", kind: "front", readOn: READ }],
  },
  {
    front: "Robinhood",
    slug: "robinhood",
    product: "Earn (USDG lending)",
    chainId: null,
    chainLabel: NOT_NAMED,
    family: "Morpho",
    familyBasis: "Vault V2, per Morpho's API",
    vaultKind: "morpho-vault-v2",
    vault: "0xBeEff033F34C046626B8D0A041844C5d1A5409dd",
    vaultNamedBy: "curator",
    positionSits: "user's wallet",
    positionQuote: "Any USDG that is actively lent is held in your self-custody wallet.",
    limits: "USDG is not available in New York.",
    sources: [
      { url: "https://robinhood.com/us/en/support/articles/robinhood-earn/", kind: "front", readOn: READ },
      STEAKHOUSE_PARTNERSHIPS,
    ],
  },
  {
    front: "Trezor",
    slug: "trezor",
    product: "Trezor Suite Earn, USDC",
    chainId: 1,
    chainLabel: "Ethereum",
    family: "Morpho",
    familyBasis: null,
    vaultKind: null,
    vault: null,
    vaultNamedBy: "front",
    positionSits: "user's wallet",
    positionQuote: "Your position is held as a vault token in your wallet.",
    limits: null,
    sources: [TREZOR],
  },
  {
    front: "Trezor",
    slug: "trezor",
    product: "Trezor Suite Earn, USDT",
    chainId: 1,
    chainLabel: "Ethereum",
    family: "Morpho",
    familyBasis: null,
    vaultKind: null,
    vault: null,
    vaultNamedBy: "front",
    positionSits: "user's wallet",
    positionQuote: "Your position is held as a vault token in your wallet.",
    limits: null,
    sources: [TREZOR],
  },
  {
    front: "Uniswap",
    slug: "uniswap",
    product: "Earn (USDC, USDT, ETH)",
    chainId: 1,
    chainLabel: "Ethereum",
    family: "Morpho",
    familyBasis: null,
    vaultKind: null,
    vault: null,
    vaultNamedBy: "front",
    several: true,
    positionSits: "user's wallet",
    positionQuote: "Earn is self-custodial, so your funds stay in your control from deposit to withdrawal",
    limits: null,
    sources: [{ url: "https://blog.uniswap.org/earn-is-now-live-on-uniswap", kind: "front", readOn: READ }],
  },
];

export const FRONTS_HREF = "/vaults/fronts";

/** A front's group on /vaults/fronts. */
export const frontHref = (slug: string) => `${FRONTS_HREF}#${slug}`;

// Aave's own vault layer on Ethereum — what the catalogue IS, and what attests it.
// ----------------------------------------------------------------------------
// Three ERC-4626 families, all deployed by Aave, all on Ethereum mainnet:
//
//   • sgho           — savings GHO: one vault, one address, named in the book.
//   • umbrella-stake — the staking layer that replaced the Safety Module: four
//     stake tokens, each named in the book AND enumerated on chain.
//   • stata          — static aTokens (`StataTokenV2`), an ERC-4626 wrapper over
//     one Aave V3 aToken, enumerated by a factory the book names.
//
// THIS FILE IS NOT A CENSUS, AND THAT IS THE POINT. lib/morpho-base/vault-catalog.ts
// is a log sweep frozen at a block — a FLOOR, because a MetaMorpho deployed
// without a factory emits no creation event and nothing would find it. Here the
// roster is answered by the protocol itself: `STATA_FACTORY.getStataTokens()` and
// `UMBRELLA.getStkTokens()` each return their whole family in one `eth_call`, so
// the directory reads the roster AT THE BLOCK IT READS THE FIGURES AT
// (lib/sources/chain/aave-ethereum-vault-directory.ts) and is complete at that
// block by construction rather than as of a census that has since drifted. A
// stata token deployed one block before the read is in the reading.
//
// So what is written down here is only what an enumerator cannot answer:
//
//   1. THE ENUMERATORS' OWN ADDRESSES — you have to know who to ask.
//   2. sGHO, which has no enumerator: one address-book constant.
//   3. THE ATTESTATION for each address the book names: which constant, in which
//      generated file, at which commit. That is what makes a catalogue entry
//      AAVE'S CLAIM rather than Rails' — the same role safe-global/safe-deployments
//      plays for the Safe tile on Base.
//
// The stata tokens are attested differently and the difference is stated rather
// than smoothed over: the book names the FACTORY, not the thirteen tokens, so a
// stata row's attestation is "the factory Aave publishes said so at this block",
// which is a claim about the factory plus a chain read, not a claim the book
// makes about that address. `aaveVaultAttestation()` returns which of the two a
// row has, and the receipts say so in those words.
//
// THE ADDRESSES ARE TRANSCRIBED FROM A PINNED COMMIT, not from a package: the
// npm package `@bgd-labs/aave-address-book` is frozen at 4.44.22 and the repo
// moved (`bgd-labs/aave-address-book` 301-redirects to `aave-dao/…`), so the
// citable artifact is the generated TypeScript at a sha. Every constant below is
// re-fetchable at that sha, and scripts/verify/verify-ethereum-vaults.mjs does
// exactly that — its expectation for these addresses comes from GitHub raw, not
// from this file.

/** Which of Aave's three vault families a row belongs to. The families differ
 *  in MECHANIC, not in venue: one saves, one wraps supply, one stakes against a
 *  deficit and can be slashed. The directory groups by it for that reason — a
 *  reader choosing "a USDC vault" must not mistake a slashable stake for
 *  wrapped supply. */
export type AaveVaultFamily = "sgho" | "umbrella-stake" | "stata";

/** The order the directory draws the families in: what a holder is most likely
 *  to be looking for first, and mechanically simplest first (sGHO is one hop
 *  from GHO; a stake token is three from USDC). */
export const AAVE_VAULT_FAMILY_ORDER: readonly AaveVaultFamily[] = ["sgho", "stata", "umbrella-stake"];

/** The commit of `aave-dao/aave-address-book` every constant below was
 *  transcribed from. Pinned, never a branch: the book is a moving generated
 *  file, and a constant that moved out from under this catalogue must show up
 *  as a disagreement rather than as a silent update. */
export const AAVE_ADDRESS_BOOK_COMMIT = "12963110f29699d214531b9ab4c7cfcec460c298";

/** `AaveV3Ethereum.STATA_FACTORY` — answers the whole stata roster in one call,
 *  `getStataTokens()`. */
export const AAVE_STATA_FACTORY = "0xcb0b5ca20b6c5c02a9a3b2ce433650768ed2974f";

/** `UmbrellaEthereum.UMBRELLA` — owns every stake token, answers the roster with
 *  `getStkTokens()` (note the spelling: `Stk`, not `Stake` — the guessed one
 *  reverts), and is the only address that can slash one. */
export const AAVE_UMBRELLA = "0xd400fc38ed4732893174325693a63c30ee3881a8";

/** One address the address book itself names, with the constant that names it.
 *  These are the rows whose membership needs no chain read to justify: Aave
 *  published the address. */
export interface AaveBookVault {
  /** Lowercased. */
  address: string;
  family: AaveVaultFamily;
  /** The constant, qualified by its generated file — quotable in a receipt. */
  bookConstant: string;
  /** The file under `src/ts/` the constant lives in. */
  bookFile: "GhoEthereum" | "UmbrellaEthereum" | "AaveV3Ethereum";
}

/** The five vaults Aave's address book names one by one: sGHO and the four
 *  Umbrella stake tokens. The thirteen stata tokens are NOT here — the book
 *  names their factory instead, and the factory names them (see the header). */
export const AAVE_ETHEREUM_BOOK_VAULTS: readonly AaveBookVault[] = [
  {
    address: "0xe1753f2e00940cc31213dd92013cf019dfe4ca1d",
    family: "sgho",
    bookConstant: "GhoEthereum.SGHO",
    bookFile: "GhoEthereum",
  },
  {
    address: "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6",
    family: "umbrella-stake",
    bookConstant: "UmbrellaEthereum.UMBRELLA_STAKE_ASSETS.STK_WA_USDC_V1",
    bookFile: "UmbrellaEthereum",
  },
  {
    address: "0xa484ab92fe32b143aee7019fc1502b1daa522d31",
    family: "umbrella-stake",
    bookConstant: "UmbrellaEthereum.UMBRELLA_STAKE_ASSETS.STK_WA_USDT_V1",
    bookFile: "UmbrellaEthereum",
  },
  {
    address: "0xaafd07d53a7365d3e9fb6f3a3b09ec19676b73ce",
    family: "umbrella-stake",
    bookConstant: "UmbrellaEthereum.UMBRELLA_STAKE_ASSETS.STK_WA_WETH_V1",
    bookFile: "UmbrellaEthereum",
  },
  {
    address: "0x4f827a63755855cdf3e8f3bcd20265c833f15033",
    family: "umbrella-stake",
    bookConstant: "UmbrellaEthereum.UMBRELLA_STAKE_ASSETS.STK_GHO_V1",
    bookFile: "UmbrellaEthereum",
  },
];

const BY_ADDRESS = new Map(AAVE_ETHEREUM_BOOK_VAULTS.map((v) => [v.address, v]));

/** How this address earns its place in the catalogue. `book` — Aave publishes
 *  the address under the named constant. `enumerator` — Aave publishes the
 *  contract that answered the roster, and the roster answer is a chain read at
 *  the directory's own block. Neither is stronger than the other by default and
 *  the receipts do not pretend one is: they are different claims, and a row says
 *  which one it rests on. */
export type AaveVaultAttestation =
  | { kind: "book"; constant: string; file: string }
  | { kind: "enumerator"; contract: string; call: string; constant: string };

/** The stata roster's attestation — one for the whole family, because the call
 *  answers the whole family. */
export const STATA_ENUMERATOR: AaveVaultAttestation = {
  kind: "enumerator",
  contract: AAVE_STATA_FACTORY,
  call: "StataTokenFactory.getStataTokens()",
  constant: "AaveV3Ethereum.STATA_FACTORY",
};

/** The Umbrella roster's attestation. Every stake token is ALSO named in the
 *  book, so `aaveVaultAttestation` prefers the book for those five rows and this
 *  is what the family line cites for the enumeration itself. */
export const UMBRELLA_ENUMERATOR: AaveVaultAttestation = {
  kind: "enumerator",
  contract: AAVE_UMBRELLA,
  call: "Umbrella.getStkTokens()",
  constant: "UmbrellaEthereum.UMBRELLA",
};

/** What attests this address, book first. Case-insensitive; a stata token falls
 *  through to its factory's enumerator, which is the claim it actually has. */
export function aaveVaultAttestation(address: string, family: AaveVaultFamily): AaveVaultAttestation {
  const named = BY_ADDRESS.get(address.toLowerCase());
  if (named) return { kind: "book", constant: named.bookConstant, file: named.bookFile };
  return family === "stata" ? STATA_ENUMERATOR : UMBRELLA_ENUMERATOR;
}

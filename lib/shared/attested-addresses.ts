// Which addresses may be NAMED, and on whose authority — the naming ladder.
// ----------------------------------------------------------------------------
// Half the money in Aave's vault layer on Ethereum is held by code rather than
// by a wallet (446 of 5,114 live positions, $255.4M, census 2026-09-10), and the
// biggest of those positions read as noise: "a contract, 1,096 bytes" says
// nothing about an address that is Aave's own GHO peg module parking its USDT
// reserves in Aave's own vault. This module is the part of the fix that can be
// written down: the addresses a protocol PUBLISHES, with the publication as the
// citation.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
// An address may be named only where the protocol that owns it publishes the
// address itself. Three rungs, in precedence order:
//
//   1. A PUBLISHED CONSTANT — the protocol's own address book names the address
//      under a constant, at a pinned commit. That is the table below.
//   2. AN ENUMERATOR THE BOOK NAMES — a contract the book publishes answers the
//      roster, so a module deployed after the pinned commit is still found. The
//      same grammar `lib/aave-vaults/vault-catalog.ts` uses for the stata
//      family: the book names the factory, the factory names the tokens, and a
//      row says which of the two claims it rests on.
//   3. A RELEASED SAFE SINGLETON — safe-global/safe-deployments. That rung is
//      implemented where the evidence is read, in
//      `lib/sources/chain/aave-ethereum-vault.ts`'s `SAFE_SINGLETONS`: a Safe is
//      proven by the address in its slot 0 (or embedded in its minimal-proxy
//      code) matching a released deployment. It stays there rather than moving
//      here — the table is the shape reader's own evidence and the Base reader
//      carries its own copy, and a rename sweep across both is a separate,
//      provable change.
//
// ⚠️ WHAT IS NOT A NAME, AND THE FIXTURE THAT PROVES THE REFUSAL. A verified
// source name in a block explorer is the name the DEPLOYER gave a file. It is
// not the protocol saying "this address is ours" — anyone can deploy a contract
// under any name. The census's own refusal fixture is
// `0xde6e08ac208088cc62812ba30608d852c6b0ecbc`, which holds 16.9% of waEthUSDC
// ($12.41M): its implementation is verified in a block explorer under a
// third-party lending protocol's own contract name, AND it was deployed by an
// externally owned account, so no factory or registry of that protocol
// enumerates it. Every rung above refuses it, and its page must name no protocol
// at all — `scripts/verify/verify-vault-holder-identity.mjs` asserts the absence.
// A deployer is not an attestation either: a name inferred from who deployed
// something is a guess wearing a citation's clothes.
//
// So: no label service, no verified-source label, no deployer, no resemblance to
// an ABI, no "this looks like X". Where no rung answers, the page keeps saying
// what it can read — a proxy to an address, a contract of N bytes — and says out
// loud that nothing here names it.

import { AAVE_ADDRESS_BOOK_COMMIT } from "@/lib/aave-vaults/vault-catalog";

/** One address a protocol publishes, with the publication that names it. Every
 *  field is quotable in a receipt: a reader can fetch the same file at the same
 *  commit, or make the same enumerator call, and get the same answer. */
export interface AttestedAddress {
  /** Lowercased. */
  address: string;
  /** Whose claim this is, in the words a page uses for it. */
  publisher: "Aave";
  /** The constant that names the address, qualified by its generated file. */
  constant: string;
  /** The file under `src/ts/` the constant lives in. */
  file: string;
  /** The commit the constant was transcribed from — pinned, never a branch. */
  commit: string;
  /** Which rung: the book names the address, or a contract the book names
   *  returned it. Neither is stronger by default and a page says which. */
  via: "book" | "enumerator";
  /** The enumerator, where `via` is "enumerator": what was asked, of whom. */
  enumerator?: { contract: string; call: string; constant: string };
  /** What the publication's OWN vocabulary calls this kind of contract — the
   *  book's words expanded, never a description of what it does for a user. The
   *  file is `GhoEthereum.ts` and the constant is `GSM_USDT`, so "GHO Stability
   *  Module" is reading the name rather than adding to it. */
  what: string;
}

/** `GhoEthereum.GSM_REGISTRY` — the address book names it, and it answers the
 *  GSM roster in one call, the way `STATA_FACTORY` answers the stata roster. A
 *  GSM deployed after the pinned commit is found through this and attested as
 *  `enumerator` rather than going unnamed. */
export const AAVE_GSM_REGISTRY = "0x167527db01325408696326e3580cd8e55d99dc1a";
export const AAVE_GSM_REGISTRY_CONSTANT = "GhoEthereum.GSM_REGISTRY";
/** The call, as a receipt quotes it. */
export const AAVE_GSM_LIST_CALL = "GsmRegistry.getGsmList()";

/** What a GSM is, in the book's own vocabulary: GHO's Stability Module — the
 *  peg facility that swaps GHO against a reserve at a set price. The page never
 *  says more than this about one. */
const GSM_WHAT = "a GHO Stability Module — Aave's own peg facility for one reserve";

/** The addresses Aave's address book names one by one, as of the pinned commit,
 *  that hold positions in this section's vaults. NOT a list of everything the
 *  book names: the catalogue's own five vault constants live in
 *  `lib/aave-vaults/vault-catalog.ts` (a vault is a subject here, not just a
 *  holder) and are attested there by `aaveVaultAttestation`.
 *
 *  The two GSMs are here because they are HOLDER identities and nothing else: a
 *  GSM is not a vault, has no page of its own in this section, and
 *  `/ethereum/aave/vaults/0x8822…` must keep answering 404. */
export const AAVE_BOOK_ADDRESSES: readonly AttestedAddress[] = [
  {
    address: "0x3a3868898305f04bec7fea77becff04c13444112",
    publisher: "Aave",
    constant: "GhoEthereum.GSM_USDC",
    file: "GhoEthereum",
    commit: AAVE_ADDRESS_BOOK_COMMIT,
    via: "book",
    what: GSM_WHAT,
  },
  {
    address: "0x882285e62656b9623af136ce3078c6bdcc33f5e3",
    publisher: "Aave",
    constant: "GhoEthereum.GSM_USDT",
    file: "GhoEthereum",
    commit: AAVE_ADDRESS_BOOK_COMMIT,
    via: "book",
    what: GSM_WHAT,
  },
];

const BY_ADDRESS = new Map(AAVE_BOOK_ADDRESSES.map((a) => [a.address, a]));

/** Rung 1, and a pure lookup — no chain read, so any surface can use it,
 *  including a listing card that renders twenty rows without making a call.
 *  Case-insensitive. Null means this table does not name the address, which is
 *  not the same as the address having no name: rungs 2 and 3 are reads. */
export function attestedAddress(address: string): AttestedAddress | null {
  return BY_ADDRESS.get(address.toLowerCase()) ?? null;
}

/** Rung 2 — an address the GSM registry returned that the book does not name
 *  one by one (a GSM deployed after the pinned commit). The claim is weaker and
 *  different, and says so: Aave publishes the registry, and the registry
 *  returned this address at the block the caller read at. */
export function attestedByGsmRegistry(address: string): AttestedAddress {
  return {
    address: address.toLowerCase(),
    publisher: "Aave",
    constant: AAVE_GSM_REGISTRY_CONSTANT,
    file: "GhoEthereum",
    commit: AAVE_ADDRESS_BOOK_COMMIT,
    via: "enumerator",
    enumerator: {
      contract: AAVE_GSM_REGISTRY,
      call: AAVE_GSM_LIST_CALL,
      constant: AAVE_GSM_REGISTRY_CONSTANT,
    },
    what: GSM_WHAT,
  };
}

/** How this address earns its name, in one clause a receipt can quote. The two
 *  rungs are different claims and the clause says which — the same distinction
 *  `attestationClause` draws for a catalogue row. */
export function attestedClause(a: AttestedAddress): string {
  return a.via === "book"
    ? `${a.publisher} publishes this address as \`${a.constant}\` in its own address book (\`aave-dao/aave-address-book\`, \`src/ts/${a.file}.ts\`, commit ${a.commit.slice(0, 10)})`
    : `${a.publisher} publishes \`${a.enumerator?.constant}\`, and that contract's own \`${a.enumerator?.call}\` returned this address`;
}

/** The same claim in PROSE, for the page's face — no backticks, because a
 *  sentence a reader reads is not a receipt's markdown. The receipt keeps the
 *  code-formatted form above. */
export function attestedFaceClause(a: AttestedAddress): string {
  return a.via === "book"
    ? `${a.publisher} publishes this address as ${a.constant} in its own address book at commit ${a.commit.slice(0, 10)}`
    : `${a.publisher} publishes ${a.enumerator?.constant}, and that contract's own ${a.enumerator?.call} returned this address`;
}

/** The constant's own short name — `GSM_USDT` out of `GhoEthereum.GSM_USDT`.
 *  What a card has room for; the qualified constant and the commit ride the
 *  receipt. */
export function attestedShortName(a: AttestedAddress): string {
  const parts = a.constant.split(".");
  return parts[parts.length - 1];
}

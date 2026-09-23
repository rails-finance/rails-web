// What the Aave-on-Ethereum vault lookups accept, and what they do with it.
// SERVER-SIDE.
// ----------------------------------------------------------------------------
// One module, two surfaces, and they accept different things because they ask
// different questions:
//
//   • the roster's own lookup, retired with the find door — which of Aave's vaults does
//     this address hold? Three accepted forms: a 20-byte address, an ENS name
//     resolved on mainnet through the Universal Resolver (lib/ens/resolve-ens.ts),
//     or a TRANSACTION — a bare hash, or an `etherscan.io/tx/…` link — from
//     which the holder address is found (lib/vaults/resolve-tx-holder.ts).
//   • `/ethereum/aave/vaults/<vault>?holder=` — ONE VAULT. What does this address
//     hold of it? An address or an ENS name, and nothing else: a transaction
//     names a receipt whose logs may offer none, one or several addresses, and
//     a page already fixed on one vault has nowhere to put "or one of these
//     three". So `acceptsTransaction` is false there and a hash is stated as an
//     input this surface does not take, rather than silently reading nothing.
//
// A TRANSACTION IS CLASSIFIED HERE BUT NOT RESOLVED HERE: it does not name an
// address by itself. The directory page resolves it and redirects when there is
// exactly one candidate; the API routes refuse it, because they answer questions
// about one address.
//
// THE EXPLORER HOST IS THIS CHAIN'S. `txHashFromInput` takes the chain, so a
// `basescan.org/tx/…` link typed here is not a transaction — it names one on
// another chain, and Ethereum has no receipt for it. A bare 32-byte hash is
// accepted, because a hash carries no venue.
//
// NO BASENAMES LANE. `name.base.eth` is a registry on Base and resolving it here
// would answer with an address from another chain's registry; every `.eth` name
// goes through mainnet's resolver, which is the one that governs on chain 1.
//
// WHAT IS *NOT* DECIDED HERE: whether the typed address is itself one of Aave's
// vaults. The Base sibling can answer that synchronously because its catalogue
// is a list in the repo; Aave's catalogue is a CHAIN READ, so the answer belongs
// to the read that makes it — the holder sweep returns `catalogued`, and the
// directory page redirects on it. Deciding it here from a hard-coded list would
// be a second, staler roster.
//
// THE OUTCOMES ARE KEPT SEPARATE, because they are different statements:
//
//   • invalid     — the text is none of the accepted forms. A fact about the
//                   input; nothing was looked up.
//   • unresolved  — a well-formed `.eth` name that mainnet has no address for.
//   • resolved    — an address to read with, with the name that produced it
//                   riding along so a page can show what was typed beside what
//                   it meant.
//
// Collapsing the first two into one "not found" would state something the read
// never established.

import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import { txHashFromInput } from "@/lib/vaults/resolve-tx-holder";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ENS_NAME = /^[^\s/]+\.eth$/i;

export type AaveVaultHolderInputKind = "empty" | "address" | "ens" | "txhash" | "invalid";

/** Which lanes the calling surface offers. The default is the narrow pair — an
 *  address or a name — so a new caller cannot acquire the transaction lane by
 *  forgetting to say anything. */
export interface AaveVaultHolderOptions {
  /** True on the directory, which can offer several candidate addresses; false
   *  on a single vault's page, which cannot. */
  acceptsTransaction?: boolean;
}

export interface AaveVaultHolderLookup {
  /** What the reader typed, trimmed — echoed back beside any message. */
  typed: string;
  kind: AaveVaultHolderInputKind;
  /** The address to read with, or null when there is none to read. */
  address: string | null;
  /** The transaction hash a `txhash` input named, lowercased — for the page to
   *  resolve. Null for every other kind. */
  txHash: string | null;
  /** The name that produced `address`, when a name was typed and resolved. */
  ensName: string | null;
  /** Set when no address could be reached: `"invalid"` (the text is none of the
   *  accepted forms) or `"unresolved"` (a real `.eth` name mainnet has no
   *  address for). */
  error: "invalid" | "unresolved" | null;
}

/** Classify the input without touching the network. */
export function aaveVaultHolderInputKind(
  raw: string | null | undefined,
  options: AaveVaultHolderOptions = {},
): AaveVaultHolderInputKind {
  const value = (raw ?? "").trim();
  if (!value) return "empty";
  if (ADDRESS.test(value)) return "address";
  if (options.acceptsTransaction && txHashFromInput(value, MAINNET_CHAIN_ID)) return "txhash";
  if (ENS_NAME.test(value)) return "ens";
  return "invalid";
}

/** Resolve a typed `?holder=` to an address, or to the reason there is none.
 *  Never throws: a lookup that fails resolves to `unresolved`, which the page
 *  states rather than rendering an empty holder section. */
export async function resolveAaveVaultHolder(
  raw: string | null | undefined,
  options: AaveVaultHolderOptions = {},
): Promise<AaveVaultHolderLookup> {
  const typed = (raw ?? "").trim();
  const kind = aaveVaultHolderInputKind(typed, options);
  const base = { typed, kind, address: null, txHash: null, ensName: null, error: null } as AaveVaultHolderLookup;
  if (kind === "empty") return base;
  if (kind === "address") return { ...base, address: typed.toLowerCase() };
  if (kind === "invalid") return { ...base, error: "invalid" };
  if (kind === "txhash") return { ...base, txHash: txHashFromInput(typed, MAINNET_CHAIN_ID) };
  const resolved = await resolveEnsAddress(typed);
  if (!resolved) return { ...base, error: "unresolved" };
  return { ...base, address: resolved.toLowerCase(), ensName: typed };
}

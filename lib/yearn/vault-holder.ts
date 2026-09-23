// What the Yearn V3 holder segment accepts, and what it does with it.
// SERVER-SIDE.
// ----------------------------------------------------------------------------
// `/ethereum/yearn/vaults/<vault>/<holder>` asks ONE question: what does this
// address hold of this vault, and how did it get there? So the segment takes
// exactly two forms — a 20-byte address, or an ENS name resolved on mainnet
// through the Universal Resolver (lib/ens/resolve-ens.ts).
//
// NO TRANSACTION LANE. Aave's vault DIRECTORY takes a transaction hash and
// resolves it to a holder, because a directory can offer several candidates. A
// page already fixed on one vault has nowhere to put "or one of these three",
// so a hash here is stated as an input this surface does not take rather than
// silently read as nothing.
//
// NO BASENAMES LANE either. `name.base.eth` is a registry on Base, and
// resolving it here would answer with an address from another chain's registry.
// Every `.eth` name goes through mainnet's resolver, which is the one that
// governs on chain 1.
//
// THE OUTCOMES ARE KEPT SEPARATE, because they are different statements:
//
//   • invalid     — the text is neither accepted form. A fact about the input;
//                   nothing was looked up.
//   • unresolved  — a well-formed `.eth` name that mainnet has no address for.
//   • resolved    — an address to read with, with the name that produced it
//                   riding along so the page can show what was typed beside
//                   what it meant.
//
// Collapsing the first two into one "not found" would state something the read
// never established. An address that holds NOTHING is none of the three: it is
// a resolved address, and what it holds is a reading the page states.

import { resolveEnsAddress } from "@/lib/ens/resolve-ens";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ENS_NAME = /^[^\s/]+\.eth$/i;

export type YearnVaultHolderInputKind = "empty" | "address" | "ens" | "invalid";

export interface YearnVaultHolderLookup {
  /** What the reader typed, trimmed — echoed back beside any message. */
  typed: string;
  kind: YearnVaultHolderInputKind;
  /** The address to read with, lowercased, or null when there is none. */
  address: string | null;
  /** The name that produced `address`, when a name was typed and resolved. */
  ensName: string | null;
  error: "invalid" | "unresolved" | null;
}

/** Classify the input without touching the network. */
export function yearnVaultHolderInputKind(raw: string | null | undefined): YearnVaultHolderInputKind {
  const value = (raw ?? "").trim();
  if (!value) return "empty";
  if (ADDRESS.test(value)) return "address";
  if (ENS_NAME.test(value)) return "ens";
  return "invalid";
}

/** Resolve a typed holder segment to an address, or to the reason there is
 *  none. Never throws: a lookup that fails resolves to `unresolved`, which the
 *  page states rather than rendering an empty holder section. */
export async function resolveYearnVaultHolder(raw: string | null | undefined): Promise<YearnVaultHolderLookup> {
  const typed = (raw ?? "").trim();
  const kind = yearnVaultHolderInputKind(typed);
  const base: YearnVaultHolderLookup = { typed, kind, address: null, ensName: null, error: null };
  if (kind === "empty") return base;
  if (kind === "address") return { ...base, address: typed.toLowerCase() };
  if (kind === "invalid") return { ...base, error: "invalid" };
  const resolved = await resolveEnsAddress(typed);
  if (!resolved) return { ...base, error: "unresolved" };
  return { ...base, address: resolved.toLowerCase(), ensName: typed };
}

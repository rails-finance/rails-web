// How the MakerDAO vault page's chips name the parties to a vault's
// ownership. Every name comes from the known-contracts register or from the
// transaction read (lib/sources/chain/makerdao-tx-context.ts); an address with
// neither is stated as an address.

import type { MakerTxContext } from "@/lib/makerdao/chain-history-types";
import type { MakerOwnerRef } from "@/lib/makerdao/vault-history";
import { knownContract } from "@/lib/makerdao/known-contracts";

export const shortAddr = (a?: string | null): string => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

/** A chip's text for an owner: a known contract's short name, an Instadapp
 *  account with its address, else the account behind the proxy. */
export function ownerChipText(ref: MakerOwnerRef, ctx?: MakerTxContext): { name?: string; address: string } {
  const holder = ref.holder ?? ref.owner ?? "";
  const known = knownContract(holder);
  if (known) return { name: known.short, address: holder };
  const party = holder ? ctx?.parties[holder] : undefined;
  if (party?.kind === "instadapp-account") return { name: `Instadapp account ${shortAddr(holder)}`, address: holder };
  return { address: ref.owner ?? holder };
}

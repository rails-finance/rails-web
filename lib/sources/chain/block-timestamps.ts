// Block timestamps for a handful of blocks (a vault's configuration notes,
// whose loaders name the block alone). SERVER-ONLY.
//
// A block's timestamp never changes, so every answer is kept for the process;
// a block that does not answer is left out, never a placeholder.

import { chainClient } from "@/lib/sources/chain/rpc";
import { readBlockTimes } from "@/lib/sources/chain/vault-block-reads";
import type { ChainId } from "@/lib/shared/chains";
import type { Provenance } from "@/components/shared/provenance";
import type { FlowChange } from "@/lib/shared/flows-changes";
import type { VaultNote } from "@/lib/shared/vault-holder-timeline";
import { vaultFlowChanges } from "@/lib/vaults/flows-changes";

const kept = new Map<string, number>();

export async function blockTimestamps(chainId: ChainId, blocks: readonly number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const want = [...new Set(blocks)].filter((b) => {
    const t = kept.get(`${chainId}:${b}`);
    if (t != null) out.set(b, t);
    return t == null;
  });
  if (want.length === 0) return out;
  // rails-server's stored block times first (Ethereum and Base).
  if (chainId === 1 || chainId === 8453) {
    for (const [b, t] of await readBlockTimes(chainId, want).catch(() => new Map<number, number>())) {
      if (!(t > 0)) continue;
      kept.set(`${chainId}:${b}`, t);
      out.set(b, t);
    }
    want.splice(0, want.length, ...want.filter((b) => !out.has(b)));
    if (want.length === 0) return out;
  }
  const client = chainClient(chainId);
  const answers = await Promise.all(
    want.map((b) =>
      client
        .getBlock({ blockNumber: BigInt(b) })
        .then((x) => Number(x.timestamp))
        .catch(() => null),
    ),
  );
  answers.forEach((t, i) => {
    if (t == null || !(t > 0)) return;
    kept.set(`${chainId}:${want[i]}`, t);
    out.set(want[i], t);
  });
  return out;
}

/** A vault's configuration notes inside a holder's life as protocol changes
 *  (lib/vaults/flows-changes.ts): the timestamps of the notes at or after the
 *  holder's first event, read here; the earlier ones give the values before. */
export async function vaultLifeChanges(
  chainId: ChainId,
  notes: readonly VaultNote[],
  events: readonly { blockNumber: number }[],
  prov: (note: VaultNote) => Provenance,
): Promise<FlowChange[]> {
  if (events.length === 0 || notes.length === 0) return [];
  const first = events.reduce((m, e) => Math.min(m, e.blockNumber), Infinity);
  const inLife = notes.filter((n) => n.blockNumber >= first && !(n.timestamp > 0)).map((n) => n.blockNumber);
  const times = await blockTimestamps(chainId, inLife);
  return vaultFlowChanges(notes, times, prov).filter((c) => c.block >= first);
}

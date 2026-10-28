// A vault's configuration notes as protocol changes on the Lifetime flows
// events row (rails-ops reference/lifetime-price-chart.md, ruling 10): sGHO's
// target rate and the Umbrella cooldown and unstake window on Ethereum, a
// MetaMorpho vault's fee, name and symbol on Base. The loaders read every
// note over the vault's whole life, so the value before a set is the last
// note of its kind. A MetaMorpho vault is created with no fee, so its first
// SetFee moves the fee from 0; a name or symbol set at creation is not read.
// The Umbrella terms' first logs are the token's initialisation (from 0, at
// deployment, before any holder) and are not changes. `times` holds each
// note's block timestamp (the loaders name the block alone); a note without
// one is left out.

import type { Provenance } from "@/components/shared/provenance";
import { durationWords, flowChange, pctWords, type FlowChange } from "@/lib/shared/flows-changes";
import type { VaultNote } from "@/lib/shared/vault-holder-timeline";

type Kind = VaultNote["kind"];

const NAME: Record<Kind, string> = {
  "target-rate": "Target rate",
  "cooldown-config": "Cooldown",
  "unstake-window-config": "Redemption window",
  fee: "Performance fee",
  "vault-name": "Name",
  "vault-symbol": "Symbol",
};

/** The value a note sets, printed, and the value before where the log states it. */
function valuesOf(note: VaultNote): { to: string; from?: string } {
  const f = note.fields;
  switch (note.kind) {
    case "target-rate":
      return { to: pctWords(Number(f.newRate) / 100) };
    case "cooldown-config":
      return { to: durationWords(Number(f.newCooldown)), from: durationWords(Number(f.oldCooldown)) };
    case "unstake-window-config":
      return { to: durationWords(Number(f.newUnstakeWindow)), from: durationWords(Number(f.oldUnstakeWindow)) };
    case "fee":
      return { to: pctWords(Number(f.newFee) / 1e16) };
    case "vault-name":
      return { to: `“${f.name}”` };
    case "vault-symbol":
      return { to: `“${f.symbol}”` };
  }
}

export function vaultFlowChanges(
  notes: readonly VaultNote[],
  times: ReadonlyMap<number, number>,
  prov: (note: VaultNote) => Provenance,
): FlowChange[] {
  const last = new Map<Kind, string>();
  const out: FlowChange[] = [];
  for (const note of [...notes].sort((a, b) => a.blockNumber - b.blockNumber)) {
    const v = valuesOf(note);
    const init =
      (note.kind === "cooldown-config" && Number(note.fields.oldCooldown) === 0) ||
      (note.kind === "unstake-window-config" && Number(note.fields.oldUnstakeWindow) === 0);
    const before = v.from ?? last.get(note.kind) ?? (note.kind === "fee" ? pctWords(0) : null);
    last.set(note.kind, v.to);
    if (init) continue;
    const ts = note.timestamp > 0 ? note.timestamp : times.get(note.blockNumber);
    if (ts == null) continue;
    out.push(
      flowChange({
        ts,
        block: note.blockNumber,
        txHash: note.txHash.toLowerCase(),
        name: NAME[note.kind],
        from: before,
        to: v.to,
        prov: prov(note),
      }),
    );
  }
  return out;
}

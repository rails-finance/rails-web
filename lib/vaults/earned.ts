// Earned (decision 0048, rails-ops ui-jobs 410): the claim now + every asset
// amount that left − every asset amount that came in, in the vault's asset, over
// the rows the Lifetime flows panel draws (lib/vaults/vault-flows.ts). A leg is
// STATED (the `assets` word of the ERC-4626 Deposit or Withdraw) or READ (the
// shares × the share price read at the leg's own block: a transfer, or a mint
// or burn emitted without its event). A figure only where the replay equals
// `balanceOf` to the wei (the caller passes `replayed`, the economics gate) and
// every read leg's price was read at its block. Imports nothing at runtime, so
// scripts/test reads it.

import type { VaultHolderEvent } from "@/lib/shared/vault-holder-timeline";

/** The panel's buckets, by row kind: which side a leg is on. */
const DIR: Partial<Record<VaultHolderEvent["kind"], "in" | "out">> = {
  deposit: "in",
  "transfer-in": "in",
  withdrawal: "out",
  "transfer-out": "out",
};

/** One leg of Earned. */
export interface VaultEarnedLeg {
  block: number;
  tx: string;
  kind: VaultHolderEvent["kind"];
  dir: "in" | "out";
  /** Asset units, raw. */
  raw: string;
  basis: "stated" | "read";
}

/** Earned, or the reason there is no figure and the block that did not answer. */
export type VaultEarned =
  | {
      status: "ok";
      /** Signed, asset units, raw. */
      earnedRaw: string;
      claimRaw: string;
      inRaw: string;
      outRaw: string;
      /** The legs in block order; `legsOmitted` more where the life is long. */
      legs: VaultEarnedLeg[];
      legsOmitted: number;
    }
  | { status: "carried"; block: number }
  | { status: "unreplayed"; block: number }
  | { status: "unread"; block: number };

/** What the history adds to the holder card: Earned, and First seen where no
 *  census states it. */
export interface VaultHoldingHistory {
  earned: VaultEarned;
  /** The holder's first row; null with no rows. */
  firstSeen: { block: number; at: number | null } | null;
}

/** The card's history from the page's whole-life rows. */
export function vaultHoldingHistory(
  events: VaultHolderEvent[],
  o: { shareDecimals: number; claimRaw: string | null; blockNumber: number; replayed: boolean },
): VaultHoldingHistory {
  let first: VaultHolderEvent | null = null;
  for (const e of events)
    if (
      !first ||
      e.blockNumber < first.blockNumber ||
      (e.blockNumber === first.blockNumber && e.logIndex < first.logIndex)
    )
      first = e;
  return {
    earned: vaultEarned(events, o),
    firstSeen: first ? { block: first.blockNumber, at: first.timestamp > 0 ? first.timestamp : null } : null,
  };
}

/** How many legs a receipt lists; a longer life names the count of the rest. */
const EARNED_RECEIPT_LEGS = 40;

export function vaultEarned(
  events: VaultHolderEvent[],
  o: { shareDecimals: number; claimRaw: string | null; blockNumber: number; replayed: boolean },
): VaultEarned {
  if (!o.replayed || events.length === 0) return { status: "unreplayed", block: o.blockNumber };
  if (o.claimRaw == null) return { status: "unread", block: o.blockNumber };
  const rows = [...events].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  const unit = BigInt(10) ** BigInt(o.shareDecimals);
  const legs: VaultEarnedLeg[] = [];
  let into = BigInt(0);
  let out = BigInt(0);
  for (const e of rows) {
    const dir = DIR[e.kind];
    if (!dir) continue;
    const stated = e.assets != null && (e.kind === "deposit" || e.kind === "withdrawal");
    let raw: bigint;
    if (stated) raw = BigInt(e.assets!);
    else {
      if (e.sharePriceAtBlock == null) return { status: "carried", block: e.blockNumber };
      const shares = BigInt(e.sharesDelta);
      raw = ((shares < BigInt(0) ? -shares : shares) * BigInt(e.sharePriceAtBlock)) / unit;
    }
    if (dir === "in") into += raw;
    else out += raw;
    legs.push({
      block: e.blockNumber,
      tx: e.txHash,
      kind: e.kind,
      dir,
      raw: raw.toString(),
      basis: stated ? "stated" : "read",
    });
  }
  const claim = BigInt(o.claimRaw);
  return {
    status: "ok",
    earnedRaw: (claim + out - into).toString(),
    claimRaw: o.claimRaw,
    inRaw: into.toString(),
    outRaw: out.toString(),
    legs: legs.slice(0, EARNED_RECEIPT_LEGS),
    legsOmitted: Math.max(0, legs.length - EARNED_RECEIPT_LEGS),
  };
}

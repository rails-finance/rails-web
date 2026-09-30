"use client";

// The "by <actor>" chip — who executed an event that the position owner did
// not. One component, because two headers render it: the shared ChainTruthRow
// (11 explorers, via `spec.externalActor`) and Aave V4's own richer header,
// which used to hand-roll a copy of the same JSX.
//
// The address reverse-resolves to a primary ENS name. `useEnsName` batches
// per tick and caches per session, so a timeline where one operator ran every
// row costs a single lookup, not one per row. Before it lands — and where no
// name exists — the chip shows the truncated address, the same degrade the
// owner pills use: no skeleton, no flash, just a re-render when the name
// arrives.
//
// The resolved name also becomes the receipt's traced VALUE (following the
// neutral `party` chip's precedent), so the receipt reads back what the reader
// actually sees. The raw address is not lost: externalActorProv carries it as
// an input, beside the tx sender and contract caller it is judged against.

import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import type { ReactNode } from "react";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { RevealTip } from "@/components/shared/reveal-tip";

export function ExternalActorChip({
  address,
  prov,
  tip,
  prefix = "by",
}: {
  address: string;
  prov: Provenance;
  tip?: ReactNode;
  /** The word before the address; "sent by" where a contract acted for it. */
  prefix?: string;
}) {
  const name = useEnsName(address);
  const label = (
    <span className="font-medium text-pink-600 dark:text-pink-400">
      {name ?? `${address.slice(0, 6)}…${address.slice(-4)}`}
    </span>
  );
  return (
    <Prov info={prov} value={name ?? address} className="inline-flex items-center gap-1 text-sm">
      <span className="text-rb-500">{prefix}</span>
      {tip ? <RevealTip tip={tip}>{label}</RevealTip> : label}
    </Prov>
  );
}

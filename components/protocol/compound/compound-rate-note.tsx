"use client";

// The market's rates at both ends of a row's interest line: after the
// account's previous event and just before this one. Comet charges and pays
// at the rate its utilisation gives at each moment, so a balance's growth
// between two events is an average of the rates in between, and these two
// reads bracket it (app/api/chain/compound/rates).

import { useEffect, useState } from "react";
import { compoundDeploymentOfChain } from "@/lib/compound/deployments";
import { createReadStore } from "./read-store";

interface Rate {
  utilization: number;
  supply: number;
  borrow: number;
}

const pct = (f: number) => `${(f * 100).toFixed(2)}%`;

/** The two reads, as the sheet's Borrow rate states them. */
export interface CompoundRates {
  then: Rate;
  now: Rate;
  /** The block before this event, where `now` is read. */
  readBlock: number;
}

const store = createReadStore<CompoundRates>();
const keyOf = (chainId: number | undefined, marketKey: string, prevBlock: number, block: number) =>
  `${chainId ?? 1}:${marketKey}:${prevBlock}:${block}`;

/** The rates the card's note read, once it has (the note mounts while the
 *  card is open); null before. */
export function useCompoundRates(
  chainId: number | undefined,
  marketKey: string,
  prevBlock: number | undefined,
  block: number | undefined,
): CompoundRates | null {
  return store.use(prevBlock != null && block != null ? keyOf(chainId, marketKey, prevBlock, block) : null);
}

export function CompoundRateNote({
  chainId,
  marketKey,
  prevBlock,
  block,
  hasAverage,
}: {
  chainId?: number;
  /** The row states the average rate its interest works out to. */
  hasAverage: boolean;
  marketKey: string;
  /** The block of the account's previous event in this market. */
  prevBlock: number;
  /** This event's block: the rate is read at the block before it. */
  block: number;
}) {
  const [rates, setRates] = useState<Record<number, Rate> | null>(null);
  const readBlock = block - 1;

  useEffect(() => {
    if (!(prevBlock > 0) || !(readBlock >= prevBlock)) return;
    const ac = new AbortController();
    const deployment = compoundDeploymentOfChain(chainId);
    fetch(`/api/chain/compound/rates?deployment=${deployment}&market=${marketKey}&blocks=${prevBlock},${readBlock}`, {
      signal: ac.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { rates?: Record<number, Rate> } | null) => {
        if (d?.rates) setRates(d.rates);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [chainId, marketKey, prevBlock, readBlock]);

  const then = rates?.[prevBlock];
  const now = rates?.[readBlock];
  useEffect(() => {
    if (then && now) store.set(keyOf(chainId, marketKey, prevBlock, block), { then, now, readBlock });
  }, [then, now, chainId, marketKey, prevBlock, block, readBlock]);
  if (!then || !now) return null;
  return (
    <p className="px-5 pb-2 text-xs leading-relaxed text-rb-500" data-rate-note="">
      The market&rsquo;s rates after the previous event: lenders earned {pct(then.supply)} a year and borrowers paid{" "}
      {pct(then.borrow)}, with {pct(then.utilization)} of the market borrowed. Just before this event (block{" "}
      {readBlock.toLocaleString("en-US")}): {pct(now.supply)} and {pct(now.borrow)}, with {pct(now.utilization)}{" "}
      borrowed. Rates rise and fall with the share borrowed
      {hasAverage ? ", so the yearly figure above is an average of the rates between the two events." : "."}
    </p>
  );
}

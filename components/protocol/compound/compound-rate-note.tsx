"use client";

// The market's rates at both ends of a row's interest line: after the
// account's previous event and just before this one. Comet charges and pays
// at the rate its utilisation gives at each moment, so a balance's growth
// between two events is an average of the rates in between, and these two
// reads bracket it (app/api/chain/compound/rates).

import { useEffect, useState } from "react";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";

interface Rate {
  utilization: number;
  supply: number;
  borrow: number;
}

const pct = (f: number) => `${(f * 100).toFixed(2)}%`;

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
    const deployment = chainId === BASE_CHAIN_ID ? "base" : "ethereum";
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

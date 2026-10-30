"use client";

// A Liquity V2 branch's redemption pace over a Trove's life, V2's
// (/api/liquity-v2/redemption-pace) or a fork's (/api/{ebisu,asymmetry,
// basedollar}/redemption-pace; lib/liquity-v2/redemption-pace.ts), for the
// protocol activity chart. Null while the read is on its way, where it failed,
// or with no source or range; the page then draws no activity chart. One read
// per source and range a page load.

import { useEffect, useState } from "react";
import type { ProtocolActivity } from "@/lib/shared/flows-pace";
import { branchRedemptionPace, isoDay, paceRange, type PaceSource } from "@/lib/liquity-v2/redemption-pace";

const cache = new Map<string, Promise<ProtocolActivity | null>>();

function load(src: PaceSource, from: number, to: number): Promise<ProtocolActivity | null> {
  const key = `${src.path}:${src.branch}:${from}:${to}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`${src.path}?branch=${encodeURIComponent(src.branch)}&from=${isoDay(from)}&to=${isoDay(to)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => branchRedemptionPace(src, body))
      .catch(() => null);
    p.then((v) => {
      if (v == null) cache.delete(key);
    });
    cache.set(key, p);
  }
  return p;
}

/** The pace from the life's first day to its last (UTC day numbers). */
export function useRedemptionPace(
  src: PaceSource | null,
  firstDay: number | null,
  lastDay: number | null,
): ProtocolActivity | null {
  const range = firstDay != null && lastDay != null ? paceRange(firstDay, lastDay) : null;
  const key = src && range ? `${src.path}:${src.branch}:${src.unit}:${range.from}:${range.to}` : null;
  const [state, setState] = useState<{ key: string; pace: ProtocolActivity | null } | null>(null);
  useEffect(() => {
    if (!src || !range || !key) return;
    let live = true;
    load(src, range.from, range.to).then((pace) => {
      if (live) setState({ key, pace });
    });
    return () => {
      live = false;
    };
    // `key` stands for the source and the range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key != null && state?.key === key ? state.pace : null;
}

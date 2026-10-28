"use client";

// A Liquity V2 branch's redemption pace over a Trove's life
// (/api/liquity-v2/redemption-pace; lib/liquity-v2/redemption-pace.ts), for
// the chart's pace lane. Null while the read is on its way, where it failed,
// or with no branch or range; the chart then draws no lane. One read per
// branch and range a page load.

import { useEffect, useState } from "react";
import type { FlowPace } from "@/lib/shared/flows-pace";
import { isoDay, paceRange, redemptionPace, type PaceBranch } from "@/lib/liquity-v2/redemption-pace";

const cache = new Map<string, Promise<FlowPace | null>>();

function load(branch: PaceBranch, from: number, to: number): Promise<FlowPace | null> {
  const key = `${branch}:${from}:${to}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/liquity-v2/redemption-pace?branch=${branch}&from=${isoDay(from)}&to=${isoDay(to)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => redemptionPace(branch, body))
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
  branch: PaceBranch | null,
  firstDay: number | null,
  lastDay: number | null,
): FlowPace | null {
  const range = firstDay != null && lastDay != null ? paceRange(firstDay, lastDay) : null;
  const key = branch && range ? `${branch}:${range.from}:${range.to}` : null;
  const [state, setState] = useState<{ key: string; pace: FlowPace | null } | null>(null);
  useEffect(() => {
    if (!branch || !range || !key) return;
    let live = true;
    load(branch, range.from, range.to).then((pace) => {
      if (live) setState({ key, pace });
    });
    return () => {
      live = false;
    };
    // `key` stands for the branch and the range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key != null && state?.key === key ? state.pace : null;
}

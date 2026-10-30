"use client";

// The collateral factor changes inside a Compound V2, Moonwell or Compound V3
// position's life (lib/shared/collateral-factor-changes.ts; ui-jobs 328
// step 8): the family's setter log read once per page (cached for the tab),
// each change on a market the account used, from the life's first day to its
// close or today.

import { useEffect, useMemo, useState } from "react";
import { fetchChangeLog, type ChangeLogRead } from "@/lib/shared/change-log-read";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import {
  cometFactorChanges,
  ctokenFactorChanges,
  type CometFactorLog,
  type CTokenFactorLog,
  type FactorChange,
} from "@/lib/shared/collateral-factor-changes";
import type { CTokenProtocol } from "@/lib/api/fetch-ctoken-liquidity-at";
import type { CompoundDeploymentKey } from "@/lib/compound/deployments";

const NONE: FactorChange[] = [];
const logs = new Map<string, Promise<ChangeLogRead<unknown>>>();

function useLog<T>(url: string | null): ChangeLogRead<T> {
  const [got, setGot] = useState<{ url: string; read: ChangeLogRead<T> } | null>(null);
  useEffect(() => {
    if (!url) return;
    let p = logs.get(url);
    if (!p) {
      p = fetchChangeLog<unknown>(url);
      p.then((v) => {
        if (v.unavailable) logs.delete(url);
      });
      logs.set(url, p);
    }
    let live = true;
    p.then((read) => {
      if (live) setGot({ url, read: read as ChangeLogRead<T> });
    });
    return () => {
      live = false;
    };
  }, [url]);
  return got && got.url === url ? got.read : { log: null, unavailable: false };
}

/** A family's factor changes, and whether its log could not be read. */
export interface FactorChangesRead {
  changes: FactorChange[];
  unavailable: boolean;
}

/** The life's first and last UTC days: the last is null while anything is
 *  held (the life runs to today). */
function lifeDays(t: FlowTimeline | null): { first: number; last: number | null } | null {
  if (!t || t.days.length === 0) return null;
  const held = new Map<string, number>();
  for (const d of t.days) for (const b of d.balances) held.set(`${b.side}:${b.asset}`, b.amount);
  const open = [...held.values()].some((a) => a > 0);
  return { first: t.days[0].day, last: open ? null : t.days[t.days.length - 1].day };
}

const inLife = (changes: FactorChange[], life: { first: number; last: number | null } | null) =>
  life ? changes.filter((c) => c.day >= life.first && (life.last == null || c.day <= life.last)) : NONE;

const CTOKEN_NAMES: Record<CTokenProtocol, { comptroller: string; via: string }> = {
  "compound-v2": {
    comptroller: "Comptroller",
    via: "eth_getLogs on the Comptroller for NewCollateralFactor · /api/chain/ctoken-factor-log",
  },
  moonwell: {
    comptroller: "Moonwell Comptroller",
    via: "eth_getLogs on the Comptroller for NewCollateralFactor · /api/chain/ctoken-factor-log",
  },
  "moonwell-base": {
    comptroller: "Moonwell Comptroller",
    via: "eth_getLogs on the Comptroller for NewCollateralFactor · /api/chain/ctoken-factor-log",
  },
};

/** Compound V2 and Moonwell: `markets` maps each used market's cToken or
 *  mToken (lowercased) to the timeline's key for it and its symbol. */
export function useCTokenFactorChanges(
  protocol: CTokenProtocol,
  markets: ReadonlyMap<string, { asset: string; symbol: string }>,
  t: FlowTimeline | null,
): FactorChangesRead {
  const { log, unavailable } = useLog<CTokenFactorLog>(
    markets.size > 0 ? `/api/chain/ctoken-factor-log?protocol=${protocol}` : null,
  );
  const life = useMemo(() => lifeDays(t), [t]);
  return useMemo(
    () => ({ changes: inLife(ctokenFactorChanges(log, markets, CTOKEN_NAMES[protocol]), life), unavailable }),
    [log, unavailable, markets, protocol, life],
  );
}

/** Compound V3: `assets` maps each collateral the account used (lowercased)
 *  to the timeline's key for it and its symbol. */
export function useCometFactorChanges(
  deployment: CompoundDeploymentKey,
  market: string,
  assets: ReadonlyMap<string, { asset: string; symbol: string }>,
  t: FlowTimeline | null,
): FactorChangesRead {
  const { log, unavailable } = useLog<CometFactorLog>(
    assets.size > 0 ? `/api/chain/compound/factor-log?deployment=${deployment}&market=${market}` : null,
  );
  const life = useMemo(() => lifeDays(t), [t]);
  return useMemo(
    () => ({ changes: inLife(cometFactorChanges(log, assets), life), unavailable }),
    [log, unavailable, assets, life],
  );
}

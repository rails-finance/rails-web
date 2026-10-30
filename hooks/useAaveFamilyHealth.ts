"use client";

// The Aave family's reader for the health view (hooks/useFlowsHealth.ts;
// ui-jobs 328, steps 4 and 5): an Aave V3 Pool's thresholds from the family's
// position-state route by market (hooks/useAaveV3PositionState.ts), an Aave V4
// spoke's collateral factors from the spoke's state at the block
// (lib/aave-v4/flows-health.ts). A transaction hash is read from an event's id
// on either id form (Ethereum's "kind:hash:log", Base's "hash-log").
//
// An Aave V3 Pool's governance changes to the account's thresholds
// (lib/aave-v3/config-changes.ts; ui-jobs 328 step 8) are markers, and each
// one that moves the line on a day the account held an affected collateral
// against a debt is one more read at the change's transaction. Ethereum's
// index answers only a transaction with the account's event, so a change's
// read there takes the at-block route ("chain:<market>", rails-server's store).

import { useEffect, useMemo, useState } from "react";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import { AAVE_V3_LEVELS, aaveV3ThresholdRead, type AaveHealthSource } from "@/lib/aave-v3/flows-health";
import { readAaveV3PositionStateInBackground } from "@/hooks/useAaveV3PositionState";
import { aaveV4FactorRead } from "@/lib/aave-v4/flows-health";
import type { AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";
import { healthRead } from "@/lib/shared/health-reads";
import { useFlowsHealth, type HealthPick, type HealthReader } from "@/hooks/useFlowsHealth";
import {
  aaveConfigChanges,
  changesInLife,
  configChangePicks,
  heldCollateral,
  type AaveConfigLogAnswer,
} from "@/lib/aave-v3/config-changes";
import type { AaveFamilyEmodeSwitch } from "@/lib/aave-v3/account-switches";
import { fetchChangeLog, type ChangeLogRead } from "@/lib/shared/change-log-read";
import { withChanges } from "@/lib/shared/flows-changes";

/** The markets whose PoolConfigurator logs rails-server serves. */
const CONFIG_MARKETS = new Set(["core", "prime", "etherfi", "spark", "base", "seamless"]);
/** The Ethereum markets, read through the index for an event's transaction. */
const INDEX_MARKETS = new Set(["core", "prime", "etherfi"]);
/** A change's read, marked so the reader takes the chain route for it. */
type ChangePick = HealthPick & { change?: true };

const logs = new Map<string, Promise<ChangeLogRead<AaveConfigLogAnswer>>>();

/** The market's configurator logs, read once per tab. */
function useConfigLog(market: string | null): ChangeLogRead<AaveConfigLogAnswer> {
  const [got, setGot] = useState<{ market: string; read: ChangeLogRead<AaveConfigLogAnswer> } | null>(null);
  useEffect(() => {
    if (!market) return;
    let p = logs.get(market);
    if (!p) {
      p = fetchChangeLog<AaveConfigLogAnswer>(`/api/chain/aave-v3/config-log?market=${market}`);
      p.then((v) => {
        if (v.unavailable) logs.delete(market);
      });
      logs.set(market, p);
    }
    let live = true;
    p.then((read) => {
      if (live) setGot({ market, read });
    });
    return () => {
      live = false;
    };
  }, [market]);
  return got && got.market === market ? got.read : { log: null, unavailable: false };
}

const TX_HASH = /0x[0-9a-fA-F]{64}/;

/** An event's transaction: its hash, or the one its id spells. */
function txOf(e: { txHash?: string; id: string | number }): string | undefined {
  return e.txHash?.match(TX_HASH)?.[0] ?? String(e.id).match(TX_HASH)?.[0];
}

export interface AaveFamilyHealthInput {
  wallet: string;
  /** The position-state route's market: an Ethereum market ("core",
   *  "prime", …), "spark", "base" or "seamless"; for Aave V4 the spoke's key
   *  ("main"). Null asks for nothing. */
  market: string | null;
  source: AaveHealthSource;
  /** The page's events. */
  events: readonly { blockNumber: number; timestamp: number; txHash?: string; id: string | number }[];
  /** The card's health factor on an open position. */
  liveHf: number | null;
  /** The card's level per collateral on an open position, by asset key. */
  liveLevels?: Record<string, number> | null;
  /** The account's e-mode switches in this market, once the page has read
   *  them; until then (null) no governance change is drawn. */
  emode?: readonly AaveFamilyEmodeSwitch[] | null;
}

export function useAaveFamilyHealth(t: FlowTimeline | null, p: AaveFamilyHealthInput): FlowTimeline | null {
  const { events, market, wallet, source, liveHf, liveLevels, emode } = p;
  const v4 = source.reader === "aave-v4-spoke";
  // Each pick needs its transaction: the position-state read is after it.
  const picks = useMemo<HealthPick[]>(
    () =>
      events.flatMap((e) => {
        const txHash = txOf(e);
        return txHash ? [{ blockNumber: e.blockNumber, timestamp: e.timestamp, txHash }] : [];
      }),
    [events],
  );
  const reader = useMemo<HealthReader | null>(() => {
    if (!market) return null;
    if (v4)
      return {
        key: `aave-v4:${wallet.toLowerCase()}:${market}`,
        load: (e) =>
          healthRead(
            `/api/chain/aave-v4/spoke-position?wallet=${wallet}&spoke=${market}&block=${e.blockNumber}`,
            (b) => {
              const r = b as AaveV4SpokePositionChainResponse | null;
              return r && Array.isArray(r.reserves) && !r.chainStale ? r : null;
            },
          ).then((r) => (r ? aaveV4FactorRead(r, e.timestamp) : null)),
      };
    return {
      key: `aave-v3:${wallet.toLowerCase()}:${market}`,
      load: (e) =>
        readAaveV3PositionStateInBackground({
          wallet,
          market: (e as ChangePick).change && INDEX_MARKETS.has(market) ? `chain:${market}` : market,
          block: e.blockNumber,
          txHash: e.txHash!,
        }).then((r) => (r.status === "ready" && r.data.complete ? aaveV3ThresholdRead(r.data) : null)),
    };
  }, [v4, wallet, market]);
  const configMarket = !v4 && market && CONFIG_MARKETS.has(market) && emode ? market : null;
  const { log, unavailable: changesUnavailable } = useConfigLog(configMarket);
  const held = useMemo(() => heldCollateral(t), [t]);
  const changes = useMemo(
    () => (configMarket && log && emode ? changesInLife(aaveConfigChanges(log, held, emode), t) : []),
    [configMarket, log, emode, held, t],
  );
  const also = useMemo<ChangePick[]>(
    () => configChangePicks(changes, t).map((c) => ({ ...c, change: true as const })),
    [changes, t],
  );
  const stepped = also.length > 0;
  const withLevels = useMemo(() => {
    const s = source.levels ? source : { ...source, levels: AAVE_V3_LEVELS };
    return stepped ? { ...s, readAt: "at each day's last event and at each governance change that moved one" } : s;
  }, [source, stepped]);
  const health = useFlowsHealth(t, { reader, source: withLevels, events: picks, liveHf, liveLevels, also });
  return useMemo(() => withChanges(health, changes, changesUnavailable), [health, changes, changesUnavailable]);
}

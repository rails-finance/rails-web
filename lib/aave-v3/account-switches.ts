// What an Aave V3-family page reads beside its timeline: the account's e-mode
// changes and the reserves it ever turned on as collateral, from the Pool's
// logs (/api/chain/{spark,seamless}/account-switches). An e-mode change becomes
// a timeline row of its own, placed among the served rows and counted by
// nothing else on the page; the collateral set tells a closed SparkLend card
// what backed borrowing.
//
// Client-safe: no RPC.

import type { BaseActivityEvent, EmodeSwitchFields } from "@/lib/shared/types/event-shape";
import type { ServedTimelineRow } from "@/lib/shared/timeline-folder";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";

export interface AaveFamilyEmodeSwitch {
  blockNumber: number;
  /** Unix seconds. */
  timestamp: number;
  txHash: string;
  logIndex: number;
  fromId: number;
  /** The previous category's label (null for none). */
  fromLabel: string | null;
  toId: number;
  /** The new category's on-chain label and limits at the switch's block; null
   *  for none. */
  label: string | null;
  ltvBps: number | null;
  liquidationThresholdBps: number | null;
}

export interface AaveFamilyAccountSwitches {
  wallet: string;
  emode: AaveFamilyEmodeSwitch[];
  /** Lowercased reserves the account ever turned on as collateral. */
  collateralEnabled: string[];
}

export async function fetchAccountSwitches(
  route: string,
  wallet: string,
  signal?: AbortSignal,
): Promise<AaveFamilyAccountSwitches> {
  const res = await fetch(`${route}?wallet=${encodeURIComponent(wallet)}`, { signal });
  if (!res.ok) throw new Error(`account-switches ${res.status}`);
  return (await res.json()) as AaveFamilyAccountSwitches;
}

const fields = (x: AaveFamilyEmodeSwitch): EmodeSwitchFields => ({
  fromId: x.fromId,
  fromLabel: x.fromLabel,
  toId: x.toId,
  toLabel: x.label,
  ltvBps: x.ltvBps,
  liquidationThresholdBps: x.liquidationThresholdBps,
});

/** One timeline row per e-mode change, in the page's own context arm. */
export function emodeSwitchEvents(
  wallet: string,
  switches: AaveFamilyEmodeSwitch[],
  arm: "spark" | "aave-v3",
  chainId: ChainId,
): BaseActivityEvent[] {
  return switches.map((x) => {
    const base = {
      id: `emode:${x.txHash.toLowerCase()}:${x.logIndex}`,
      txHash: x.txHash,
      blockNumber: x.blockNumber,
      timestamp: x.timestamp,
      wallet: wallet.toLowerCase(),
      actionType: "emode",
      actionLabel: "E-mode",
      flows: [],
      etherscanUrl: explorerUrl(chainId, "tx-logs", x.txHash),
    };
    return arm === "spark"
      ? {
          ...base,
          context: {
            protocol: "spark" as const,
            data: {
              eventType: "emode" as const,
              reserveSymbol: "",
              side: "supply" as const,
              assetsDelta: "0",
              emodeSwitch: fields(x),
            },
          },
        }
      : {
          ...base,
          context: { protocol: "aave-v3" as const, data: { eventType: "emode" as const, emodeSwitch: fields(x) } },
        };
  });
}

/** The log index an event id ends in ("supply:0x…:351", "0x…-351"). */
export const logOf = (e: BaseActivityEvent): number => Number(e.id.split(/[:-]/).pop()) || 0;

/** The rows with the switches placed among them by block and log, in the
 *  order the page holds its rows (newest first or oldest first). */
export function withEmodeRows<E extends BaseActivityEvent>(events: E[], rows: E[]): E[] {
  const have = new Set(events.map((e) => e.id));
  const add = rows.filter((r) => !have.has(r.id));
  if (add.length === 0) return events;
  const desc = events.length > 1 && events[0].blockNumber > events[events.length - 1].blockNumber;
  const all = [...events, ...add].sort((a, b) =>
    a.blockNumber === b.blockNumber ? logOf(a) - logOf(b) : a.blockNumber - b.blockNumber,
  );
  return desc ? all.reverse() : all;
}

/** A grouped answer's rows (ascending chain order) with the switches placed
 *  among them: each before the first row that starts after it. */
export function withEmodeServedRows<E extends BaseActivityEvent>(
  rows: ServedTimelineRow<E>[],
  add: E[],
): ServedTimelineRow<E>[] {
  if (add.length === 0) return rows;
  const out = [...rows];
  const startOf = (r: ServedTimelineRow<E>): [number, number] =>
    r.kind === "folder" ? [r.folder.firstBlock, -1] : [r.event.blockNumber, logOf(r.event)];
  for (const e of [...add].sort((a, b) => a.blockNumber - b.blockNumber || logOf(a) - logOf(b))) {
    if (out.some((r) => r.kind === "event" && r.event.id === e.id)) continue;
    const at = out.findIndex((r) => {
      const [block, log] = startOf(r);
      return block > e.blockNumber || (block === e.blockNumber && log > logOf(e));
    });
    out.splice(at < 0 ? out.length : at, 0, { kind: "event", event: e });
  }
  return out;
}

/** The switches inside the rows a page loaded: from the oldest loaded row (or
 *  folder) on, or all of them where the page holds the whole history. */
export function switchesInWindow(switches: AaveFamilyEmodeSwitch[], floor: number | null): AaveFamilyEmodeSwitch[] {
  return floor == null ? switches : switches.filter((s) => s.blockNumber >= floor);
}

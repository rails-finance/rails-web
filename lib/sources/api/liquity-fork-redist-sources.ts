// The liquidations whose redistribution reached a fork Trove — read for the
// timeline routes of the three Liquity V2 forks (Ebisu, Asymmetry,
// Basedollar), so a row that applied a redistribution can name its source.
// ----------------------------------------------------------------------------
// SERVER-ONLY — imported from the /api/<fork>/<branch>/<id>/timeline routes.
//
// A Trove receives a liquidated neighbour's redistribution with no
// transaction of its own: the balance changes on the chain at once and is
// written into the Trove's record the next time it is touched, when its
// TroveOperation carries `_debtIncreaseFromRedist` / `_collIncreaseFromRedist`.
// The row that applied it therefore cannot say whose liquidation it was. The
// liquidations that can have contributed are the ones on the same branch with
// a redistributed leg between the Trove's previous touch and this one; their
// Liquidation logs are on the liquidated Troves' own last rows. The branch
// listing names the liquidated Troves (with the time of their last event,
// which for a liquidated Trove is the liquidation), and each one's newest
// timeline row carries its Liquidation legs.
//
// Best effort, bounded: a failed or slow read leaves the row without a
// source, and it then states the amounts alone. A row whose previous touch is
// not in the served history (the first row of a window) is left unnamed too,
// because the liquidations before it cannot be told apart from older ones.

import type { BaseActivityEvent, LiquityForkRedistSource } from "@/lib/shared/types/event-shape";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";

const RAILS_API_URL = process.env.RAILS_API_URL;
const READ_TIMEOUT_MS = 4000;
const LIST_TTL_MS = 10 * 60 * 1000;
/** A branch with more liquidated Troves than this in the window is not named:
 *  one row would cost that many reads. */
const MAX_CANDIDATES = 12;

interface RawTroveRow {
  id: string;
  status: string;
  activity?: { lastActivityAt?: number };
}

interface RawTimelineRow {
  block_number: string;
  block_timestamp: string;
  tx_hash: string;
  action: string;
  liq_debt_redistributed?: string | null;
  liq_coll_redistributed?: string | null;
}

// Liquidated Troves per (fork, branch): short-lived, a new liquidation adds one.
const listCache = new Map<string, { at: number; rows: { id: string; ts: number }[] }>();
// A liquidation's legs never change once logged.
const legCache = new Map<string, LiquityForkRedistSource | null>();

function scale(raw: string | null | undefined, decimals: number): string | null {
  if (raw == null || raw === "") return null;
  let v: bigint;
  try {
    v = BigInt(String(raw).split(".")[0]);
  } catch {
    return null;
  }
  const div = BigInt(10) ** BigInt(decimals);
  const whole = (v / div).toString();
  const frac = (v % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

async function readJson<T>(url: string, readerIp?: string | null): Promise<T | null> {
  try {
    const res = await fetch(
      url,
      createAuthFetchOptions({ signal: AbortSignal.timeout(READ_TIMEOUT_MS) }, readerIp ?? undefined),
    );
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function liquidatedOnBranch(
  fork: string,
  branch: string,
  readerIp?: string | null,
): Promise<{ id: string; ts: number }[] | null> {
  const key = `${fork}:${branch}`;
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.rows;
  const qs = new URLSearchParams({ collateralTypes: branch, status: "liquidated", limit: "100", sortOrder: "desc" });
  const body = await readJson<{ data?: RawTroveRow[] }>(`${RAILS_API_URL}/api/${fork}/troves?${qs}`, readerIp);
  if (!body?.data) return null;
  const rows = body.data
    .filter((r) => r.status === "liquidated" && r.activity?.lastActivityAt != null)
    .map((r) => ({ id: r.id, ts: Number(r.activity!.lastActivityAt) }));
  listCache.set(key, { at: Date.now(), rows });
  return rows;
}

async function liquidationLegs(
  fork: string,
  branch: string,
  troveId: string,
  collDecimals: number,
  readerIp?: string | null,
): Promise<LiquityForkRedistSource | null> {
  const key = `${fork}:${branch}:${troveId}`;
  if (legCache.has(key)) return legCache.get(key)!;
  const body = await readJson<{ rows?: RawTimelineRow[] }>(
    `${RAILS_API_URL}/api/${fork}/${encodeURIComponent(branch)}/${encodeURIComponent(troveId)}/timeline?recent=1`,
    readerIp,
  );
  const row = body?.rows?.[body.rows.length - 1];
  if (!row) return null;
  const debt = row.action === "liquidate" ? scale(row.liq_debt_redistributed, 18) : null;
  const coll = row.action === "liquidate" ? scale(row.liq_coll_redistributed, collDecimals) : null;
  const out: LiquityForkRedistSource | null =
    debt != null && coll != null
      ? {
          troveId,
          blockNumber: Number(row.block_number),
          timestamp: Number(row.block_timestamp),
          txHash: row.tx_hash.startsWith("0x") ? row.tx_hash : `0x${row.tx_hash}`,
          debtRedistributed: debt,
          collRedistributed: coll,
        }
      : null;
  legCache.set(key, out);
  return out;
}

type ForkCtx = {
  operation?: { debtFromRedist: string; collFromRedist: string };
  redistSources?: LiquityForkRedistSource[];
};

/**
 * Stamp `redistSources` on every event that applied a redistribution.
 * `boundaries` are the blocks of anything else served in the same history
 * (folders' last blocks on a grouped answer), so a row's previous touch can
 * be found when it sits inside a folder.
 */
export async function attachForkRedistSources(
  events: BaseActivityEvent[],
  opts: {
    fork: "ebisu" | "asymmetry" | "basedollar";
    branch: string;
    collDecimals: number;
    boundaries?: number[];
    readerIp?: string | null;
  },
): Promise<void> {
  if (!RAILS_API_URL) return;
  const ctxOf = (e: BaseActivityEvent) => (e.context as { data?: ForkCtx } | undefined)?.data;
  const targets = events.filter((e) => {
    const op = ctxOf(e)?.operation;
    return op != null && (Number(op.debtFromRedist) > 0 || Number(op.collFromRedist) > 0);
  });
  if (targets.length === 0) return;

  const liquidated = await liquidatedOnBranch(opts.fork, opts.branch, opts.readerIp);
  if (!liquidated || liquidated.length === 0) return;

  const blocks = [...events.map((e) => e.blockNumber), ...(opts.boundaries ?? [])];
  for (const target of targets) {
    const prevBlock = blocks.filter((b) => b < target.blockNumber).reduce((m, b) => Math.max(m, b), -1);
    if (prevBlock < 0) continue;
    const prevTs = events.find((e) => e.blockNumber === prevBlock)?.timestamp;
    // The listing carries times, not blocks: narrow by time where the
    // previous touch's time is known, then settle on the logged blocks.
    const candidates = liquidated.filter((l) => l.ts <= target.timestamp && (prevTs == null || l.ts >= prevTs));
    if (candidates.length === 0 || candidates.length > MAX_CANDIDATES) continue;
    const legs = await Promise.all(
      candidates.map((c) => liquidationLegs(opts.fork, opts.branch, c.id, opts.collDecimals, opts.readerIp)),
    );
    const sources = legs
      .filter((l): l is LiquityForkRedistSource => l != null)
      .filter(
        (l) => l.blockNumber > prevBlock && l.blockNumber <= target.blockNumber && Number(l.debtRedistributed) > 0,
      )
      .sort((a, b) => a.blockNumber - b.blockNumber);
    const ctx = ctxOf(target);
    if (ctx && sources.length > 0) ctx.redistSources = sources;
  }
}

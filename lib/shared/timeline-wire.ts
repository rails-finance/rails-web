// The wire shape of a timeline — the event as it travels, not as it is read.
// ----------------------------------------------------------------------------
// A position page does not merely LIST a wallet's events, it ADDS THEM UP: the
// lifetime tower, the filter counts, the tenure and the actor split are all
// reductions over EVERY event, so the whole history has to reach the browser.
// On the deepest wallets that is tens of megabytes, and a large share of it is
// fields that restate something already on the row.
//
// This module is the diet, and it sits at the two wire boundaries only:
//
//   • each `app/api/**/timeline/route.ts` calls `toTimelineWire` immediately
//     before `NextResponse.json`, and
//   • each `lib/api/fetch-*-timeline.ts` calls `fromTimelineWire` immediately
//     after `res.json()`.
//
// Nothing between them changes. The 22 transforms still build a full
// `BaseActivityEvent` — they run inside the route, where an object costs
// nothing until it is serialised — and every page, hook, economics reducer,
// card and export downstream of the fetch client receives exactly the events
// it received before. `WireActivityEvent` is a DISTINCT type with those fields
// absent, so a fetch path that forgot to rehydrate fails to typecheck rather
// than blanking a card in production.
//
// FOUR FIELDS COME OFF THE ROW:
//
//   `etherscanUrl`  a template over `txHash`. Rebuilt from the chain registry
//                   (lib/shared/chains.ts) and the chain named in the
//                   envelope, so an explorer on Base gets a Basescan link
//                   whatever its transform hard-coded.
//   `actionLabel`   dictionary-encoded: the distinct labels ride the envelope
//                   and each row carries an index. Lossless — no label map is
//                   re-derived client-side, so a protocol that keys its filter
//                   menu on the label itself (MakerDAO) needs no carve-out.
//   `wallet`        hoisted to the envelope as a default. ⚠️ It is NOT constant
//                   everywhere: a Liquity V2 fork's redemption row carries the
//                   REDEEMER, not the trove owner, and `lib/shared/external-
//                   actor.ts` compares each row against it to reach the
//                   external-actor verdict. So the default is the value the
//                   most rows carry and any row that differs keeps its own —
//                   decided per response from the data, never from a list of
//                   protocols that would rot.
//   `txHash`        a SEGMENT of `id`, but not uniformly the first one. `id`
//                   is `${txHash}-${logIndex}` on some protocols; f(x), Morpho
//                   and MakerDAO join with `:`; and the protocols that key on
//                   the index's own `event_key` put the hash further in —
//                   Spark's is `action:txHash:logIndex` (segment 1) and Aave
//                   V3's is `action:contract:txHash:logIndex` (segment 2).
//                   Maple's spells that segment WITHOUT the `0x`. Some, like
//                   Fluid, do not contain the hash at all. So the
//                   reconstruction is proved per row: the envelope names the
//                   separator, the segment index and whether the prefix is
//                   there — the combination that reconstructs the most rows —
//                   and any row it does not reconstruct keeps its own hash. A
//                   row can never be wrong about its own hash — at worst it
//                   costs the bytes.
//
// The envelope also carries a format version. A response that predates the
// format has no envelope at all, and `fromTimelineWire` hands it back
// untouched — a stale edge-cached body during a deploy reads exactly as it did
// before rather than throwing.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";

/** Separator between the transaction hash and the rest of an event's `id`. */
export type WireHashSeparator = "-" | ":";

/**
 * One event as it travels. Four of `BaseActivityEvent`'s fields are absent;
 * `fromWireEvents` is the only thing that puts them back.
 */
export interface WireActivityEvent
  extends Omit<BaseActivityEvent, "wallet" | "txHash" | "actionLabel" | "etherscanUrl"> {
  /** Index into the envelope's label table. Absent when the row carried no
   *  label at all (a transform indexing a label map with an unmapped key). */
  al?: number;
  /** This row's own wallet — present only where it differs from the
   *  envelope's default. */
  w?: string;
  /** This row's transaction hash — present only where the envelope's
   *  (separator, segment) does not pick it out of `id`. */
  h?: string;
}

/** What the whole response says once, so no row has to say it again. */
export interface TimelineWireEnvelope {
  /** Wire format version. */
  v: 1;
  /** The chain these events happened on — every `etherscanUrl` is rebuilt
   *  from it and the shared chain registry. */
  c: ChainId;
  /** The `wallet` carried by every row without its own `w`. */
  w: string;
  /** The distinct `actionLabel` values, in first-seen order. */
  al: string[];
  /** The character `id` is segmented by. */
  hs: WireHashSeparator;
  /** Which segment of `id.split(hs)` IS the transaction hash. Absent means 0 —
   *  the leading segment, which is what every response before this field
   *  carried, so an older body still reads correctly. Rows the pair does not
   *  reconstruct carry `h`. */
  hp?: number;
  /** Set when that segment is the hash WITHOUT its `0x` prefix. Maple's
   *  `event_key` stores the hash bare (`transfer_in:224ef1…:0`) where
   *  MakerDAO's keeps the prefix, and the difference is per response, not per
   *  protocol — so it is measured like everything else here rather than
   *  listed. Absent means the segment is the hash verbatim. */
  hx?: 1;
}

/** A timeline response with its events on the wire. `T` is the full result the
 *  transform built and the fetch client hands back. */
export type WireTimeline<T extends { events: BaseActivityEvent[] }> = Omit<T, "events"> & {
  events: WireActivityEvent[];
  wire: TimelineWireEnvelope;
};

/** Both separators are tried against every row, at whatever segment the row's
 *  own hash turns out to sit in; the (separator, segment) pair that
 *  reconstructs the most rows wins the envelope. `-` at segment 0 breaks a tie
 *  because it is the majority form. */
const SEPARATORS: readonly WireHashSeparator[] = ["-", ":"];

/**
 * Which segment of `id` (split on `sep`) is exactly `needle`, or -1 if none is.
 * Written without splitting: the envelope build runs over every event of a
 * whole history, and two throwaway arrays per row is a cost the response does
 * not need to pay. The needle must fill a segment end to end — a hash that
 * merely appears INSIDE one cannot be sliced back out.
 */
function segmentOf(id: string, needle: string, sep: string): number {
  if (!needle) return -1;
  const at = id.indexOf(needle);
  if (at < 0) return -1;
  if (at > 0 && id[at - 1] !== sep) return -1;
  const end = at + needle.length;
  if (end < id.length && id[end] !== sep) return -1;
  let seg = 0;
  for (let i = 0; i < at; i += 1) if (id[i] === sep) seg += 1;
  return seg;
}

/** The hash as the envelope says `id` spells it. */
const spelling = (txHash: string, hx: 1 | undefined): string =>
  hx === 1 && txHash.startsWith("0x") ? txHash.slice(2) : txHash;

/** The `seg`-th segment of `id` split on `sep`, or "" if there is no such
 *  segment. The inverse of `hashSegmentOf`, and the only thing that reads the
 *  hash back out of an `id`. */
function segmentAt(id: string, sep: string, seg: number): string {
  let start = 0;
  for (let s = 0; s < seg; s += 1) {
    const i = id.indexOf(sep, start);
    if (i < 0) return "";
    start = i + 1;
  }
  const end = id.indexOf(sep, start);
  return end < 0 ? id.slice(start) : id.slice(start, end);
}

/**
 * Read the envelope off the events themselves. Every choice it records — the
 * default wallet, the hash separator, the label table — is measured from this
 * response's own rows, so it cannot disagree with them.
 */
export function buildTimelineWireEnvelope(
  chainId: ChainId,
  lists: ReadonlyArray<readonly BaseActivityEvent[]>,
): TimelineWireEnvelope {
  const walletCounts = new Map<string, number>();
  // Keyed `${sep}\u0000${segment}\u0000${0 | 1}` — how many rows that
  // (separator, segment, prefixed-or-bare) combination reconstructs.
  const placeHits = new Map<string, number>();
  const labels: string[] = [];
  const seenLabels = new Set<string>();

  for (const list of lists) {
    for (const e of list) {
      walletCounts.set(e.wallet, (walletCounts.get(e.wallet) ?? 0) + 1);
      for (const sep of SEPARATORS) {
        for (const hx of [undefined, 1] as const) {
          const spelt = spelling(e.txHash, hx);
          if (hx === 1 && spelt === e.txHash) continue; // no 0x to strip
          const seg = segmentOf(e.id, spelt, sep);
          if (seg < 0) continue;
          const k = `${sep}\u0000${seg}\u0000${hx ?? 0}`;
          placeHits.set(k, (placeHits.get(k) ?? 0) + 1);
        }
      }
      if (typeof e.actionLabel === "string" && !seenLabels.has(e.actionLabel)) {
        seenLabels.add(e.actionLabel);
        labels.push(e.actionLabel);
      }
    }
  }

  let w = "";
  let best = -1;
  for (const [addr, n] of walletCounts) {
    if (n > best) {
      best = n;
      w = addr;
    }
  }

  // The verbatim hash at segment 0 joined by `-` is the standing default, and
  // only a STRICTLY better combination displaces it — so a response whose ids
  // carry no hash at all keeps the shape every earlier response had rather
  // than picking an arbitrary winner.
  let hs: WireHashSeparator = "-";
  let hp = 0;
  let hx: 1 | undefined;
  let bestHits = placeHits.get(`-\u00000\u00000`) ?? 0;
  for (const [k, n] of placeHits) {
    if (n <= bestHits) continue;
    const [sep, seg, bare] = k.split("\u0000");
    bestHits = n;
    hs = sep as WireHashSeparator;
    hp = Number(seg);
    hx = bare === "1" ? 1 : undefined;
  }

  const env: TimelineWireEnvelope = { v: 1, c: chainId, w, al: labels, hs };
  // Both omitted at their default so the common case spends no bytes and an
  // older reader, which has neither field, agrees with a new writer.
  if (hp !== 0) env.hp = hp;
  if (hx === 1) env.hx = 1;
  return env;
}

/** Strip a list of events against an envelope built over it. */
export function toWireEvents(events: readonly BaseActivityEvent[], env: TimelineWireEnvelope): WireActivityEvent[] {
  const labelIndex = new Map(env.al.map((label, i) => [label, i] as const));
  return events.map((e) => {
    // `etherscanUrl` is dropped outright — it is rebuilt from the chain.
    const { wallet, txHash, actionLabel, etherscanUrl, ...rest } = e;
    void etherscanUrl;
    const out: WireActivityEvent = rest;
    const li = typeof actionLabel === "string" ? labelIndex.get(actionLabel) : undefined;
    if (li !== undefined) out.al = li;
    if (wallet !== env.w) out.w = wallet;
    if (!(txHash && segmentAt(e.id, env.hs, env.hp ?? 0) === spelling(txHash, env.hx))) out.h = txHash;
    return out;
  });
}

/** Put the four fields back. The result is the event the transform built. */
export function fromWireEvents(events: readonly WireActivityEvent[], env: TimelineWireEnvelope): BaseActivityEvent[] {
  return events.map((e) => {
    const { al, w, h, ...rest } = e;
    const spelt = h !== undefined ? undefined : segmentAt(e.id, env.hs, env.hp ?? 0);
    const txHash = h !== undefined ? h : env.hx === 1 && spelt ? `0x${spelt}` : (spelt ?? "");
    const out: BaseActivityEvent = {
      ...rest,
      wallet: w !== undefined ? w : env.w,
      txHash,
      actionLabel: al !== undefined ? env.al[al] : (undefined as unknown as string),
      etherscanUrl: txHash ? explorerUrl(env.c, "tx-logs", txHash) : "",
    };
    // A row that carried no label carried no key either; putting one back as
    // `undefined` would be a value the transform never emitted.
    if (al === undefined) delete (out as Partial<BaseActivityEvent>).actionLabel;
    return out;
  });
}

/** The response boundary: the last thing a timeline route does before it
 *  serialises. `chainId` is the explorer's own registered chain. */
export function toTimelineWire<T extends { events: BaseActivityEvent[] }>(
  result: T,
  chainId: ChainId,
): WireTimeline<T> {
  const wire = buildTimelineWireEnvelope(chainId, [result.events]);
  return { ...result, events: toWireEvents(result.events, wire), wire } as unknown as WireTimeline<T>;
}

/** A timeline that groups its events instead of listing them flat: Morpho's,
 *  where a position is a (market, wallet) pair and each carries its own list. */
export type WireGroupedTimeline<T extends { positions: Array<{ events: BaseActivityEvent[] }> }> = Omit<
  T,
  "positions"
> & {
  positions: Array<Omit<T["positions"][number], "events"> & { events: WireActivityEvent[] }>;
  wire: TimelineWireEnvelope;
};

/** The response boundary for a grouped timeline. One envelope covers every
 *  group, so a label or a wallet shared across positions is stated once. */
export function toGroupedTimelineWire<T extends { positions: Array<{ events: BaseActivityEvent[] }> }>(
  result: T,
  chainId: ChainId,
): WireGroupedTimeline<T> {
  const wire = buildTimelineWireEnvelope(
    chainId,
    result.positions.map((p) => p.events),
  );
  return {
    ...result,
    positions: result.positions.map((p) => ({ ...p, events: toWireEvents(p.events, wire) })),
    wire,
  } as unknown as WireGroupedTimeline<T>;
}

/** The Base arm's fetch boundary. One client (`lib/api/fetch-chain-timeline.ts`)
 *  serves all five Base explorers and cannot know which shape it is holding, so
 *  both are rehydrated here: the flat `events` list four of them use, and the
 *  per-position lists Morpho's uses. A payload with no envelope is already
 *  whole and passes through. */
export function rehydrateChainTimelineWire(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const p = payload as {
    wire?: TimelineWireEnvelope;
    events?: WireActivityEvent[];
    positions?: Array<{ events?: WireActivityEvent[] }>;
  };
  const env = p.wire;
  if (!env) return payload;
  const { wire, ...rest } = p;
  void wire;
  const out: Record<string, unknown> = { ...rest };
  if (Array.isArray(p.events)) out.events = fromWireEvents(p.events, env);
  if (Array.isArray(p.positions))
    out.positions = p.positions.map((pos) =>
      Array.isArray(pos.events) ? { ...pos, events: fromWireEvents(pos.events, env) } : pos,
    );
  return out;
}

/** The fetch boundary: the first thing a timeline client does after
 *  `res.json()`. A payload with no envelope is already whole — an edge cache
 *  holding a body from before this format is served through unchanged. */
export function fromTimelineWire<T extends { events: BaseActivityEvent[] }>(payload: WireTimeline<T>): T {
  const env = (payload as { wire?: TimelineWireEnvelope }).wire;
  if (!env) return payload as unknown as T;
  const { wire, events, ...rest } = payload as WireTimeline<T> & {
    wire: TimelineWireEnvelope;
    events: WireActivityEvent[];
  };
  void wire;
  return { ...rest, events: fromWireEvents(events, env) } as unknown as T;
}

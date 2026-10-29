// A MakerDAO ilk's price feed across a vault's life (rails-ops
// reference/lifetime-price-chart.md, the MakerDAO rows and ruling 10; ui-jobs
// 328 step 8): the feed log rails-server keeps
// (/api/at-block/makerdao/feed-log, through /api/chain/makerdao/feed-log),
// turned into the events row's protocol-change markers.
//
// RULES (dss Spotter, the OSM, the LockStake capped oracle).
// - The Spotter prices the ilk from its pip: poke() writes Vat spot =
//   pip value ÷ par ÷ mat. The chart's price is the daily store's spot × mat
//   at each day's close (`maker:<ILK>`), the price the Vat held, so a new
//   pip, a new source behind the OSM, a new cap and a new par each reach the
//   collateral ratio at the first close after the poke that took them. The
//   line steps on its own there: every day is an observation, and no read is
//   added at a change.
// - A new pip is "Price feed"; an OSM's change(src) is "OSM source" (the OSM
//   reads the new source at its next poke and passes it on one hop later); a
//   capped feed's cap set is "Price cap"; a file("par") is "Target price".
//   The ilk's first pip is its onboarding and draws none, as does a cap set
//   in its feed's filing block (the filing's cap).
// - Labels name the feed by the chainlog's key ("PIP_SKY",
//   "LOCKSTAKE_ORACLE") and a source by its kind and wat() ("Chronicle
//   ETH/USD", "Median ETHUSD"); where both sides would read the same, each
//   carries its short address.
// - The minimum ratio (mat) is read and marked by lib/makerdao/flows-changes.ts.
//
// Pure.

import { flowChange, type FlowChange } from "@/lib/shared/flows-changes";
import { MAKER_ADDRESSES } from "@/lib/makerdao/asset-catalog";

export interface MakerSource {
  address: string;
  wat: string | null;
  kind: "chronicle" | "median" | null;
  name: string | null;
}

interface MakerLogAt {
  block: number;
  timestamp: number;
  txHash: string;
  logIndex: number;
}

export interface MakerFeed extends MakerLogAt {
  pip: string;
  name: string | null;
  kind: "osm" | "capped" | "lp" | "value";
  hop: number | null;
  cap: number | null;
  osm: string | null;
  src: MakerSource | null;
}

/** /api/chain/makerdao/feed-log?ilk= */
export interface MakerFeedLog {
  ilk: string;
  chainId: number;
  spotter: string;
  fromBlock: number;
  /** The last stored block. */
  toBlock: number;
  feeds: MakerFeed[];
  sources: (MakerLogAt & { osm: string; pip: string; from: MakerSource | null; to: MakerSource })[];
  caps: (MakerLogAt & { pip: string; from: number | null; to: number })[];
  pars: (MakerLogAt & { par: number })[];
}

export const MAKER_FEED_NAMES = {
  feed: "Price feed",
  source: "OSM source",
  cap: "Price cap",
  par: "Target price",
} as const;

const usable = (log: MakerFeedLog | null | undefined): log is MakerFeedLog =>
  log != null &&
  Array.isArray(log.feeds) &&
  Array.isArray(log.sources) &&
  Array.isArray(log.caps) &&
  Array.isArray(log.pars);

/** "0x5114…6f52". */
const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** "$0.04", "$0.025", "$1". */
export const usdWords = (v: number): string => `$${v.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;

/** "Chronicle ETH/USD", "Median ETHUSD", the chainlog key or the address. */
export function sourceWords(s: MakerSource): string {
  const kind = s.kind === "chronicle" ? "Chronicle" : s.kind === "median" ? "Median" : null;
  if (s.wat) return kind ? `${kind} ${s.wat}` : s.wat;
  return s.name ?? shortAddress(s.address);
}

/** "PIP_SKY (OSM, SKY/USD)", "LOCKSTAKE_ORACLE (capped at $0.04)", "PIP_UNIV2DAIETH". */
function feedWords(f: MakerFeed, withAddress: boolean): string {
  const name = f.name ?? shortAddress(f.pip);
  const base = withAddress && f.name ? `${name} ${shortAddress(f.pip)}` : name;
  if (f.kind === "capped" && f.cap != null) return `${base} (capped at ${usdWords(f.cap)})`;
  if (f.kind === "osm" && f.src?.wat) return `${base} (OSM, ${f.src.wat})`;
  return base;
}

/** A feed's kind in a sentence. */
function feedSentence(f: MakerFeed): string {
  const src = f.src ? `, on ${sourceWords(f.src)}` : "";
  const hop = f.hop != null ? ` with a ${Math.round(f.hop / 60)}-minute delay` : "";
  if (f.kind === "osm") return `${f.pip}, an OSM${hop}${src}`;
  if (f.kind === "capped")
    return `${f.pip}, a wrapper that answers the lower of its cap (${f.cap != null ? usdWords(f.cap) : "unread"}) and the OSM ${f.osm ?? "behind it"}${hop}${src}`;
  if (f.kind === "lp") return `${f.pip}, an LP-token oracle`;
  return `${f.pip}`;
}

const REACH =
  "The collateral ratio's price is the Vat's at each day's close (Vat spot × mat, written by the Spotter's poke), so the ratio takes the change at the first close after the poke that read it.";

/** Each change to the ilk's price feed after its onboarding, oldest first. */
export function makerFeedChanges(log: MakerFeedLog | null | undefined): FlowChange[] {
  if (!usable(log)) return [];
  const ilk = log.ilk;
  const out: FlowChange[] = [];
  const blockWords = (b: number) => b.toLocaleString("en-US");
  const via = "rails-server at-block store · /api/at-block/makerdao/feed-log";
  const feeds = [...log.feeds].sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  feeds.forEach((f, i) => {
    const prev = feeds[i - 1];
    if (!prev) return;
    const same = feedWords(prev, false) === feedWords(f, false);
    const tx = f.txHash.toLowerCase();
    out.push(
      flowChange({
        ts: f.timestamp,
        block: f.block,
        txHash: tx,
        name: MAKER_FEED_NAMES.feed,
        from: feedWords(prev, same),
        to: feedWords(f, same),
        prov: {
          kind: "chain",
          pclass: "emitted",
          summary: `The ${ilk} price feed, set to ${feedSentence(f)} by the Spotter's file("${ilk}", "pip") log at block ${blockWords(f.block)}. Before it, ${feedSentence(prev)}. ${REACH}`,
          contract: { name: "MakerDAO Spotter", address: log.spotter || MAKER_ADDRESSES.SPOTTER },
          via,
          source: { block: f.block, txHash: tx },
        },
      }),
    );
  });
  for (const s of log.sources) {
    const tx = s.txHash.toLowerCase();
    const to = sourceWords(s.to);
    const from = s.from ? sourceWords(s.from) : null;
    const same = from === to;
    out.push(
      flowChange({
        ts: s.timestamp,
        block: s.block,
        txHash: tx,
        name: MAKER_FEED_NAMES.source,
        from: from == null ? null : same ? `${from} ${shortAddress(s.from!.address)}` : from,
        to: same ? `${to} ${shortAddress(s.to.address)}` : to,
        prov: {
          kind: "chain",
          pclass: "emitted",
          summary: `The source behind the ${ilk} OSM (${s.osm}), set to ${s.to.address}${s.to.wat ? ` (${to})` : ""} by the OSM's change(src) log at block ${blockWords(s.block)}.${s.from ? ` Before it, ${s.from.address}${s.from.wat ? ` (${from})` : ""}.` : ""} The OSM reads its source at each poke and passes the price on one delay later, so the Spotter sees the new source within two delays. ${REACH}`,
          contract: { name: `MakerDAO ${ilk} OSM`, address: s.osm },
          via,
          source: { block: s.block, txHash: tx },
        },
      }),
    );
  }
  for (const c of log.caps) {
    const tx = c.txHash.toLowerCase();
    out.push(
      flowChange({
        ts: c.timestamp,
        block: c.block,
        txHash: tx,
        name: MAKER_FEED_NAMES.cap,
        from: c.from != null ? usdWords(c.from) : null,
        to: usdWords(c.to),
        prov: {
          kind: "chain",
          pclass: "emitted",
          summary: `The ${ilk} price cap, set to ${usdWords(c.to)} by the capped feed's File("cap") log at block ${blockWords(c.block)}.${c.from != null ? ` Before it, ${usdWords(c.from)}.` : ""} The feed answers the lower of the cap and its OSM's price. ${REACH}`,
          contract: { name: `MakerDAO ${ilk} capped feed`, address: c.pip },
          via,
          source: { block: c.block, txHash: tx },
        },
      }),
    );
  }
  const pars = [...log.pars].sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  pars.forEach((p, i) => {
    const before = i > 0 ? pars[i - 1].par : 1;
    const tx = p.txHash.toLowerCase();
    out.push(
      flowChange({
        ts: p.timestamp,
        block: p.block,
        txHash: tx,
        name: MAKER_FEED_NAMES.par,
        from: usdWords(before),
        to: usdWords(p.par),
        prov: {
          kind: "chain",
          pclass: "emitted",
          summary: `The target price (par), set to ${usdWords(p.par)} by the Spotter's file("par") log at block ${blockWords(p.block)}. Before it, ${usdWords(before)}. The Spotter divides every ilk's price by par. ${REACH}`,
          contract: { name: "MakerDAO Spotter", address: log.spotter || MAKER_ADDRESSES.SPOTTER },
          via,
          source: { block: p.block, txHash: tx },
        },
      }),
    );
  });
  return out.sort((a, b) => a.block - b.block);
}

/** Whether a feed change falls between `first` and `last` (UTC day numbers, inclusive). */
export const makerLifeHasFeedChange = (changes: readonly FlowChange[], first: number, last: number): boolean =>
  changes.some(
    (c) => (Object.values(MAKER_FEED_NAMES) as string[]).includes(c.name) && c.day >= first && c.day <= last,
  );

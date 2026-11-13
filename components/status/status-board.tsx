"use client";

// The status page's board (rails-ops ui-jobs 583): the house table (D1), one
// row per protocol and a column per chain (a heartbeat dot and how far the
// index has read); opening a row (D8) shows each chain's figures with their
// sources. It reads /api/index/status, or /api/index/progress (the fill only)
// where the server has no /status yet. Under the table, "Next" lists what
// Rails builds next (lib/status/next.ts). The page refreshes its data every
// minute and the dots' ages every 30 s.

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ProtocolIcon, hasProtocolGlyph } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableGroupRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DATA_TABLE_PILL,
  type DataTableDir,
} from "@/components/shared/data-table/data-table";
import Link from "next/link";
import { ChainGlyph as ToggleGlyph, SEGMENT_SHELL, segmentClass } from "@/components/shared/chain-toggle";
import { DOT, STATUS_WORDS } from "@/components/status/status-grammar";
import { PricesView } from "@/components/status/prices-view";
import { LaneText } from "@/components/status/lane-text";
import { NEXT_STAGE_WORDS, nextItems, type NextItem } from "@/lib/status/next";
import { CHAINS, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { PROTOCOLS } from "@/lib/shared/protocols";
import {
  ageWords,
  bytesWords,
  cellsFromProgress,
  cellsFromStatus,
  heartbeatIsWallTime,
  errorKind,
  fillStall,
  fillState,
  heartbeatState,
  heartbeatTime,
  percentWords,
  pipelineHeartbeat,
  pipelineNewestBlockTime,
  pipelineState,
  visitState,
  writerState,
  VISIT_FAIL_LATE,
  VISIT_FAIL_STALLED,
  type VisitReads,
  type Heartbeat,
  type IndexProgress,
  type IndexProgressEntry,
  type IndexStatus,
  type Allowance,
  type HeadMiss,
  liveMiss,
  withHeadMisses,
  counterChains,
  type GatewayCounter,
  type FillHold,
  type StatusCell,
  type StatusEntry,
} from "@/lib/shared/index-progress";

/** The page's data: /status where the server has it, else /progress. */
export type StatusSource = { route: "status"; data: IndexStatus } | { route: "progress"; data: IndexProgress };

const chainName = (id: number) => CHAINS[id as ChainId]?.name ?? `Chain ${id}`;

/** The roster entry for a protocol key on a chain, else the key's first entry. */
const rosterFor = (key: string, chain: number) =>
  PROTOCOLS.find((p) => (p.protocolKey ?? p.id) === key && p.chainId === chain) ??
  PROTOCOLS.find((p) => (p.protocolKey ?? p.id) === key || p.id === key);

const protocolLabel = (key: string, chain: number) => rosterFor(key, chain)?.label ?? key;

/** A protocol's mark, or its initial where Rails holds none. */
function Mark({ id, name }: { id: string; name: string }) {
  if (hasProtocolGlyph(id) || PROTOCOLS.some((p) => p.id === id))
    return <ProtocolIcon id={id} className="h-5 w-5 shrink-0" />;
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rb-200 text-[10px] font-semibold text-rb-600 dark:bg-white/10 dark:text-rb-300">
      {name.slice(0, 1)}
    </span>
  );
}

const HEARTBEAT_WORDS: Record<Heartbeat, string> = {
  fresh: "Reporting",
  late: "Late",
  stalled: "Stalled",
  paused: "Paused",
  none: "No heartbeat yet",
};

const utcTime = (t: number) => {
  const d = new Date(t * 1000);
  return `${formatDate(t)}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
};

const n = (x: number) => x.toLocaleString("en-US");

const STALL_WORDS = {
  "not-gaining": "No blocks read over the last samples, though the fill still reports.",
  behind: "Read to the head, then fell behind it; the fill still reports.",
} as const;

const mb = (b: number) => `${n(Math.round(b / 1e6))} MB`;
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
};

/** Why a fill holds an index, in a sentence; null when it does not. */
function heldLine(h: FillHold | null | undefined, allowance: Allowance | null): string | null {
  if (!h) return null;
  if (h.reason === "egress-floor") {
    const of = allowance?.allowanceToday ? ` of today's ${mb(allowance.allowanceToday)}` : "";
    return `Paused until ${hhmm(h.resetsAt)}: the free gateway has ${mb(h.remainingBytes)}${of} left, under the ${mb(h.floorBytes)} kept in reserve.`;
  }
  const since = h.since ? ` since ${hhmm(h.since)}` : "";
  const detail = h.detail ? `: ${h.detail}` : "";
  switch (h.reason) {
    case "paused":
      return `Paused${since}: the fill is switched off${detail}.`;
    case "fill-error":
      return `The fill hit an error${since} and retries in 5 min${detail}.`;
    case "check-running":
      return `A conservation check is running${detail}.`;
    case "job-failed":
      return `A filter job failed${since} and waits for the next plan${detail}.`;
  }
}

const andList = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The free gateway's counter the fill reads through: the chains it covers,
 *  what is left, and when it resets; the chains with a counter of their own. */
function allowanceLine(a: Allowance, gateways: readonly GatewayCounter[]): string | null {
  if (a.remaining == null || a.allowanceToday == null) return null;
  const { shared, own } = counterChains(a, gateways);
  const names = (ids: number[]) => andList(ids.map(chainName));
  const covers = shared.length ? `, one counter for ${names(shared)}` : "";
  const reserve = a.floorBytes != null ? `, ${mb(a.floorBytes)} kept in reserve` : "";
  const reset = a.resetsAt ? `, in a 24 h window that next resets at ${hhmm(a.resetsAt)}` : "";
  const others = own.length
    ? ` ${names(own)} ${own.length > 1 ? "each draw" : "draws"} on a counter of ${own.length > 1 ? "their" : "its"} own.`
    : "";
  return `${providerWords(a.host)}'s daily allowance${covers}: ${mb(a.remaining)} of ${mb(a.allowanceToday)} left${reserve}${reset}. The full-history fill and reads on visit draw on it.${others}`;
}

/** Why the fill's last plan wrote no sample on this chain. */
function missLine(m: HeadMiss): string {
  const plan = `The fill's last plan, at ${hhmm(m.at)}, wrote no sample`;
  return m.reason === "gateway-refused"
    ? `refused by the gateway${m.until ? ` until ${hhmm(m.until)}` : ""}. ${plan}.`
    : `${plan.charAt(0).toLowerCase()}${plan.slice(1)}: its read of the finalized block failed.`;
}

function heartbeatLine(e: IndexProgressEntry, now: number, allowance: Allowance | null = null): string {
  const t = heartbeatTime(e);
  const miss = liveMiss(e, now);
  if (miss) {
    const last = t != null ? ` It last wrote at ${utcTime(t)}, ${ageWords(now - t)} ago.` : "";
    return `${HEARTBEAT_WORDS[fillState(e, now)]}: ${missLine(miss)}${last}`;
  }
  const held = heldLine(e.held, allowance);
  if (t == null) return "The fill has not reported this index yet.";
  const state = fillState(e, now);
  const words = HEARTBEAT_WORDS[state];
  const line = heartbeatIsWallTime(e)
    ? `${words}: the fill last wrote at ${utcTime(t)}, ${ageWords(now - t)} ago.`
    : `${words}: last planned against the finalized block of ${utcTime(t)}, ${ageWords(now - t)} ago.`;
  // A late or stalled heartbeat outranks a stored hold (see fillState).
  const hb = heartbeatState(e, now);
  if (held && state !== "fresh" && hb !== "late" && hb !== "stalled") return `${held} ${line}`;
  const stall = fillStall(e);
  return stall ? `${line} ${STALL_WORDS[stall]}` : line;
}

const CAUSE_WORDS: Record<string, string> = {
  gateway: "gateway error",
  overBudget: "over the daily ceiling",
  timeout: "timeout",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

function visitLine(v: VisitReads | null | undefined): string {
  if (!v?.lastHourVisits) return "No page visit in the last hour.";
  const failed = v.failedShare != null ? `, ${pct(v.failedShare)} of reads failed` : "";
  const p95 = v.p95Ms != null ? `, 95% answered within ${n(Math.round(v.p95Ms))} ms` : "";
  return `${n(v.lastHourVisits)} visits in the last hour${failed}${p95}.`;
}

function pipelineLine(e: StatusEntry, now: number): string {
  const t = pipelineHeartbeat(e);
  if (t != null)
    return `${HEARTBEAT_WORDS[pipelineState(e, now)]}: last write at ${utcTime(t)}, ${ageWords(now - t)} ago.`;
  const b = pipelineNewestBlockTime(e);
  return b != null ? `No write time stored. The newest row is from a block of ${utcTime(b)}.` : "No write time stored.";
}

/** What a row shows for one protocol on one chain. */
interface CellView {
  hb: Heartbeat;
  /** The status column's word. */
  status: string;
  /** How far the index has read: a percent, "Full", "Partial" or "On visit". */
  index: string;
  /** The index column's sort key: percent read, 100 for a full index, -1 on visit. */
  indexRank: number;
  /** The last write or visit, unix seconds. */
  last: number | null;
  /** What keeps it current. */
  lane: string;
  title: string;
}

function cellView(c: StatusCell, now: number, allowance: Allowance | null): CellView {
  const live = c.entry?.live;
  const lane = live ? laneWords(live.lane, live.visitReads?.gateway) : c.fill ? "The full-history fill" : "–";
  if (c.fill) {
    const hb = fillState(c.fill, now);
    const stall = fillStall(c.fill);
    return {
      hb,
      status: stall && hb === "late" && !c.fill.held && !liveMiss(c.fill, now) ? "Not gaining" : STATUS_WORDS[hb],
      index: percentWords(c.fill),
      indexRank: c.fill.atHead ? 100 : (c.fill.percent ?? 0),
      last: heartbeatTime(c.fill),
      lane,
      title: heartbeatLine(c.fill, now, allowance),
    };
  }
  if (c.kind === "pipeline" && c.entry) {
    const hb = pipelineState(c.entry, now);
    // A roster entry with no `history` is indexed from deployment.
    const partial = Boolean(rosterFor(c.key, c.chain)?.history);
    return {
      hb,
      status: STATUS_WORDS[hb],
      index: partial ? "Partial" : "Full",
      indexRank: partial ? 50 : 100,
      last: pipelineHeartbeat(c.entry),
      lane,
      title: pipelineLine(c.entry, now),
    };
  }
  const v = live?.visitReads;
  const hb = visitState(v);
  const lastVisit = v?.lastVisitAt ? Date.parse(v.lastVisitAt) / 1000 : null;
  return {
    hb,
    status: STATUS_WORDS[hb],
    index: "On visit",
    indexRank: -1,
    last: lastVisit,
    lane,
    title: `No index yet; reads when a page opens. ${visitLine(v)}`,
  };
}

/** One figure: its name, its value and where it comes from. */
function Figure({ name, value, source }: { name: string; value: ReactNode; source: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-x-3 sm:grid-cols-[10rem_1fr_auto] sm:gap-x-4">
      <dt className="text-rb-500">{name}</dt>
      <dd className="text-foreground tabular-nums">{value}</dd>
      <dd className="col-start-2 text-xs text-rb-400 sm:col-start-3 sm:text-right">{source}</dd>
    </div>
  );
}

function BlockAt({ chain, block, time }: { chain: number; block: number; time: number | null }) {
  return (
    <>
      <a
        href={explorerUrl(chain as ChainId, "block", String(block))}
        target="_blank"
        rel="noopener"
        className="link-external"
      >
        {n(block)}
      </a>
      {time != null && <span className="text-rb-500"> · {formatDate(time)}</span>}
    </>
  );
}

/** A filter's contracts: the first few, and the rest a tap away (Euler's
 *  vaults filter names hundreds). */
function Contracts({ chain, contracts }: { chain: number; contracts: string[] }) {
  const [all, setAll] = useState(false);
  const FEW = 6;
  const shown = all ? contracts : contracts.slice(0, FEW);
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-2 text-rb-500">
      {contracts.length === 0
        ? "Contracts:"
        : contracts.length === 1
          ? "Contract:"
          : `${n(contracts.length)} contracts:`}
      {contracts.length === 0 && <span>none recorded yet</span>}
      {shown.map((c) => (
        <a
          key={c}
          href={explorerUrl(chain as ChainId, "address", c)}
          target="_blank"
          rel="noopener"
          className="link-external font-mono"
        >
          {c.slice(0, 6)}…{c.slice(-4)}
        </a>
      ))}
      {contracts.length > FEW && (
        <button type="button" onClick={() => setAll((a) => !a)} className="text-foreground underline">
          {all ? "Fewer" : `${n(contracts.length - FEW)} more`}
        </button>
      )}
    </div>
  );
}

function ChainDetail({ e, now, allowance }: { e: IndexProgressEntry; now: number; allowance: Allowance | null }) {
  return (
    <section>
      <p className="text-xs text-rb-500">{heartbeatLine(e, now, allowance)}</p>

      <dl className="mt-3 flex flex-col gap-y-1.5 text-sm">
        <Figure
          name="Starts at"
          value={
            e.start ? (
              <>
                <BlockAt chain={e.chain} {...e.start} />
                <span className="text-rb-500">
                  {e.start.isDeployment ? " · the deployment block" : " · after deployment"}
                </span>
              </>
            ) : (
              "Not started"
            )
          }
          source="lowest stored block"
        />
        {e.start && !e.start.isDeployment && e.deployment && (
          <Figure name="Deployed at" value={<BlockAt chain={e.chain} {...e.deployment} />} source="eth_getCode" />
        )}
        <Figure
          name="Read through"
          value={e.through ? <BlockAt chain={e.chain} {...e.through} /> : "–"}
          source="every filter's cursor, hourly"
        />
        <Figure
          name="Chain head"
          value={e.head ? <BlockAt chain={e.chain} {...e.head} /> : "Not read yet"}
          source="finalized block, every 10 min"
        />
        <Figure
          name="Read"
          value={e.atHead ? "At the head" : e.percent != null ? `${e.percent}%` : "Needs the head"}
          source="blocks read over blocks to head"
        />
        <Figure name="Rows held" value={n(e.rows)} source="kept logs, all tables" />
        {e.requests != null && e.bytesRead != null && (
          <Figure
            name="Fetched"
            value={`${n(e.requests)} requests · ${bytesWords(e.bytesRead)}`}
            source="JSON as read"
          />
        )}
        <Figure
          name="Pace"
          value={
            e.pace
              ? `${n(Math.round(e.pace.blocksPerHour))} blocks an hour (the chain makes ${n(Math.round(e.pace.headBlocksPerHour))})`
              : e.atHead
                ? "Keeping up with the head"
                : "Measuring: needs two hourly samples"
          }
          source="hourly samples, last day"
        />
        {!e.atHead && (
          <Figure
            name="Expected finish"
            value={e.eta ? formatDate(e.eta) : e.pace ? "Not gaining on the head" : "Once pace is measured"}
            source="blocks left over hourly gain"
          />
        )}
        <Figure
          name="Last check"
          value={
            e.check ? (
              <>
                <span className={e.check.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                  {e.check.ok ? "Passed" : "Failed"}
                </span>
                <span className="text-rb-500">
                  {" "}
                  · {e.check.summary} at block {n(e.check.block)} · {utcTime(Date.parse(e.check.ranAt) / 1000)}
                </span>
              </>
            ) : (
              <span className="text-rb-500">
                {e.atHead ? "None stored yet" : "Runs when the index reaches the head"}
              </span>
            )
          }
          source="conservation check"
        />
      </dl>

      {e.sources && e.sources.length > 0 && (
        <div className="mt-4" data-anatomy="Y1.3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-rb-500">Receipts</h4>
          <ul className="mt-2 flex flex-col gap-3">
            {e.sources.map((s) => (
              <li key={s.filter} className="border-l-2 border-rb-200 pl-3 text-xs dark:border-rb-700">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold text-foreground">{s.filter}</span>
                  <span className="text-rb-500 tabular-nums">
                    blocks {s.startBlock != null ? n(s.startBlock) : "–"} to{" "}
                    {s.throughBlock != null ? n(s.throughBlock) : "–"}
                    {s.endBlock != null && ` (ends at ${n(s.endBlock)})`}
                  </span>
                </div>
                <div className="mt-1 text-rb-500">
                  Events: <span className="text-foreground">{s.events.map((ev) => ev.name).join(", ")}</span>
                </div>
                <Contracts chain={e.chain} contracts={s.contracts} />
                <div className="mt-0.5 text-rb-500">
                  Answered by:{" "}
                  <span className="text-foreground">
                    {s.hosts.length ? s.hosts.join(", ") : "no host recorded yet"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {e.sieve && (
        <p className="mt-3 text-xs text-rb-500">
          Also in Sieve, read from Ethereum peers through block {n(e.sieve.checkpoint)}:{" "}
          {e.sieve.tables.map((t) => `${t.table} from ${n(t.fromBlock)}`).join(", ")}.
        </p>
      )}
    </section>
  );
}

const WRITER_KIND: Record<string, string> = {
  processor: "processor",
  "copy-worker": "copy worker",
  "mv-refresh": "view refresh",
};

/** The pipeline's name as the page writes it ("sieve", "processor:x"). */
const pipelineWords = (p: string) =>
  p === "sieve" ? "Sieve" : p.startsWith("processor:") ? `Processor ${p.slice(10)}` : p;

/** A gateway host as the provider that runs it. */
const providerWords = (host: string | null | undefined) =>
  !host
    ? "the chain"
    : /gateway\.tenderly\.co$/.test(host)
      ? "Tenderly's free gateway"
      : /alchemy\.com$/.test(host)
        ? "Alchemy"
        : host;

const SIEVE_LANES: Record<string, string> = {
  ethereum: "Sieve, from Ethereum peers",
  base: "Sieve (Base)",
  arbitrum: "Sieve (Arbitrum)",
};

/** What keeps an index current, with where a read on visit comes from. */
const laneWords = (lane: string, gateway?: string | null) =>
  lane === "visit-reads"
    ? `Read on visit, from ${providerWords(gateway)}`
    : lane.startsWith("sieve:")
      ? (SIEVE_LANES[lane.slice(6)] ?? `Sieve (${lane.slice(6)})`)
      : lane.startsWith("processor:")
        ? `Processor ${lane.slice(10)}`
        : lane;

/** A chain's detail for an index kept by Sieve or a processor, or not started. */
function PipelineDetail({ e, now }: { e: StatusEntry; now: number }) {
  const b = e.backfill;
  const live = e.live;
  const hb = b ? pipelineState(e, now) : visitState(live?.visitReads);
  return (
    <section>
      <p className="text-xs text-rb-500">
        {b
          ? pipelineLine(e, now)
          : `No index yet. Its pages read the chain when they open. ${visitLine(live?.visitReads)}`}
      </p>
      <dl className="mt-3 flex flex-col gap-y-1.5 text-sm">
        {b && (
          <Figure
            name="Indexed by"
            value={<LaneText text={pipelineWords(b.pipeline)} />}
            source="the server's pipeline table"
          />
        )}
        {b?.start && (
          <Figure name="Starts at" value={<BlockAt chain={e.chain} {...b.start} />} source="lowest stored block" />
        )}
        {b && (
          <Figure
            name="Read through"
            value={b.through ? <BlockAt chain={e.chain} {...b.through} /> : "–"}
            source="newest stored row"
          />
        )}
        {(live?.head ?? b?.head) && (
          <Figure
            name="Chain head"
            value={<BlockAt chain={e.chain} {...(live?.head ?? b!.head)!} />}
            source="finalized block, every 10 min"
          />
        )}
        {live && (
          <Figure
            name="Kept current by"
            value={
              <>
                <LaneText text={laneWords(live.lane, live.visitReads?.gateway)} />
                {live.checkpoint && (
                  <span className="text-rb-500">
                    {" "}
                    · checkpoint {n(live.checkpoint.block)}
                    {live.checkpoint.updatedAt &&
                      `, moved ${ageWords(now - Date.parse(live.checkpoint.updatedAt) / 1000)} ago`}
                  </span>
                )}
              </>
            }
            source="live lane"
          />
        )}
        {live?.unreachable && (
          <Figure
            name="Lane"
            value={<span className="text-red-600 dark:text-red-400">Unreachable: {live.unreachable.error}</span>}
            source="the lane's database"
          />
        )}
        {live?.visitReads && (
          <Figure name="Live reads" value={live.visitReads.gateway} source="gateway for reads at the head" />
        )}
        {live?.visitReads?.lastHourVisits != null && (
          <Figure
            name="Last hour"
            value={
              <>
                {visitLine(live.visitReads)}
                {live.visitReads.byCause && Object.keys(live.visitReads.byCause).length > 0 && (
                  <span className="text-rb-500">
                    {" "}
                    Failed:{" "}
                    {Object.entries(live.visitReads.byCause)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => `${CAUSE_WORDS[k] ?? k} ${n(v)}`)
                      .join(", ")}
                    .
                  </span>
                )}
              </>
            }
            source="visit tally, hourly"
          />
        )}
      </dl>
      {live && live.writers.length > 0 && (
        <div className="mt-4" data-anatomy="Y1.3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-rb-500">Writers</h4>
          <ul className="mt-2 flex flex-col gap-2">
            {live.writers.map((w) => (
              <li key={w.name} className="border-l-2 border-rb-200 pl-3 text-xs dark:border-rb-700">
                <span className="font-semibold text-foreground">{w.name}</span>
                <span
                  className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${DOT[writerState(w, now, e)]}`}
                />
                <span className="text-rb-500"> · {WRITER_KIND[w.kind] ?? w.kind}</span>
                <span className="text-rb-500">
                  {" "}
                  · {w.expectEverySec ? `runs every ${ageWords(w.expectEverySec)}` : "runs on events"}
                </span>
                <div className="mt-0.5 text-rb-500">
                  {w.lastRunAt &&
                    `Last ran ${utcTime(Date.parse(w.lastRunAt) / 1000)}${w.lastRunOk === false ? ` and failed (${errorKind(w.lastRunError ?? null) ?? "Error"})` : ""} · `}
                  {w.lastWriteAt ? `Last write ${utcTime(Date.parse(w.lastWriteAt) / 1000)}` : "No write time stored"}
                  {w.newest && ` · newest row at block ${n(w.newest.block)}`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The chains the toggle offers, in the site's order. */
const CHAIN_ORDER = [1, 8453, 42161, 10, 5042, 4663, 11155111];
function chainsOf(cells: StatusCell[], next: NextItem[]): ChainId[] {
  const present = [...new Set([...cells.map((c) => c.chain), ...next.flatMap((i) => i.chains)])].filter(
    (c): c is ChainId => c in CHAINS,
  );
  const rank = (c: number) => (CHAIN_ORDER.includes(c) ? CHAIN_ORDER.indexOf(c) : CHAIN_ORDER.length);
  return present.sort((x, y) => rank(x) - rank(y));
}

/** The first two columns' widths, shared by the status table and the
 *  coming-soon table so their columns line up. */
const COL = { protocol: "sm:w-[28%]", second: "sm:w-[18%]" };

type SortKey = "name" | "status" | "index" | "last";
const STATUS_RANK: Record<Heartbeat, number> = { stalled: 0, late: 1, paused: 2, none: 3, fresh: 4 };

interface Line {
  cell: StatusCell;
  name: string;
  markId: string;
  view: CellView;
}

function Row({ line, now, allowance }: { line: Line; now: number; allowance: Allowance | null }) {
  const [open, setOpen] = useState(false);
  const { cell: c, view: v } = line;
  return (
    <Fragment>
      <DataTableGroupRow
        open={open}
        onToggle={() => setOpen((o) => !o)}
        data-status-row={`${c.key}-${c.chain}`}
        label={
          <span className="inline-flex items-center gap-2.5">
            <Mark id={line.markId} name={line.name} />
            {line.name}
          </span>
        }
        cells={
          <>
            <DataTableCell valign="middle" label="Status">
              <span className="inline-flex items-center gap-2 text-sm" data-anatomy="Y1.1" title={v.title}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[v.hb]}`} aria-hidden />
                <span className={v.hb === "none" ? "text-rb-500" : "text-foreground"}>{v.status}</span>
              </span>
            </DataTableCell>
            <DataTableCell valign="middle" label="Index" className="text-sm tabular-nums">
              <span className={v.indexRank < 0 ? "text-rb-500" : "text-foreground"}>{v.index}</span>
            </DataTableCell>
            <DataTableCell valign="middle" label="Last write" className="text-sm tabular-nums text-rb-500">
              {v.last != null ? `${ageWords(now - v.last)} ago` : "–"}
            </DataTableCell>
            <DataTableCell valign="middle" label="Kept current by" className="text-sm text-rb-500">
              <LaneText text={v.lane} />
            </DataTableCell>
          </>
        }
      />
      {open && (
        <DataTableRow drawer>
          <DataTableCell colSpan={5} wide className="pb-6">
            <div className="sm:pl-[2.25rem]" data-anatomy="Y1.2">
              {c.fill ? (
                <ChainDetail e={c.fill} now={now} allowance={allowance} />
              ) : c.entry ? (
                <PipelineDetail e={c.entry} now={now} />
              ) : null}
            </div>
          </DataTableCell>
        </DataTableRow>
      )}
    </Fragment>
  );
}

/** What comes to Rails next on one chain (Y3): one row per item, in the list's order. */
function NextTable({ chain, items }: { chain: number; items: NextItem[] }) {
  const here = items.filter((i) => i.chains.includes(chain));
  if (!here.length) return null;
  return (
    <section className="mt-14">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">Coming soon to Rails</h2>
      <DataTable
        label={`Coming soon to Rails on ${chainName(chain)}`}
        anatomy="Y3"
        stacked
        className="mt-4"
        tableClassName="sm:table-fixed"
      >
        <DataTableHead>
          <DataTableHeader label="Protocol" className={COL.protocol} />
          <DataTableHeader label="Stage" className={COL.second} />
          <DataTableHeader label="Why" className="sm:w-[34%]" />
          <DataTableHeader label="Source" />
        </DataTableHead>
        <DataTableBody>
          {here.map((i) => (
            <DataTableRow key={i.key} data-next={i.key}>
              <DataTableCell rowHeader valign="middle">
                <span className="inline-flex items-center gap-2.5 text-[14px] font-semibold text-foreground">
                  <Mark id={i.mark} name={i.name} />
                  {i.name}
                </span>
              </DataTableCell>
              <DataTableCell valign="middle" label="Stage">
                <span className="inline-flex flex-wrap gap-1.5" data-anatomy="Y3.1">
                  <span className={`whitespace-nowrap px-1.5 py-0.5 text-xs ${DATA_TABLE_PILL}`}>
                    {NEXT_STAGE_WORDS[i.stage]}
                  </span>
                </span>
              </DataTableCell>
              <DataTableCell valign="middle" label="Why" wide className="text-sm text-rb-600 dark:text-rb-300">
                {i.why}
              </DataTableCell>
              <DataTableCell valign="middle" label="Source">
                <a href={i.source.href} target="_blank" rel="noopener" className="link-external text-xs">
                  {i.source.label}
                </a>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </section>
  );
}

/** What a /status/<view> route shows: one chain, or the Prices view. */
export type StatusView = { kind: "chain"; chain: ChainId } | { kind: "prices" };

/** The chain segments and Prices as links between the /status routes (Y4). */
function StatusToggle({ chains, view, prices }: { chains: ChainId[]; view: StatusView; prices: boolean }) {
  return (
    <nav className={`${SEGMENT_SHELL} flex-wrap`} aria-label="Status by chain">
      {chains.map((id) => {
        const active = view.kind === "chain" && view.chain === id;
        return (
          <Link
            key={id}
            href={`/status/${CHAINS[id].slug}`}
            aria-current={active ? "page" : undefined}
            className={segmentClass(active)}
          >
            <ToggleGlyph chainId={id} className="h-3.5 w-3.5 max-[380px]:hidden" />
            {CHAINS[id].name}
          </Link>
        );
      })}
      {prices && (
        <Link
          href="/status/prices"
          aria-current={view.kind === "prices" ? "page" : undefined}
          className={`${segmentClass(view.kind === "prices")} whitespace-nowrap`}
        >
          Prices
        </Link>
      )}
    </nav>
  );
}

export function StatusBoard({ source, view }: { source: StatusSource; view: StatusView }) {
  const router = useRouter();
  const asOf = Date.parse(source.data.asOf) / 1000;
  // The server's time first, so the markup matches; the browser's clock after.
  const [now, setNow] = useState(asOf);
  useEffect(() => {
    setNow(Date.now() / 1000);
    const tick = setInterval(() => setNow(Date.now() / 1000), 30_000);
    const refresh = setInterval(() => router.refresh(), 60_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  const cells =
    source.route === "status"
      ? cellsFromStatus(withHeadMisses(source.data), protocolLabel)
      : cellsFromProgress(withHeadMisses(source.data));
  const atHead = (protocol: string, ch: number) =>
    cells.some((c) => c.protocol === protocol && c.chain === ch && c.fill?.atHead === true);
  const next = nextItems(atHead);
  const chains = chainsOf(cells, next);
  const allowance = source.route === "status" ? (source.data.allowance ?? null) : null;
  const gateways = source.route === "status" ? (source.data.gateways ?? []) : [];
  const allowanceText = allowance ? allowanceLine(allowance, gateways) : null;
  const prices = source.route === "status" ? (source.data.prices ?? null) : null;
  const pricesOpen = view.kind === "prices";
  const chain: ChainId = view.kind === "chain" ? view.chain : 1;
  const [sort, setSort] = useState<{ key: SortKey; dir: DataTableDir }>({ key: "status", dir: "asc" });

  const lines: Line[] = cells
    .filter((c) => c.chain === chain)
    .map((c) => {
      const entry = rosterFor(c.key, c.chain);
      const name = entry?.label ?? (c.fill ? c.fill.label.split(" · ")[0] : c.key);
      return { cell: c, name, markId: entry?.id ?? c.key, view: cellView(c, now, allowance) };
    });
  const byName = (a: Line, b: Line) => a.name.localeCompare(b.name, "en-US");
  const cmp: Record<SortKey, (a: Line, b: Line) => number> = {
    name: byName,
    status: (a, b) => STATUS_RANK[a.view.hb] - STATUS_RANK[b.view.hb] || byName(a, b),
    index: (a, b) => a.view.indexRank - b.view.indexRank || byName(a, b),
    last: (a, b) => (a.view.last ?? -Infinity) - (b.view.last ?? -Infinity) || byName(a, b),
  };
  const sign = sort.dir === "asc" ? 1 : -1;
  lines.sort((a, b) => sign * cmp[sort.key](a, b));
  const sortBy = (key: SortKey) => ({
    dir: sort.key === key ? sort.dir : null,
    onSort: () =>
      setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" })),
  });

  return (
    <div className="mt-10">
      <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0" data-anatomy="Y4">
        <StatusToggle chains={chains} view={view} prices={Boolean(prices)} />
      </div>
      {pricesOpen && prices ? (
        <PricesView prices={prices} now={now} />
      ) : pricesOpen ? (
        <p className="text-sm text-rb-500">The index server does not report prices yet.</p>
      ) : lines.length > 0 ? (
        <>
          {/* Below sm the table stacks into cards with no header row; the sort is a select. */}
          <label className="mb-3 flex items-center gap-2 text-xs text-rb-500 sm:hidden" data-anatomy="Y1.4">
            Sort by
            <select
              value={`${sort.key}:${sort.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":") as [SortKey, DataTableDir];
                setSort({ key, dir });
              }}
              className="rounded-sm border border-rb-200 bg-transparent px-1.5 py-1 text-foreground dark:border-rb-700"
            >
              <option value="status:asc">Status, problems first</option>
              <option value="name:asc">Protocol, A to Z</option>
              <option value="index:asc">Index, least read first</option>
              <option value="last:asc">Last write, oldest first</option>
            </select>
          </label>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-rb-500" data-anatomy="Y2">
            {(["fresh", "late", "stalled", "paused", "none"] as const).map((h) => (
              <span key={h} className="inline-flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${DOT[h]}`} />
                {h === "fresh"
                  ? "Arriving: on schedule"
                  : h === "late"
                    ? `Late: past 1.5 times its schedule, or ${pct(VISIT_FAIL_LATE)} of visit reads failing`
                    : h === "stalled"
                      ? `Stalled: past 3 times its schedule, or ${pct(VISIT_FAIL_STALLED)} failing`
                      : h === "paused"
                        ? "Paused: held for the daily allowance"
                        : "Not measured: no write time or visit"}
              </span>
            ))}
          </div>
          {allowanceText && (
            <p className="mb-3 text-xs text-rb-500" data-anatomy="Y2.1">
              {allowanceText}
            </p>
          )}
          <DataTable
            label={`Indexing status on ${chainName(chain)}`}
            anatomy="Y1"
            stacked
            tableClassName="sm:table-fixed"
          >
            <DataTableHead>
              <DataTableHeader label="Protocol" sort={sortBy("name")} className={COL.protocol} />
              <DataTableHeader label="Status" sort={sortBy("status")} className={COL.second} />
              <DataTableHeader label="Index" sort={sortBy("index")} className="sm:w-[12%]" />
              <DataTableHeader label="Last write" sort={sortBy("last")} className="sm:w-[16%]" />
              <DataTableHeader label="Kept current by" />
            </DataTableHead>
            <DataTableBody>
              {lines.map((l) => (
                <Row key={`${l.cell.key}-${l.cell.chain}`} line={l} now={now} allowance={allowance} />
              ))}
            </DataTableBody>
          </DataTable>
          <p className="mt-4 text-xs text-rb-500">
            From /api/index/{source.route} on the Rails index server, as of {utcTime(asOf)}. The server answers from its
            stored rows; opening this page reads no chain.
          </p>
        </>
      ) : (
        <p className="text-sm text-rb-500">No Rails explorer on {chainName(chain)} yet.</p>
      )}
      {!pricesOpen && <NextTable chain={chain} items={next} />}
    </div>
  );
}

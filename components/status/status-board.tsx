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
import { ChainGlyph, HomeOnlyChainGlyph } from "@/components/icons/chain-glyphs";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableGroupRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DATA_TABLE_PILL,
} from "@/components/shared/data-table/data-table";
import { NEXT_STAGE_WORDS, nextItems } from "@/lib/status/next";
import { CHAINS, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { PROTOCOLS } from "@/lib/shared/protocols";
import {
  ageWords,
  bytesWords,
  cellsFromProgress,
  cellsFromStatus,
  heartbeatAge,
  heartbeatIsWallTime,
  heartbeatState,
  heartbeatTime,
  percentWords,
  pipelineHeartbeat,
  pipelineNewestBlockTime,
  statusRows,
  type Heartbeat,
  type IndexProgress,
  type IndexProgressEntry,
  type IndexStatus,
  type StatusCell,
  type StatusEntry,
  type StatusRow,
} from "@/lib/shared/index-progress";

/** The page's data: /status where the server has it, else /progress. */
export type StatusSource = { route: "status"; data: IndexStatus } | { route: "progress"; data: IndexProgress };

const ROBINHOOD = 4663;
const chainName = (id: number) => CHAINS[id as ChainId]?.name ?? (id === ROBINHOOD ? "Robinhood Chain" : `Chain ${id}`);

/** A chain's mark at the row's size. */
function ChainMark({ id }: { id: number }) {
  const cls = "h-4 w-4 shrink-0 text-rb-500";
  if (id in CHAINS) return <ChainGlyph id={id as ChainId} className={cls} />;
  if (id === ROBINHOOD) return <HomeOnlyChainGlyph id="robinhood" className={cls} />;
  return null;
}

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

const DOT: Record<Heartbeat, string> = {
  fresh: "bg-green-500",
  late: "bg-amber-500",
  stalled: "bg-red-500",
  none: "bg-rb-300 dark:bg-rb-600",
};

const HEARTBEAT_WORDS: Record<Heartbeat, string> = {
  fresh: "Reporting",
  late: "Late",
  stalled: "Stalled",
  none: "No heartbeat yet",
};

const utcTime = (t: number) => {
  const d = new Date(t * 1000);
  return `${formatDate(t)}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
};

const n = (x: number) => x.toLocaleString("en-US");

function heartbeatLine(e: IndexProgressEntry, now: number): string {
  const t = heartbeatTime(e);
  if (t == null) return "The fill has not reported this index yet.";
  const words = HEARTBEAT_WORDS[heartbeatState(e, now)];
  return heartbeatIsWallTime(e)
    ? `${words}: the fill last wrote at ${utcTime(t)}, ${ageWords(now - t)} ago.`
    : `${words}: last planned against the finalized block of ${utcTime(t)}, ${ageWords(now - t)} ago.`;
}

function pipelineLine(e: StatusEntry, now: number): string {
  const t = pipelineHeartbeat(e);
  if (t != null)
    return `${HEARTBEAT_WORDS[heartbeatAge(t, now)]}: last write at ${utcTime(t)}, ${ageWords(now - t)} ago.`;
  const b = pipelineNewestBlockTime(e);
  return b != null ? `No write time stored. The newest row is from a block of ${utcTime(b)}.` : "No write time stored.";
}

/** A chain's cell on a protocol's row: the heartbeat dot and how far the index has read. */
function ChainCell({ c, now }: { c: StatusCell; now: number }) {
  let hb: Heartbeat = "none";
  let title = "";
  let text = "";
  let muted = false;
  if (c.fill) {
    hb = heartbeatState(c.fill, now);
    title = heartbeatLine(c.fill, now);
    text = percentWords(c.fill);
    muted = c.fill.percent == null && !c.fill.atHead;
  } else if (c.kind === "pipeline" && c.entry) {
    hb = heartbeatAge(pipelineHeartbeat(c.entry), now);
    title = pipelineLine(c.entry, now);
    // A roster entry with no `history` is indexed from deployment.
    text = rosterFor(c.key, c.chain)?.history ? "Partial" : "Full";
  } else {
    title = "No index yet.";
    text = "Not started";
    muted = true;
  }
  return (
    <span
      className="inline-flex items-center gap-2 text-sm"
      data-anatomy="Y1.1"
      title={title}
      data-status-cell={`${c.protocol}-${c.chain}`}
    >
      {c.kind !== "not-started" && (
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[hb]}`} aria-label={HEARTBEAT_WORDS[hb]} />
      )}
      <span className={`tabular-nums ${muted ? "text-rb-500" : "text-foreground"}`}>{text}</span>
    </span>
  );
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

function ChainDetail({ e, now }: { e: IndexProgressEntry; now: number }) {
  const hb = heartbeatState(e, now);
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className={`h-2 w-2 rounded-full ${DOT[hb]}`} />
        {chainName(e.chain)}
      </h3>
      <p className="mt-1 text-xs text-rb-500">{heartbeatLine(e, now)}</p>

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
  p === "sieve" ? "Sieve, from Ethereum peers" : p.startsWith("processor:") ? `Processor ${p.slice(10)}` : p;

const laneWords = (lane: string) =>
  lane === "visit-reads"
    ? "Read on visit"
    : lane.startsWith("sieve:")
      ? `Sieve (${lane.slice(6)})`
      : lane.startsWith("processor:")
        ? `Processor ${lane.slice(10)}`
        : lane;

/** A chain's detail for an index kept by Sieve or a processor, or not started. */
function PipelineDetail({ e, now }: { e: StatusEntry; now: number }) {
  const b = e.backfill;
  const live = e.live;
  const t = pipelineHeartbeat(e);
  const hb = b ? heartbeatAge(t, now) : "none";
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {b && <span className={`h-2 w-2 rounded-full ${DOT[hb]}`} />}
        {chainName(e.chain)}
      </h3>
      <p className="mt-1 text-xs text-rb-500">
        {b ? pipelineLine(e, now) : "No index yet. Its pages read the chain when they open."}
      </p>
      <dl className="mt-3 flex flex-col gap-y-1.5 text-sm">
        {b && <Figure name="Indexed by" value={pipelineWords(b.pipeline)} source="the server's pipeline table" />}
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
                {laneWords(live.lane)}
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
      </dl>
      {live && live.writers.length > 0 && (
        <div className="mt-4" data-anatomy="Y1.3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-rb-500">Writers</h4>
          <ul className="mt-2 flex flex-col gap-2">
            {live.writers.map((w) => (
              <li key={w.name} className="border-l-2 border-rb-200 pl-3 text-xs dark:border-rb-700">
                <span className="font-semibold text-foreground">{w.name}</span>
                <span className="text-rb-500"> · {WRITER_KIND[w.kind] ?? w.kind}</span>
                <div className="mt-0.5 text-rb-500">
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

/** The chains the table has a column for, in the site's order. */
const CHAIN_ORDER = [1, 8453, 42161, 10, 5042, 11155111];
function chainColumns(cells: StatusCell[]): number[] {
  const present = [...new Set(cells.map((c) => c.chain))];
  const rank = (c: number) => (CHAIN_ORDER.includes(c) ? CHAIN_ORDER.indexOf(c) : CHAIN_ORDER.length);
  return present.sort((x, y) => rank(x) - rank(y));
}

function Row({ row, chains, now }: { row: StatusRow; chains: number[]; now: number }) {
  const [open, setOpen] = useState(false);
  const first = row.cells[0];
  return (
    <Fragment>
      <DataTableGroupRow
        open={open}
        onToggle={() => setOpen((o) => !o)}
        data-status-row={row.key}
        label={
          <span className="inline-flex items-center gap-2.5">
            <Mark id={rosterFor(row.key, first.chain)?.id ?? row.key} name={row.name} />
            {row.name}
          </span>
        }
        cells={chains.map((ch) => {
          const c = row.cells.find((x) => x.chain === ch);
          return (
            <DataTableCell key={ch} valign="middle" label={c ? chainName(ch) : undefined}>
              {c ? <ChainCell c={c} now={now} /> : null}
            </DataTableCell>
          );
        })}
      />
      {open && (
        <DataTableRow drawer>
          <DataTableCell colSpan={chains.length + 1} wide className="pb-6">
            <div className="flex flex-col gap-5 sm:pl-[2.25rem]" data-anatomy="Y1.2">
              {row.cells.map((c) =>
                c.fill ? (
                  <ChainDetail key={c.chain} e={c.fill} now={now} />
                ) : c.entry ? (
                  <PipelineDetail key={c.chain} e={c.entry} now={now} />
                ) : null,
              )}
            </div>
          </DataTableCell>
        </DataTableRow>
      )}
    </Fragment>
  );
}

/** What Rails builds next (Y3): one row per item, in the list's order. */
function NextTable({ atHead }: { atHead: (protocol: string, chain: number) => boolean }) {
  const items = nextItems(atHead);
  if (!items.length) return null;
  return (
    <section className="mt-14">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">Next</h2>
      <p className="mt-2 max-w-2xl text-sm text-rb-500">What Rails builds next, in order.</p>
      <DataTable label="What Rails builds next" anatomy="Y3" stacked className="mt-4">
        <DataTableHead>
          <DataTableHeader label="Protocol" />
          <DataTableHeader label="Stage" />
          <DataTableHeader label="Why" />
          <DataTableHeader label="Source" />
        </DataTableHead>
        <DataTableBody>
          {items.map((i) => (
            <DataTableRow key={i.key} data-next={i.key}>
              <DataTableCell rowHeader valign="middle">
                <span className="inline-flex items-center gap-2.5 text-[14px] font-semibold text-foreground">
                  <Mark id={i.mark} name={i.name} />
                  {i.name}
                  <span className="inline-flex items-center gap-1.5" aria-label={i.chains.map(chainName).join(", ")}>
                    {i.chains.map((c) => (
                      <span key={c} title={chainName(c)}>
                        <ChainMark id={c} />
                      </span>
                    ))}
                  </span>
                </span>
              </DataTableCell>
              <DataTableCell valign="middle" label="Stage">
                <span className="inline-flex flex-wrap gap-1.5" data-anatomy="Y3.1">
                  <span className={`whitespace-nowrap px-1.5 py-0.5 text-xs ${DATA_TABLE_PILL}`}>
                    {NEXT_STAGE_WORDS[i.stage]}
                  </span>
                  {i.held && <span className={`px-1.5 py-0.5 text-xs ${DATA_TABLE_PILL}`}>Held</span>}
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

export function StatusBoard({ source }: { source: StatusSource }) {
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
    source.route === "status" ? cellsFromStatus(source.data, protocolLabel) : cellsFromProgress(source.data);
  const rows = statusRows(cells, (key, chain) => {
    const fill = cells.find((c) => c.key === key && c.fill)?.fill;
    return rosterFor(key, chain)?.label ?? (fill ? fill.label.split(" · ")[0] : key);
  });
  const chains = chainColumns(cells);
  const atHead = (protocol: string, chain: number) =>
    cells.some((c) => c.protocol === protocol && c.chain === chain && c.fill?.atHead === true);
  return (
    <div className="mt-10">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-rb-500" data-anatomy="Y2">
        {(["fresh", "late", "stalled", "none"] as const).map((h) => (
          <span key={h} className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[h]}`} />
            {h === "fresh"
              ? "Wrote within the hour"
              : h === "late"
                ? "Late, over an hour"
                : h === "stalled"
                  ? "Stalled, over three hours"
                  : "No write time stored"}
          </span>
        ))}
      </div>
      <DataTable label="Indexing progress by protocol and chain" anatomy="Y1" stacked stackBelow="lg">
        <DataTableHead>
          <DataTableHeader label="Protocol" />
          {chains.map((c) => (
            <DataTableHeader key={c} label={chainName(c)} />
          ))}
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <Row key={r.key} row={r} chains={chains} now={now} />
          ))}
        </DataTableBody>
      </DataTable>
      <p className="mt-4 text-xs text-rb-500">
        From /api/index/{source.route} on the Rails index server, as of {utcTime(asOf)}. The server answers from its
        stored rows; opening this page reads no chain.
      </p>
      <NextTable atHead={atHead} />
    </div>
  );
}

"use client";

// The status page's board (rails-ops ui-jobs 583): the house table (D1), one
// row per protocol and a column per chain (a heartbeat dot and the percent
// read); opening a row (D8) shows each
// chain's figures, each with its source, and the filters' receipts. The page
// refreshes its data every minute and the dots' ages every 30 s.

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableGroupRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { CHAINS, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { PROTOCOLS } from "@/lib/shared/protocols";
import {
  ageWords,
  bytesWords,
  heartbeatState,
  heartbeatTime,
  percentWords,
  protocolRows,
  type Heartbeat,
  type IndexProgress,
  type IndexProgressEntry,
  type ProtocolRow,
} from "@/lib/shared/index-progress";

const ROUTE = "/api/index/progress";

const chainName = (id: number) => CHAINS[id as ChainId]?.name ?? `Chain ${id}`;

/** The roster id whose mark the row wears: the first explorer keyed to the protocol. */
function iconId(protocol: string): string {
  return PROTOCOLS.find((p) => (p.protocolKey ?? p.id) === protocol || p.id === protocol)?.id ?? protocol;
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
  return `${HEARTBEAT_WORDS[heartbeatState(e, now)]}: last planned against the finalized block of ${utcTime(t)}, ${ageWords(now - t)} ago.`;
}

/** A chain's cell on a protocol's row: the heartbeat dot and the percent read. */
function ChainCell({ e, now }: { e: IndexProgressEntry; now: number }) {
  const hb = heartbeatState(e, now);
  return (
    <span
      className="inline-flex items-center gap-2 text-sm"
      data-anatomy="Y1.1"
      title={heartbeatLine(e, now)}
      data-status-cell={`${e.protocol}-${e.chain}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[hb]}`} aria-label={HEARTBEAT_WORDS[hb]} />
      <span className={`tabular-nums ${e.percent == null && !e.atHead ? "text-rb-500" : "text-foreground"}`}>
        {percentWords(e)}
      </span>
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
        <Figure name="Fetched" value={`${n(e.requests)} requests · ${bytesWords(e.bytesRead)}`} source="JSON as read" />
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

/** The chains the table has a column for, in the site's order. */
const CHAIN_ORDER = [1, 8453, 42161, 10, 5042002];
function chainColumns(indexes: IndexProgressEntry[]): number[] {
  const present = [...new Set(indexes.map((e) => e.chain))];
  const rank = (c: number) => (CHAIN_ORDER.includes(c) ? CHAIN_ORDER.indexOf(c) : CHAIN_ORDER.length);
  return present.sort((x, y) => rank(x) - rank(y));
}

function Row({ row, chains, now }: { row: ProtocolRow; chains: number[]; now: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <DataTableGroupRow
        open={open}
        onToggle={() => setOpen((o) => !o)}
        data-status-row={row.protocol}
        label={
          <span className="inline-flex items-center gap-2.5">
            <ProtocolIcon id={iconId(row.protocol)} className="h-5 w-5 shrink-0" />
            {row.name}
          </span>
        }
        cells={chains.map((c) => {
          const e = row.indexes.find((x) => x.chain === c);
          return (
            <DataTableCell key={c} valign="middle" label={e ? chainName(c) : undefined}>
              {e ? <ChainCell e={e} now={now} /> : null}
            </DataTableCell>
          );
        })}
      />
      {open && (
        <DataTableRow drawer>
          <DataTableCell colSpan={chains.length + 1} wide className="pb-6">
            <div className="flex flex-col gap-5 sm:pl-[2.25rem]" data-anatomy="Y1.2">
              {row.indexes.map((e) => (
                <ChainDetail key={e.chain} e={e} now={now} />
              ))}
            </div>
          </DataTableCell>
        </DataTableRow>
      )}
    </Fragment>
  );
}

export function StatusBoard({ progress }: { progress: IndexProgress }) {
  const router = useRouter();
  const asOf = Date.parse(progress.asOf) / 1000;
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

  const rows = protocolRows(progress.indexes);
  const chains = chainColumns(progress.indexes);
  return (
    <div className="mt-10">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-rb-500" data-anatomy="Y2">
        {(["fresh", "late", "stalled", "none"] as const).map((h) => (
          <span key={h} className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[h]}`} />
            {h === "fresh"
              ? "Reported within the hour"
              : h === "late"
                ? "Late, over an hour"
                : h === "stalled"
                  ? "Stalled, over three hours"
                  : "Not reported yet"}
          </span>
        ))}
      </div>
      <DataTable label="Indexing progress by protocol and chain" anatomy="Y1" stacked>
        <DataTableHead>
          <DataTableHeader label="Protocol" />
          {chains.map((c) => (
            <DataTableHeader key={c} label={chainName(c)} />
          ))}
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <Row key={r.protocol} row={r} chains={chains} now={now} />
          ))}
        </DataTableBody>
      </DataTable>
      <p className="mt-4 text-xs text-rb-500">
        From {ROUTE} on the Rails index server, as of {utcTime(asOf)}. The server answers from its stored rows; opening
        this page reads no chain.
      </p>
    </div>
  );
}

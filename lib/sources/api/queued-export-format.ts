// The queued export's file, formatted as the in-browser CSV is (rails-ops
// decision 0029). rails-server keeps the served rows gzipped, one column per
// field of the timeline route's row (api/src/services/timeline-export/csv.ts);
// the download proxy reads them back into the route's rows, runs the family's
// own transform over them a batch at a time and writes each batch with the
// family's fixed columns (lib/shared/events-to-csv.ts), so a small and a large
// export of the same rows are the same bytes.
//
// Two passes over the gzipped bytes. The first counts the rows and reads every
// token they name; if any token's decimals cannot be read the file is refused
// before a byte is sent. The second formats and streams.
//
// SERVER-ONLY — imported from app/api/exports/[id]/download.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { timelineCsvHeader, timelineCsvLines, type CsvFamily } from "@/lib/shared/events-to-csv";
import { aaveV3RowTokens, buildAaveV3Timeline, type MvRow as AaveV3Row } from "@/lib/sources/api/aave-v3-timeline";
import { buildSparkTimeline, sparkRowTokens, type MvRow as SparkRow } from "@/lib/sources/api/spark-timeline";
import { buildMapleTimeline, type MvRow as MapleRow } from "@/lib/sources/api/maple-timeline";
import {
  buildCompoundTimeline,
  compoundRowTokens,
  type MvRow as CompoundRow,
} from "@/lib/sources/api/compound-timeline";
import { buildCompoundV2Timeline, type CompoundV2MvRow } from "@/lib/sources/api/compound-v2-timeline";
import { resolveV3Tokens } from "@/lib/sources/chain/aave-v3-tokens";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";

type Row = Record<string, unknown>;

interface Family {
  /** The column holding the position's wallet (the transforms take it apart
   *  from the rows). */
  walletColumn: string;
  build(rows: Row[], wallet: string): Promise<BaseActivityEvent[]>;
  /** Reads symbol and decimals for these rows' tokens; true when every one
   *  was read. Absent for a family whose tokens come from a catalog. */
  readTokens?(rows: Row[]): Promise<boolean>;
}

const allRead = (metas: Map<string, { unresolved?: true }>, want: string[]) =>
  want.every((a) => metas.get(a) != null && !metas.get(a)!.unresolved);

const FAMILIES: Record<CsvFamily, Family> = {
  "aave-v3": {
    walletColumn: "wallet",
    build: async (rows, wallet) => (await buildAaveV3Timeline(rows as unknown as AaveV3Row[], wallet)).events,
    async readTokens(rows) {
      const want = [...new Set((rows as unknown as AaveV3Row[]).flatMap(aaveV3RowTokens))];
      return allRead(await resolveV3Tokens(want), want);
    },
  },
  spark: {
    walletColumn: "wallet",
    build: async (rows, wallet) => (await buildSparkTimeline(rows as unknown as SparkRow[], wallet)).events,
    async readTokens(rows) {
      const want = [...new Set((rows as unknown as SparkRow[]).flatMap(sparkRowTokens))];
      return allRead(await resolveErc20Meta(want), want);
    },
  },
  maple: {
    walletColumn: "wallet",
    build: async (rows, wallet) => buildMapleTimeline(rows as unknown as MapleRow[], wallet).events,
  },
  "compound-v3": {
    walletColumn: "account",
    build: async (rows, wallet) => (await buildCompoundTimeline(rows as unknown as CompoundRow[], wallet, null)).events,
    async readTokens(rows) {
      const want = [...new Set((rows as unknown as CompoundRow[]).flatMap(compoundRowTokens))];
      return allRead(await resolveErc20Meta(want), want);
    },
  },
  "compound-v2": {
    walletColumn: "wallet",
    build: async (rows, wallet) => buildCompoundV2Timeline(rows as unknown as CompoundV2MvRow[], wallet).events,
  },
};

export const isFormattedFamily = (p: string): p is CsvFamily => Object.prototype.hasOwnProperty.call(FAMILIES, p);

// ── the box's file, read back into the route's rows ─────────────────────────

/** One RFC 4180 line (the box quotes a cell holding a comma, quote or line
 *  break; its JSON cells never hold a raw line break). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    if (line[i] === '"') {
      let s = "";
      i++;
      for (;;) {
        const q = line.indexOf('"', i);
        if (q === -1) throw new Error("unterminated quoted cell");
        if (line[q + 1] === '"') {
          s += line.slice(i, q + 1);
          i = q + 2;
          continue;
        }
        s += line.slice(i, q);
        i = q + 1;
        break;
      }
      out.push(s);
    } else {
      const c = line.indexOf(",", i);
      const end = c === -1 ? line.length : c;
      out.push(line.slice(i, end));
      i = end;
    }
    if (i >= line.length) return out;
    i++; // the comma
    if (i === line.length) {
      out.push("");
      return out;
    }
  }
}

// The cell rule is the box's (csv.ts `cellText`): a string as it is, a number
// or boolean as JSON writes it, an object as its JSON, null as an empty cell.
// Which is which is the route's row shape, the same for all five families.
const NUMBER_COLUMNS = new Set(["tx_index", "log_index", "interest_rate_mode"]);
const BOOLEAN_COLUMNS = new Set(["use_a_tokens"]);
const JSON_COLUMNS = new Set(["swap"]);
/** The box's own leading column, read from `block_timestamp`; not a field. */
const DATE_COLUMN = "date_utc";

export function rowOf(columns: string[], cells: string[]): Row {
  if (cells.length !== columns.length)
    throw new Error(`a line has ${cells.length} cells for ${columns.length} columns`);
  const r: Row = {};
  for (let k = 0; k < columns.length; k++) {
    const c = columns[k];
    if (c === DATE_COLUMN) continue;
    const x = cells[k];
    if (x === "") r[c] = null;
    else if (NUMBER_COLUMNS.has(c)) r[c] = Number(x);
    else if (BOOLEAN_COLUMNS.has(c)) r[c] = x === "true";
    else if (JSON_COLUMNS.has(c)) r[c] = JSON.parse(x);
    else r[c] = x;
  }
  return r;
}

/** The file's rows, in order, decompressed as they are read. */
export async function* fileRows(gz: Uint8Array<ArrayBuffer>): AsyncGenerator<Row> {
  const reader = new Blob([gz])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .pipeThrough(new TextDecoderStream())
    .getReader();
  let columns: string[] | null = null;
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += value;
    let at = 0;
    let nl: number;
    const lines: string[] = [];
    while ((nl = buf.indexOf("\n", at)) !== -1) {
      lines.push(buf.slice(at, nl > at && buf[nl - 1] === "\r" ? nl - 1 : nl));
      at = nl + 1;
    }
    buf = buf.slice(at);
    if (done && buf) lines.push(buf.replace(/\r$/, ""));
    for (const line of lines) {
      if (!line) continue;
      if (!columns) columns = parseCsvLine(line);
      else yield rowOf(columns, parseCsvLine(line));
    }
    if (done) return;
  }
}

const txOf = (r: Row) => String(r.tx_hash ?? "");

/** Batches of about `size` rows that never split a transaction, so a pass that
 *  reads a transaction's rows together (Comet's absorb legs) sees all of them. */
async function* batches(rows: AsyncGenerator<Row>, size: number): AsyncGenerator<Row[]> {
  let batch: Row[] = [];
  for await (const r of rows) {
    if (batch.length >= size && txOf(r) !== txOf(batch[batch.length - 1])) {
      yield batch;
      batch = [];
    }
    batch.push(r);
  }
  if (batch.length) yield batch;
}

// ── the formatted file ──────────────────────────────────────────────────────

export type QueuedExportFormat =
  | { ok: true; rows: number; body: ReadableStream<Uint8Array> }
  | { ok: false; code: "EXPORT_TOKEN_META"; message: string };

const BOM = "﻿";

/** Reads the file once to count its rows and read its tokens, then answers
 *  the formatted CSV as a stream (BOM and header once, CRLF line ends, no
 *  trailing line end — the in-browser file's exact bytes). The stream errors
 *  rather than ending short if a batch cannot be written or the row count
 *  comes out different. */
export async function formatQueuedExport(
  gz: Uint8Array<ArrayBuffer>,
  family: CsvFamily,
  { batchSize = 1000 }: { batchSize?: number } = {},
): Promise<QueuedExportFormat> {
  const f = FAMILIES[family];
  let rows = 0;
  let wallet = "";
  let tokensRead = true;
  for await (const batch of batches(fileRows(gz), 5000)) {
    rows += batch.length;
    if (!wallet) wallet = String(batch[0][f.walletColumn] ?? "");
    // Each read after the first is answered from the resolver's cache, which
    // keeps only what the chain answered; one failure refuses the file.
    if (f.readTokens && !(await f.readTokens(batch))) {
      tokensRead = false;
      break;
    }
  }
  if (!tokensRead)
    return {
      ok: false,
      code: "EXPORT_TOKEN_META",
      message: "A token's symbol and decimals could not be read just now, so the file was not written. Try again.",
    };

  const enc = new TextEncoder();
  const it = batches(fileRows(gz), batchSize);
  let written = 0;
  let started = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(enc.encode(BOM + timelineCsvHeader(family)));
          return;
        }
        const { value, done } = await it.next();
        if (done) {
          if (written !== rows) throw new Error(`wrote ${written} of ${rows} rows`);
          controller.close();
          return;
        }
        const lines = timelineCsvLines(await f.build(value, wallet), family);
        if (lines.length !== value.length) throw new Error("a batch's events do not match its rows");
        written += lines.length;
        controller.enqueue(enc.encode("\r\n" + lines.join("\r\n")));
      } catch (err) {
        controller.error(err);
      }
    },
  });
  return { ok: true, rows, body };
}

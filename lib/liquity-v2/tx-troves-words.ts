// The Trove operations one transaction logged, as a Liquity V2 deposit card's
// Explanation names them (rails-ops ui-jobs 751). The rows are rails-server's
// GET /api/liquity-v2/tx/:hash/troves: one per TroveOperation log in the
// transaction, across the three branches.
//
// RULE: facts only. Each Trove is named once, in the order of its first
// log index, with its operations in log order as past-tense
// verbs; Troves with the same verbs share a clause. At most TX_TROVES_CAP
// Troves are named, then "and N more Troves" ("and more Troves" where the
// server cut the rows). No rows, no line. Pure: no imports, so
// scripts/test/liquity-v2-tx-troves.test.mjs loads it directly.

/** One TroveOperation log, as the route serves it. */
export interface TxTroveRow {
  collateral_type: string;
  /** The Trove's id, a decimal string. */
  trove_id: string;
  /** The TroveOperation enum's name ("openTrove", "redeemCollateral"). */
  operation: string;
  operation_enum: number;
  /** The log's index as the index stores it. */
  log_index: number;
  block_number: string;
  block_timestamp: string;
  /** The branch TroveManager that logged it. */
  contract_address: string;
  transaction_from: string;
}

export interface TxTrovesResponse {
  tx_hash: string;
  truncated: boolean;
  rows: TxTroveRow[];
}

export const TX_TROVES_CAP = 5;

/** A transaction hash: 0x and 64 hex digits. */
export const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

const VERB: Record<string, string> = {
  openTrove: "opened",
  closeTrove: "closed",
  adjustTrove: "adjusted",
  adjustTroveInterestRate: "rate changed",
  liquidate: "liquidated",
  redeemCollateral: "redeemed against",
};

/** An operation's past-tense verb; an operation without one reads as stored. */
export const troveOpVerb = (operation: string): string => VERB[operation] ?? operation;

/** "a", "a and b", "a, b and c". */
export function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** One Trove the transaction acted on, with its logs in order. */
export interface TxTrove {
  collateralType: string;
  troveId: string;
  /** The rows, in log order. */
  ops: TxTroveRow[];
  /** Its operations as one phrase: "opened and closed". */
  verbs: string;
}

/** A Trove's verbs in log order, a repeat run counted ("adjusted twice"). */
function verbPhrase(ops: TxTroveRow[]): string {
  const runs: { verb: string; n: number }[] = [];
  for (const op of ops) {
    const verb = troveOpVerb(op.operation);
    const last = runs[runs.length - 1];
    if (last && last.verb === verb) last.n += 1;
    else runs.push({ verb, n: 1 });
  }
  return joinWords(runs.map((r) => (r.n === 1 ? r.verb : `${r.verb} ${r.n === 2 ? "twice" : `${r.n} times`}`)));
}

/** The rows per Trove (branch and id), in first-log order. */
export function groupTxTroves(rows: TxTroveRow[]): TxTrove[] {
  const sorted = [...rows].sort((a, b) => a.log_index - b.log_index);
  const byKey = new Map<string, TxTroveRow[]>();
  for (const r of sorted) {
    const key = `${r.collateral_type}:${r.trove_id}`;
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }
  return [...byKey.values()].map((ops) => ({
    collateralType: ops[0].collateral_type,
    troveId: ops[0].trove_id,
    ops,
    verbs: verbPhrase(ops),
  }));
}

/** The line: consecutive Troves with the same verbs in one clause, and what
 *  the cap left out. */
export interface TxTrovesLine {
  clauses: { troves: TxTrove[]; verbs: string }[];
  /** Troves past the cap. */
  more: number;
  /** The server cut the rows: more Troves than the line can count. */
  truncated: boolean;
}

/** The line for a read, or null where there is nothing to say. */
export function txTrovesLine(
  res: Pick<TxTrovesResponse, "rows" | "truncated">,
  cap = TX_TROVES_CAP,
): TxTrovesLine | null {
  const troves = groupTxTroves(res.rows);
  if (troves.length === 0) return null;
  const clauses: TxTrovesLine["clauses"] = [];
  for (const t of troves.slice(0, cap)) {
    const last = clauses[clauses.length - 1];
    if (last && last.verbs === t.verbs) last.troves.push(t);
    else clauses.push({ troves: [t], verbs: t.verbs });
  }
  return { clauses, more: Math.max(0, troves.length - cap), truncated: res.truncated };
}

/** The line's closing words after the clauses, or null. */
export function txTrovesTail(line: TxTrovesLine): string | null {
  if (line.truncated) return "and more Troves";
  if (line.more > 0) return `and ${line.more} more Trove${line.more === 1 ? "" : "s"}`;
  return null;
}

/** The line as text, each Trove named by `name` ("Trove 710946…7687 (wstETH)"). */
export function txTrovesText(line: TxTrovesLine, name: (t: TxTrove) => string): string {
  const clauses = line.clauses.map((c) => `${joinWords(c.troves.map(name))} ${c.verbs}`);
  const tail = txTrovesTail(line);
  return `In this transaction: ${[...clauses, ...(tail ? [tail] : [])].join("; ")}.`;
}

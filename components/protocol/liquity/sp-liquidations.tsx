"use client";

// Liquity V2 — what liquidations did to a stability-pool deposit between two
// of its touches (rails-ops decision 0022 §3–§4; the model is
// lib/liquity-v2/sp-liquidations.ts). Each liquidation burned a share of the
// deposit and paid the branch collateral in its place; the table states, per
// liquidation, the collateral gained, its value at the liquidation's block
// price in BOLD, the BOLD burned and the net.
//
// Two homes, one table: a closed stretch is a note row between its two
// touches, on the shell Polaris's PSM gap uses
// (components/protocol/polaris/polaris-psm-gap-row.tsx); the open stretch is
// a section of the "Since its last touch" row's body (sp-since-touch.tsx).

import { useState, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { NoteRowShell } from "@/components/shared/note-row-shell";
import { CountChip } from "@/components/shared/count-chip";
import { HeadingTip } from "@/components/shared/tip-label";
import { BlockRef } from "@/components/shared/block-ref";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { SpineTokenRow } from "@/components/shared/spine-column";
import { formatNumber, formatPrice } from "@/lib/utils/format";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { RATE_NOTE_T1, type SpLiquidationsNote } from "@/lib/shared/market-note";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { big, exactUnits, units } from "@/lib/liquity-v2/sp-math";
import { spLiqProv } from "@/lib/liquity-v2/sp-provenance";
import type { SpBranch } from "@/lib/liquity-v2/sp-routes";
import { spResidualClause } from "@/lib/liquity-v2/sp-liquidations";
import type { LiquityV2DepositLiquidation, LiquityV2DepositStretch } from "@/lib/sources/api/liquity-v2-sp";

const ZERO = BigInt(0);
/** A negative net: red, with its minus (Miles, 18 Nov 2026). */
const NEG = "text-red-600 dark:text-red-400";
/** Rows drawn before "Show all" (Miles, 18 Nov 2026). */
const FIRST_ROWS = 5;

const WORDS = {
  head: "Liquidations",
  net: "net",
  when: "Liquidation",
  gained: (c: string) => `${c} gained`,
  price: (c: string) => `${c} price`,
  value: "Value",
  burned: "BOLD burned",
  netCol: "Net",
  total: "In all",
  valued: "Each gain is valued at its liquidation's block price, in BOLD.",
  showAll: (n: number) => `Show all ${n.toLocaleString("en-US")}`,
  openHead: "Liquidations since last touch",
  openFoot: "Liquidations up to the",
  openFootBlock: "latest block the index has read",
  unsettled: (c: string, n: number, of: number) =>
    `${n.toLocaleString("en-US")} of ${of.toLocaleString("en-US")} periods between touches on the ${c} branch don't add up to the touch that closed them, so these figures aren't settled.`,
  notSettled: "Not settled: see inside",
};

const TIPS = {
  gained: (c: string) => `The ${c} this liquidation paid the deposit.`,
  price: (c: string) => `BOLD per ${c} at the liquidation's block.`,
  value: (c: string) => `The ${c} gained, valued at the liquidation's block price, in BOLD.`,
  burned: "The deposit's BOLD this liquidation used to repay debt.",
  net: "The value less the BOLD burned, in BOLD.",
};

const day = (ts: number) => (ts > 0 ? `${shortDate(ts)} ${shortDateYear(ts)}` : "");
const abs = (v: bigint) => (v < ZERO ? -v : v);
const sign = (v: bigint) => (v < ZERO ? "−" : "+");
const amt = (v: bigint) => formatNumber(units(abs(v)));
const signedAmt = (v: bigint) => `${sign(v)}${amt(v)}`;
/** The collateral at four significant digits below one: 0.0001129 rETH. */
const collAmt = (v: bigint) => {
  const n = units(abs(v));
  return n >= 1 || n === 0 ? formatNumber(n) : n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
};

/** The gap's dates, the shared parts said once (as the PSM gap row's). */
function gapRange(from: number, to: number): string {
  const a = day(from);
  const b = day(to);
  if (!a || a === b) return b;
  const [ad, am, ay] = a.split(" ");
  const [, bm, by] = b.split(" ");
  if (ay !== by) return `${a} – ${b}`;
  return am === bm ? `${ad} – ${b}` : `${ad} ${am} – ${b}`;
}

type Cell = { text: string; prov: Provenance; value: string; symbol?: string; tone?: "neg"; echo?: boolean };

function Fig({ cell }: { cell: Cell }) {
  return (
    <Prov echo={cell.echo} info={cell.prov} value={cell.value} symbol={cell.symbol}>
      <span className={cell.tone === "neg" ? NEG : undefined}>{cell.text}</span>
    </Prov>
  );
}

function rowCells(branch: SpBranch, l: LiquityV2DepositLiquidation) {
  const at = { block: l.block_number, txHash: l.tx_hash };
  const coll = big(l.coll_gained);
  const lost = big(l.bold_lost);
  const value = big(l.coll_gained_value);
  const net = big(l.net);
  const price = big(l.price);
  return {
    gained: {
      text: `+${collAmt(coll)}`,
      prov: spLiqProv.collGained(branch, at),
      value: exactUnits(coll),
      symbol: branch,
    },
    price: {
      text: formatPrice(units(price)),
      prov: spLiqProv.price(branch, at),
      value: exactUnits(price),
    },
    value: {
      text: amt(value),
      prov: spLiqProv.value(branch, at, exactUnits(coll), exactUnits(price)),
      value: exactUnits(value),
      symbol: "BOLD",
    },
    burned: {
      text: `−${amt(lost)}`,
      prov: spLiqProv.boldLost(branch, at),
      value: exactUnits(-lost),
      symbol: "BOLD",
    },
    net: {
      text: signedAmt(net),
      prov: spLiqProv.net(branch, at, exactUnits(value), exactUnits(lost)),
      value: exactUnits(net),
      symbol: "BOLD",
      tone: net < ZERO ? ("neg" as const) : undefined,
    },
  } satisfies Record<string, Cell>;
}

function totalCells(branch: SpBranch, s: LiquityV2DepositStretch) {
  const open = s.to == null;
  const span = open ? "since last touch" : "between the touches";
  const n = s.liquidations.length;
  const t = s.totals;
  const net = big(t.net);
  return {
    gained: {
      text: `+${collAmt(big(t.coll_gained))}`,
      prov: spLiqProv.sum(branch, `${branch} gained ${span}`, `${branch} gained`, `${branch} gained`, n, open),
      value: exactUnits(big(t.coll_gained)),
      symbol: branch,
    },
    value: {
      text: amt(big(t.coll_gained_value)),
      prov: spLiqProv.sum(branch, `Value ${span}`, "values in BOLD", "value in BOLD", n, open),
      value: exactUnits(big(t.coll_gained_value)),
      symbol: "BOLD",
    },
    burned: {
      text: `−${amt(big(t.bold_lost))}`,
      prov: spLiqProv.sum(branch, `BOLD burned ${span}`, "BOLD burned", "BOLD burned", n, open),
      value: exactUnits(-big(t.bold_lost)),
      symbol: "BOLD",
    },
    net: {
      text: signedAmt(net),
      prov: spLiqProv.sum(branch, `Net ${span}`, "nets in BOLD", "net in BOLD", n, open),
      value: exactUnits(net),
      symbol: "BOLD",
      tone: net < ZERO ? ("neg" as const) : undefined,
    },
  } satisfies Record<string, Cell>;
}

/** Six columns from 1024px, where the timeline's column has room for them;
 *  under it each liquidation stands as a block of label and figure lines. */
const GRID = "lg:grid lg:grid-cols-[minmax(10.5rem,1.4fr)_repeat(5,minmax(0,1fr))] lg:gap-x-3";

function Head({ c }: { c: string }) {
  const th = (label: string, tip: string) => (
    <span className="text-right">
      <HeadingTip text={label} tip={tip} />
    </span>
  );
  return (
    <div className={`hidden ${GRID} border-b border-[var(--edge-raised)] pb-1.5 text-xs text-rb-500`}>
      <span>{WORDS.when}</span>
      {th(WORDS.gained(c), TIPS.gained(c))}
      {th(WORDS.price(c), TIPS.price(c))}
      {th(WORDS.value, TIPS.value(c))}
      {th(WORDS.burned, TIPS.burned)}
      {th(WORDS.netCol, TIPS.net)}
    </div>
  );
}

/** One figure: a right-aligned grid cell from 1024px, a label line under it. */
function Col({ label, cell, strong }: { label: string; cell: Cell | null; strong?: boolean }) {
  return (
    <span className="flex items-baseline justify-between gap-3 lg:block lg:text-right">
      <span className="text-xs text-rb-500 lg:hidden">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold text-foreground" : "text-foreground"}`}>
        {cell ? <Fig cell={cell} /> : null}
      </span>
    </span>
  );
}

/** The stretch's liquidations, newest first, with their sums beneath. */
export function SpLiquidationsTable({
  branch,
  stretch,
  check,
  netEcho = false,
  foot,
}: {
  branch: SpBranch;
  stretch: LiquityV2DepositStretch;
  check: SpLiquidationsNote["branchCheck"];
  /** The "In all" net echoes the row's header net, which holds the receipt. */
  netEcho?: boolean;
  /** The lines under the table: what the figures are valued at, and how they
   *  meet the touch. */
  foot: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const rows = [...stretch.liquidations].reverse();
  const shown = all ? rows : rows.slice(0, FIRST_ROWS);
  const tot = totalCells(branch, stretch);
  const c = branch;
  return (
    <div className="text-sm" data-sp-liquidations="" data-anatomy="L7.2">
      {check && check.unreconciled > 0 && (
        <p
          className="mb-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400"
          data-sp-liquidations-unsettled=""
        >
          {WORDS.unsettled(c, check.unreconciled, check.closedStretches)}
        </p>
      )}
      <Head c={c} />
      <div className="divide-y divide-[var(--edge-raised)]">
        {shown.map((l) => {
          const cells = rowCells(branch, l);
          const ts = Number(l.block_timestamp);
          return (
            <div
              key={`${l.block_number}:${l.tx_index}:${l.log_index}`}
              className={`space-y-1 py-2 lg:space-y-0 lg:py-1.5 ${GRID} lg:items-baseline`}
              data-sp-liquidation={l.block_number}
            >
              <span className="flex items-baseline gap-2 whitespace-nowrap text-xs text-rb-500" data-prov-exempt="">
                <span className="text-foreground">{day(ts)}</span>
                <BlockRef block={Number(l.block_number)} chainId={MAINNET_CHAIN_ID} size={12} />
              </span>
              <Col label={WORDS.gained(c)} cell={cells.gained} />
              <Col label={WORDS.price(c)} cell={cells.price} />
              <Col label={WORDS.value} cell={cells.value} />
              <Col label={WORDS.burned} cell={cells.burned} />
              <Col label={WORDS.netCol} cell={cells.net} />
            </div>
          );
        })}
      </div>
      {rows.length > shown.length && (
        <button
          type="button"
          className="link-muted mt-1 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setAll(true);
          }}
        >
          {WORDS.showAll(rows.length)}
        </button>
      )}
      {rows.length > 1 && (
        <div
          className={`mt-1 space-y-1 border-t border-[var(--edge-raised)] pt-2 lg:space-y-0 lg:pt-1.5 ${GRID} lg:items-baseline`}
          data-sp-liquidations-total=""
        >
          <span className="text-xs font-medium text-foreground">{WORDS.total}</span>
          <Col label={WORDS.gained(c)} cell={tot.gained} strong />
          <span className="hidden lg:block" />
          <Col label={WORDS.value} cell={tot.value} strong />
          <Col label={WORDS.burned} cell={tot.burned} strong />
          <Col label={WORDS.netCol} cell={{ ...tot.net, echo: netEcho }} strong />
        </div>
      )}
      <div className="pt-3 text-xs leading-relaxed text-rb-500">{foot}</div>
    </div>
  );
}

/** How a closed stretch's liquidations meet the touch that closed it. */
function reconcileLine(note: SpLiquidationsNote): string {
  const s = note.stretch;
  const c = note.branch;
  const at = `block ${note.to.block.toLocaleString("en-US")}`;
  const touch = day(note.to.timestamp);
  if (s.reconciles)
    return `Together they are the BOLD burned and the ${c} paid in that the touch on ${touch} wrote, at ${at}.`;
  if (!s.to || !s.residual) return "";
  const wrote = `The touch on ${touch} wrote ${amt(big(s.to.deposit_loss))} BOLD burned and ${collAmt(big(s.to.coll_gain_since))} ${c} paid in`;
  const clause = spResidualClause(s.residual, c, { bold: amt, coll: collAmt });
  return clause ? `${wrote}; these liquidations ${clause}.` : `${wrote}.`;
}

/** A closing touch that reported a loss or a gain with no liquidation between
 *  the two touches: its figures, each on the touch's log receipt. */
function NoLiquidationLine({ note }: { note: SpLiquidationsNote }) {
  const to = note.stretch.to;
  if (!to) return null;
  const c = note.branch as SpBranch;
  const loss = big(to.deposit_loss);
  const gain = big(to.coll_gain_since);
  return (
    <>
      The touch on {day(note.to.timestamp)} wrote{" "}
      <Prov info={spLiqProv.touchLoss(c, to.tx_hash, to.block_number)} value={exactUnits(loss)} symbol="BOLD">
        {amt(loss)} BOLD
      </Prov>{" "}
      burned and{" "}
      <Prov info={spLiqProv.touchGain(c, to.tx_hash, to.block_number)} value={exactUnits(gain)} symbol={c}>
        {collAmt(gain)} {c}
      </Prov>{" "}
      paid in, and no liquidation between the two touches accounts for it.
    </>
  );
}

/** One closed stretch's liquidations, as a row between its two touches. */
export function LiquityV2DepositLiquidationsRow({ note }: { note: SpLiquidationsNote }) {
  const s = note.stretch;
  const c = note.branch as SpBranch;
  const collAddr = LIQUITY_V2_BRANCHES[c.toLowerCase()].collateralAddr;
  const n = s.liquidations.length;
  const gained = big(s.totals.coll_gained);
  const net = big(s.totals.net);
  const range = gapRange(note.from.timestamp, note.to.timestamp);
  const tot = totalCells(c, s);
  const unsettled = s.reconciles === false || (note.branchCheck?.unreconciled ?? 0) > 0;

  // On the spine: the collateral the liquidations paid in points into the
  // deposit, as a deposit's legs do.
  const tokens: SpineTokenRow[] =
    gained > ZERO
      ? [{ symbol: c, address: collAddr, direction: "right", value: units(gained), display: collAmt(gained) }]
      : [];

  return (
    <NoteRowShell
      icon="market"
      label={`${RATE_NOTE_T1.name}, ${WORDS.head}, ${n}${n > 0 ? `, ${signedAmt(net)} BOLD ${WORDS.net}` : ""}${unsettled ? `, ${WORDS.notSettled}` : ""}, ${range}`}
      marker={{ attr: "data-market-note", value: note.id }}
      spine={{ tokens, noteGlyph: "share" }}
      header={
        <span
          className="inline-flex max-w-full shrink-0 items-center gap-1.5 text-sm text-rb-500 max-sm:min-w-0 max-sm:shrink max-sm:text-xs"
          data-head-kind=""
        >
          <span className="min-w-0 truncate">{WORDS.head}</span>
          {n > 0 && (
            <>
              <CountChip count={n} />
              {/* The net alone at rest, with its receipt; the opened table
                  holds the rest, its "In all" net an echo of this one. */}
              <span className={`tabular-nums ${net < ZERO ? NEG : "text-foreground"}`} data-sp-liquidations-net="">
                <Prov info={tot.net.prov} value={tot.net.value} symbol="BOLD">
                  {signedAmt(net)} BOLD
                </Prov>
              </span>
              <span>{WORDS.net}</span>
            </>
          )}
          {unsettled && (
            <span className="inline-flex text-amber-600 dark:text-amber-400" data-sp-liquidations-mark="">
              <HeadingTip text={<CircleAlert size={14} aria-label={WORDS.notSettled} />} tip={WORDS.notSettled} />
            </span>
          )}
        </span>
      }
      meta={
        <span className="evt-meta ml-auto inline-flex min-h-6 items-center gap-2 whitespace-nowrap">
          <span className="text-xs text-foreground">{range}</span>
        </span>
      }
    >
      <div className="px-5 pb-3 pt-2" data-sp-liquidations-row="">
        {n > 0 ? (
          <SpLiquidationsTable
            branch={c}
            stretch={s}
            check={note.branchCheck}
            netEcho
            foot={
              <>
                {WORDS.valued} {reconcileLine(note)}
              </>
            }
          />
        ) : (
          // A touch that reported a loss or a gain with no liquidation between
          // the two touches: the sentence alone.
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400" data-sp-liquidations-residual="">
            <NoLiquidationLine note={note} />
          </p>
        )}
      </div>
    </NoteRowShell>
  );
}

/** The open stretch's liquidations, for the "Since its last touch" row's
 *  body. Null where none landed since the touch. */
export function SpOpenStretchLiquidations({
  branch,
  stretch,
  servedThru,
  check,
}: {
  branch: SpBranch;
  stretch: LiquityV2DepositStretch;
  servedThru: string;
  check: SpLiquidationsNote["branchCheck"];
}) {
  if (stretch.liquidations.length === 0) return null;
  return (
    <div className="border-t border-[var(--edge-raised)] px-5 pb-3 pt-3" data-sp-open-liquidations="">
      <div className="mb-2 flex items-center gap-1.5 text-sm text-foreground">
        {WORDS.openHead}
        <CountChip count={stretch.liquidations.length} />
      </div>
      <SpLiquidationsTable
        branch={branch}
        stretch={stretch}
        check={check}
        foot={
          <>
            {WORDS.valued} {WORDS.openFoot}{" "}
            <Prov info={spLiqProv.servedThru(branch, servedThru)} value={servedThru}>
              {WORDS.openFootBlock}
            </Prov>
            .
          </>
        }
      />
    </div>
  );
}

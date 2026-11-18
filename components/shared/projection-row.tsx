"use client";

// THE PROJECTION ROW (ui-jobs 733): what a position's interest or savings rate
// would add over the days ahead if nothing changes, pinned at the head of the
// timeline above the live window (ChainTruthTimeline's `projection` slot).
// --------------------------------------------------------------------------
// One row for every family that has a rate. A family hands it a small
// contract — the annual rate, the amount it runs on, the asset, and where the
// rate and the amount were read — and its own words; the row works the figure
// out, draws it and writes its receipt. The arithmetic is simple interest,
// the way Liquity V2 accrues a Trove's debt between two touches:
//
//     base × rate ÷ 100 × days ÷ 365
//
// The frame is <NoteRowShell>'s on the projection ground: no block, a dashed
// outline, muted words, the calendar node with a dotted stretch below it.
// It is not counted, filtered, linked or shared; the shell's marker
// (`data-timeline-projection`) is the only hook it carries.

import type { ReactNode } from "react";

import { NoteRowShell } from "@/components/shared/note-row-shell";
import { Prov, type ProvInput, type Provenance } from "@/components/shared/provenance";
import { TokenFigure } from "@/components/shared/token-figure";
import { formatExact, formatNumber } from "@/lib/utils/format";

const YEAR_DAYS = 365;

/** What a family hands the row. */
export interface ProjectionContract {
  /** The family the row stands in: the marker's value. */
  family: string;
  /** The annual rate, in percent. */
  ratePct: number;
  /** The amount the rate runs on, in `asset` units. */
  base: number;
  asset: { symbol: string; address?: string };
  /** How many days ahead; 30 unless given. */
  days?: number;
  /** The amount's receipt: where it was read. */
  baseProv: Provenance;
  /** The rate's receipt: where it was read. */
  rateProv: Provenance;
  /** What the formula calls the amount and the rate: "recorded debt", "rate". */
  terms: { base: string; rate: string };
}

/** The family's words, from its words file. */
export interface ProjectionWords {
  /** The row's head: "Projection". */
  label: string;
  /** The assumption the figure rests on, filled with the rate and the days:
   *  "at the current rate of 5.50%, held 30 days". */
  assumption: string;
  /** What the figure is, after the amount: "interest". */
  figure: string;
  /** The receipt's summary, in the "name — sentence" shape. */
  summary: string;
  /** The opened row's labels. */
  rows: { base: string; rate: string; result: string };
  /** A sentence under the rows, where the family has one (a fee charged on
   *  top of the rate). */
  note?: ReactNode;
}

/** The figure the row states: simple interest over the days. */
export function projectedAmount(c: Pick<ProjectionContract, "ratePct" | "base" | "days">): number {
  return (c.base * c.ratePct * (c.days ?? 30)) / 100 / YEAR_DAYS;
}

/** The rate as the row prints it: two places, as a position card does. */
export function projectionRateText(ratePct: number): string {
  return `${ratePct.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** A read's receipt as a leaf of the figure's: its value, its class, its
 *  contract and the call or log it came from. */
function leaf(label: string, value: string, p: Provenance): ProvInput {
  return {
    label,
    value,
    kind: p.kind,
    ...(p.pclass ? { pclass: p.pclass } : {}),
    ...(p.contract ? { contract: p.contract } : {}),
    ...(p.via ? { note: p.via } : {}),
  };
}

/** The figure's receipt: the formula with its figures, and the two reads. */
function projectionProv(c: ProjectionContract, summary: string): Provenance {
  const days = c.days ?? 30;
  return {
    kind: "derived",
    summary,
    formula: `${c.terms.base} × ${c.terms.rate} ÷ 100 × ${days} ÷ ${YEAR_DAYS}`,
    inputs: [
      leaf(c.terms.base, `${formatExact(c.base)} ${c.asset.symbol}`, c.baseProv),
      leaf(c.terms.rate, `${formatExact(c.ratePct)}%`, c.rateProv),
      { label: "days held", value: String(days), kind: "derived", definition: true },
      { label: "days in a year", value: String(YEAR_DAYS), kind: "derived", definition: true },
    ],
  };
}

/** Null where the rate does not run: no rate or nothing for it to run on. */
export function ProjectionRow({ contract, words }: { contract: ProjectionContract; words: ProjectionWords }) {
  const c = contract;
  if (!(c.ratePct > 0) || !(c.base > 0)) return null;
  const amount = projectedAmount(c);
  const info = projectionProv(c, words.summary);
  const sym = c.asset.symbol;
  const figure = (echo: boolean) => (
    <TokenFigure symbol={sym} address={c.asset.address}>
      <Prov echo={echo} info={info} value={formatExact(amount)} symbol={sym}>
        +{formatNumber(amount)}
      </Prov>
    </TokenFigure>
  );
  const row = (label: string, value: ReactNode, key: string) => (
    <div key={key} className="flex items-baseline justify-between gap-4" data-projection-row={key}>
      <dt className="text-rb-500">{label}</dt>
      <dd className="tabular-nums text-foreground/80">{value}</dd>
    </div>
  );

  return (
    <NoteRowShell
      icon="projection"
      ground="projection"
      anatomy="L5.1"
      label={`${words.label}: +${formatNumber(amount)} ${sym} ${words.figure}, ${words.assumption}`}
      marker={{ attr: "data-timeline-projection", value: c.family }}
      header={
        <>
          <span className="text-sm text-rb-500">{words.label}</span>
          {/* An ECHO of the receipt the opened row carries. */}
          <span className="inline-flex items-center gap-1.5 text-sm text-rb-500 tabular-nums">
            {figure(true)}
            <span className="text-xs">{words.figure}</span>
          </span>
          <span className="w-full pr-5 text-xs text-rb-500 sm:ml-auto sm:w-auto sm:pr-0" data-prov-exempt="">
            {words.assumption}
          </span>
        </>
      }
    >
      <div className="px-5 pb-4 pt-3 text-xs">
        <dl className="space-y-1.5">
          {row(
            words.rows.base,
            <TokenFigure symbol={sym} address={c.asset.address}>
              <Prov info={c.baseProv} value={formatExact(c.base)} symbol={sym}>
                {formatNumber(c.base)}
              </Prov>
            </TokenFigure>,
            "base",
          )}
          {row(
            words.rows.rate,
            <Prov info={c.rateProv} value={formatExact(c.ratePct)}>
              {projectionRateText(c.ratePct)}
            </Prov>,
            "rate",
          )}
          {row(words.rows.result, figure(false), "result")}
        </dl>
        {words.note && <p className="mt-3 text-rb-500">{words.note}</p>}
      </div>
    </NoteRowShell>
  );
}

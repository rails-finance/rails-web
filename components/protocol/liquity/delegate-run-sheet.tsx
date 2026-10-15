"use client";

// The delegate run's balance sheet, read across its members. Collateral: the
// last member's total, untouched. Debt: the debt before the run (the first
// member's "Last event"), the interest and management fee every member
// accrued and the upfront fees, summed from each adjustment's split
// (`batchRateDebtMove`), each adjustment's move listed with the breakdown on,
// and the last member's total. Risk is the last member's; Limits states the
// rate after the run, its change across the run, and with the breakdown on
// the rate before the run and after each adjustment.

import { createContext } from "react";
import type { Provenance } from "@/components/shared/provenance";
import type { EventSheet, SheetRow, SheetSide, SheetStat } from "@/components/shared/event-sheet";
import { sheetUsd } from "@/components/shared/event-sheet";
import { GROUP_SHEET_WORDS, type CollectedCard } from "@/components/shared/group-sheet";
import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import type { BatchRateDebtMove } from "@/lib/liquity/batch-rate-move";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { troveWords } from "@/lib/liquity/event-templates";

/** The Trove's chronologically previous event, by event id: the first
 *  member's accrual runs from the event before the run (TroveBody). */
export const PreviousEventContext = createContext<((id: string) => BaseActivityEvent | undefined) | null>(null);

/** One adjustment of the run, oldest first: its rate before and after, the
 *  receipt of the rate after, and its debt before and after. */
export interface DelegateRunStep {
  id: string;
  timestamp: number;
  before: number;
  after: number;
  prov?: { info: Provenance; value: string };
  /** The adjustment's debt move, split; null where its previous event or the
   *  batch fee is unknown (the move then counts as accrual). */
  move: BatchRateDebtMove | null;
  /** The recorded debt before and after the adjustment. */
  debt: [number, number];
}

const UP = "#22C55E";
const DOWN = "#EF4444";
const PLACES = 2;
const DUST = 0.01;

const fmt = (n: number) =>
  `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: PLACES,
    maximumFractionDigits: PLACES,
  })}`;

const sumProv = (what: string, count: number): Provenance => ({
  kind: "chain-derived",
  summary: troveWords("run_sheet_sum", { what, count }),
  formula: `Σ over ${count} events`,
});

const moveProv = (number: number | undefined, usd = false): Provenance => ({
  kind: "chain-derived",
  summary: troveWords("run_sheet_move", { number: number ?? "", usd: usd ? troveWords("run_sheet_face") : "" }),
  formula: troveWords("run_sheet_move_formula"),
});

/** The run's sheet from its members' (oldest first) and its adjustments;
 *  null where they do not read as one. */
export function mergeDelegateRunSheet(cards: CollectedCard[], steps: DelegateRunStep[]): EventSheet | null {
  const sheets = cards.map((c) => c.sheet);
  if (sheets.length === 0 || sheets.some((s) => !s) || steps.length !== cards.length) return null;
  const first = sheets[0]!;
  const last = sheets[sheets.length - 1]!;
  const sideOf = (sh: EventSheet, side: string) => sh.sides.find((s) => s.side === side);
  const lastColl = sideOf(last, "collateral");
  const lastDebt = sideOf(last, "debt");
  const firstDebt = sideOf(first, "debt");
  if (!lastColl || !lastDebt || !firstDebt) return null;
  const n = cards.length;
  const symbol = lastDebt.icons[0];

  // Each adjustment's move, and the run's sums: an adjustment whose split is
  // unknown counts its whole move as accrual.
  const moveOf = (st: DelegateRunStep) => st.move?.total ?? st.debt[1] - st.debt[0];
  const upfront = steps.reduce((a, st) => a + (st.move?.upfront ?? 0), 0);
  const interest = steps.reduce((a, st) => a + moveOf(st), 0) - upfront;
  const fig = (v: number, what: string): Pick<SheetRow, "amount" | "usd"> => ({
    amount: { text: fmt(v), symbol, info: sumProv(what, n) },
    usd: { text: sheetUsd(v), info: sumProv(`${what} in USD`, n) },
  });
  const rows: SheetRow[] = [
    {
      key: "group-interest",
      label: troveWords("run_sheet_interest"),
      ...fig(interest, troveWords("run_sheet_interest")),
    },
    ...(upfront >= DUST
      ? [
          {
            key: "group-upfront",
            label: troveWords("run_sheet_upfront"),
            ...fig(upfront, troveWords("run_sheet_upfront")),
          },
        ]
      : []),
  ];
  // Each adjustment's move, with the breakdown on.
  const numberOf = new Map(cards.map((c) => [c.id, c.number]));
  const listed: SheetRow[] = steps.map((st) => {
    const v = moveOf(st);
    const number = numberOf.get(st.id);
    return {
      key: `${st.id}-move`,
      label: troveWords("run_sheet_event", {
        number: number ?? "",
        date: `${shortDate(st.timestamp)} ${shortDateYear(st.timestamp)}`,
      }),
      amount: { text: fmt(v), symbol, info: moveProv(number) },
      usd: { text: sheetUsd(v), info: moveProv(number, true) },
    };
  });
  // Before the run: the debt the first member's previous event recorded.
  const lastRow = firstDebt.carry.find((r) => r.key === "last");
  const debtSide: SheetSide = {
    ...lastDebt,
    carry: [],
    before: lastRow && { ...lastRow, key: "before", label: GROUP_SHEET_WORDS.before, tip: undefined },
    rows,
    assets: listed,
    repaid: undefined,
    after: GROUP_SHEET_WORDS.after,
  };
  const collSide: SheetSide = {
    ...lastColl,
    carry: [],
    before: undefined,
    rows: [],
    assets: undefined,
    untouched: troveWords("run_sheet_untouched"),
  };

  // Limits: the rate after the run, its change across the run; the rate's
  // sequence with the breakdown on.
  const pts = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(2)} pts`;
  const panels = last.panels.map((p) => {
    if (p.panel !== "limits" || steps.length === 0) return p;
    const s0 = steps[0];
    const sN = steps[steps.length - 1];
    const rows = p.rows.map((r) =>
      r.key === "rate" && !("none" in r.value) && s0.before > 0
        ? {
            ...r,
            change: {
              text: pts(sN.after - s0.before),
              info: {
                kind: "derived",
                summary: troveWords("run_sheet_rate_change"),
                formula: troveWords("run_sheet_rate_formula"),
              } as Provenance,
            },
          }
        : r,
    );
    const sequence: SheetStat[] = [
      ...(s0.before > 0
        ? [
            {
              key: "rate-before-group",
              label: GROUP_SHEET_WORDS.before,
              value: {
                text: `${s0.before.toFixed(2)}%`,
                info: { kind: "chain-derived", summary: troveWords("run_sheet_before_rate") } as Provenance,
              },
            },
          ]
        : []),
      ...steps.map((st) => {
        const d = st.after - st.before;
        const dir = st.before > 0 && Math.abs(d).toFixed(2) !== "0.00" ? (d > 0 ? "up" : "down") : null;
        return {
          key: `rate-${st.id}`,
          label: troveWords("run_sheet_event", {
            number: numberOf.get(st.id) ?? "",
            date: `${shortDate(st.timestamp)} ${shortDateYear(st.timestamp)}`,
          }),
          value: {
            text: (
              <span className="inline-flex items-center gap-1.5">
                {dir && (
                  <span aria-hidden="true" style={{ color: dir === "up" ? UP : DOWN }}>
                    {dir === "up" ? "↑" : "↓"}
                  </span>
                )}
                {st.after.toFixed(2)}%
              </span>
            ),
            info: st.prov?.info,
            value: st.prov?.value,
          },
        };
      }),
    ];
    return { ...p, rows, breakdown: [...sequence, ...(p.breakdown ?? [])] };
  });

  return { sides: [collSide, debtSide], panels };
}

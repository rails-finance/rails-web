"use client";

// A `ChainTruthStat` as a cell of the shell's grid (components/shared/
// event-cells.tsx; ui-jobs 309): for the families whose figures were built as
// stats for `ChainTruthDetail` and now fill the card's `cells` slot. The
// figure keeps its face (compact, its exact decimal in the tip, the unit as a
// word where `symbolText` asks) and its receipts.

import type { ReactNode } from "react";
import { ExactTip } from "@/components/shared/amount-text";
import { Prov } from "@/components/shared/provenance";
import { compactAmount, transitionFigure, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import type { EventStatCellSpec } from "@/components/shared/event-cells";
import { formatNumber } from "@/lib/utils/format";

export interface StatCellOptions {
  /** Print the symbol as a word after the figure, beside its icon. */
  symbolText?: boolean;
  inputs?: string[];
  tip?: string;
  figure?: string;
}

/** One stat as a stat cell under `key`. */
export function statCell(s: ChainTruthStat, key: string, opts: StatCellOptions = {}): EventStatCellSpec {
  const changed = s.changed ?? true;
  const word = opts.symbolText && s.symbol ? <span className="font-normal text-rb-500"> {s.symbol}</span> : null;
  const t = s.transition;
  const sub: { content: ReactNode; changed?: boolean }[] = [];
  const i = s.interestSincePrevious;
  if (i)
    sub.push({
      content: (
        <>
          <span title={i.labelTip}>{i.label ?? "Interest since previous event"}</span>:{" "}
          <Prov info={i.prov} value={i.value} symbol={s.symbol}>
            <ExactTip
              always
              text={i.display ?? transitionFigure(formatNumber(Number(i.value)), i.value)}
              exact={i.value}
              symbol={s.symbol}
            />
          </Prov>{" "}
          {s.symbol}
          {i.after}
        </>
      ),
    });
  if (s.sub) sub.push({ content: s.sub, changed });
  return {
    kind: "stat",
    key,
    label: s.label,
    changed,
    inputs: opts.inputs,
    tip: opts.tip,
    figure: opts.figure,
    value: {
      before: t
        ? {
            text: (
              <ExactTip
                always
                text={t.shownAsIs ? t.before : transitionFigure(t.before, t.beforeExact, false)}
                exact={t.beforeExact}
                symbol={s.symbol}
              />
            ),
            info: t.beforeProv,
            value: t.beforeExact,
          }
        : undefined,
      delta: t
        ? {
            text: (
              <ExactTip
                always
                text={t.shownAsIs ? t.change : transitionFigure(t.change, t.changeExact)}
                exact={t.changeExact}
                symbol={s.symbol}
              />
            ),
            info: t.changeProv,
            value: t.changeExact,
          }
        : undefined,
      after: {
        text: (
          <>
            <ExactTip always text={s.display ?? compactAmount(s.value)} exact={s.value} symbol={s.symbol} />
            {word}
          </>
        ),
        info: s.prov,
        value: s.value,
      },
      icon: s.symbol || undefined,
    },
    sub: sub.length > 0 ? sub : undefined,
  };
}

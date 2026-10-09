"use client";

// A family's `ChainTruthStat`s as cells for the card's `cells` slot
// (components/shared/event-cells.tsx; ui-jobs 309): the figures, receipts,
// exact-value tips and interest line `ChainTruthDetail` draws, typed for the
// shell's grid, so the shell owns the colours and the heading tone (ui-jobs
// 243). A stat with a `ledger` side becomes that side's ledger cell. A stat's
// `usd` chip is not carried: a family on the slots states prices in the price
// row.

import type { ReactNode } from "react";
import { compactAmount, transitionFigure, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import type { EventCellSpec } from "@/components/shared/event-cells";
import { ExactTip } from "@/components/shared/amount-text";
import { Prov } from "@/components/shared/provenance";
import { TipLabel } from "@/components/shared/tip-label";
import { TokenAmountNotLoaded } from "@/components/shared/not-loaded";
import { useUnreadTokenOf } from "@/components/shared/unread-tokens-context";
import { formatNumber } from "@/lib/utils/format";

/** A stat's "Interest since previous event: 12.40 DAI" line. */
export function InterestLine({ stat }: { stat: ChainTruthStat }) {
  const isp = stat.interestSincePrevious;
  if (!isp) return null;
  return (
    <>
      <TipLabel text={isp.label ?? "Interest since previous event"} tip={isp.labelTip} />:{" "}
      <Prov info={isp.prov} value={isp.value} symbol={stat.symbol}>
        <ExactTip
          always
          text={isp.display ?? transitionFigure(formatNumber(Number(isp.value)), isp.value)}
          exact={isp.value}
          symbol={stat.symbol}
        />
      </Prov>{" "}
      {stat.symbol}
      {isp.after}
    </>
  );
}

/** The stats as cells, keyed `stat-<i>` unless the caller names them. */
export function useStatCells(stats: (ChainTruthStat & { key?: string })[]): EventCellSpec[] {
  const unreadOf = useUnreadTokenOf();
  return stats.map((s, i): EventCellSpec => {
    const head = { key: s.key ?? `stat-${i}`, label: s.label, changed: s.changed ?? true };
    const kind = s.ledger ? ({ kind: "ledger", side: s.ledger } as const) : ({ kind: "stat" } as const);
    const unread = s.symbol ? unreadOf(s.address, s.symbol) : undefined;
    if (unread)
      return {
        ...kind,
        ...head,
        value: { after: { text: <TokenAmountNotLoaded address={unread.address} label={unread.label} /> } },
      };
    const t = s.transition;
    const sub: { content: ReactNode; changed?: boolean }[] = [];
    if (s.interestSincePrevious) sub.push({ content: <InterestLine stat={s} /> });
    if (s.sub != null) sub.push({ content: s.sub, changed: head.changed });
    return {
      ...kind,
      ...head,
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
          text: <ExactTip always text={s.display ?? compactAmount(s.value)} exact={s.value} symbol={s.symbol} />,
          info: s.prov,
          value: s.value,
        },
        icon: s.symbol || undefined,
        iconAddress: s.address,
      },
      sub: sub.length > 0 ? sub : undefined,
    };
  });
}

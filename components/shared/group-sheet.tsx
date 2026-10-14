"use client";

// A like-event group's balance sheet (rails-ops TO-DO-ui-jobs 330): the
// summary card of a closed group draws the sheet its members draw, read
// across the group. Each side takes the first member's carry-forward layer
// and before-balance, one summed row per asset of the members' rows (their
// legs listed under it with the breakdown on), and the last member's total;
// Risk and Limits are the last member's. The price row is the last member's,
// with the members' P/L summed.
//
// The members' sheets come from their own cards: mounted inside
// `GroupSheetCollector`, a member's `EventCard` hands up its slots and draws
// nothing. A group whose members draw no sheet, or sheets of different shapes,
// or figures the sheet's own formats do not state (`parseSheetNumber`), has
// none, and its card keeps the sentence and the sums.

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Provenance } from "@/components/shared/provenance";
import type { EventSheet, SheetRow, SheetSide } from "@/components/shared/event-sheet";
import { sheetUsd } from "@/components/shared/event-sheet";
import type { EventCardPrice } from "@/components/shared/event-price-row";

const WORDS = { before: "Before the group" };

/** What a member's card hands up. */
export interface CollectedCard {
  id: string;
  timestamp: number;
  blockNumber?: number;
  number?: number;
  sheet?: EventSheet | null;
  price?: EventCardPrice;
}

/** Set inside a group's collector: a member's card reports here and draws
 *  nothing. */
export const SheetCollectContext = createContext<((card: CollectedCard) => () => void) | null>(null);

/** A figure as the sheet states it ("−3.6626", "$11,945", "+$1.20"), as a
 *  number; null for anything else. */
function parseSheetNumber(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const t = text.replace(/[−–]/g, "-").replace(/[$,+\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** The places after the point a sheet figure states. */
const placesOf = (text: string) => /\.(\d+)/.exec(text)?.[1].length ?? 0;

function sumProv(what: string, n: number): Provenance {
  return {
    kind: "chain-derived",
    summary: `${what} across this group — the total over its ${n} events. Opening the group shows each event with its receipt.`,
    formula: `Σ over ${n} events`,
  };
}

/** One summed row per asset of the members' rows; null where a figure does
 *  not read. */
function summedRows(rows: SheetRow[], label: string, n: number): SheetRow[] | null {
  const bySymbol = new Map<string, SheetRow[]>();
  for (const r of rows) {
    const k = r.amount?.symbol ?? "";
    bySymbol.set(k, [...(bySymbol.get(k) ?? []), r]);
  }
  const out: SheetRow[] = [];
  for (const [symbol, rs] of bySymbol) {
    let amount = 0;
    let places = 0;
    let usd = 0;
    let usdKnown = true;
    for (const r of rs) {
      if (r.amount) {
        // The receipt's exact figure where it reads, so the sum does not
        // gather the members' rounding; else the figure as stated.
        const shown = parseSheetNumber(r.amount.text);
        if (shown == null) return null;
        const exact = parseSheetNumber(r.amount.value);
        amount += exact != null ? Math.sign(shown) * Math.abs(exact) : shown;
        places = Math.max(places, placesOf(r.amount.text as string));
      }
      const u = r.usd ? parseSheetNumber(r.usd.text) : null;
      if (u == null) usdKnown = false;
      else usd += u;
    }
    const amountText = `${amount < 0 ? "−" : ""}${Math.abs(amount).toLocaleString("en-US", {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    })}`;
    out.push({
      key: `group-${symbol || "row"}`,
      label,
      amount: rs[0].amount
        ? { text: amountText, symbol: symbol || undefined, address: rs[0].amount.address, info: sumProv(label, n) }
        : undefined,
      usd: usdKnown ? { text: sheetUsd(usd), info: sumProv(`${label} in USD`, n) } : undefined,
    });
  }
  return out;
}

/** The group's sheet from its members' (oldest first); null where they do
 *  not read as one. */
export function mergeGroupSheet(cards: CollectedCard[], label: string): EventSheet | null {
  const sheets = cards.map((c) => c.sheet);
  if (sheets.length === 0 || sheets.some((s) => !s)) return null;
  const first = sheets[0]!;
  const last = sheets[sheets.length - 1]!;
  const sides: SheetSide[] = [];
  for (const s of first.sides) {
    const memberSides = sheets.map((sh) => sh!.sides.find((x) => x.side === s.side));
    const lastSide = memberSides[memberSides.length - 1];
    if (memberSides.some((x) => !x) || !lastSide) return null;
    const legs = memberSides.flatMap((x, i) =>
      x!.rows.map((r) => ({
        ...r,
        key: `${cards[i].id}-${r.key}`,
        label:
          cards[i].number != null ? (
            <>
              #{cards[i].number} {r.label}
            </>
          ) : (
            r.label
          ),
      })),
    );
    const rows = legs.length > 0 ? summedRows(legs, label, cards.length) : [];
    if (rows == null) return null;
    sides.push({
      ...s,
      icons: [...new Set(memberSides.flatMap((x) => x!.icons))],
      carry: s.carry,
      before: s.before && { ...s.before, label: WORDS.before },
      rows,
      assets: legs,
      repaid: undefined,
      total: lastSide.total,
      totalTip: lastSide.totalTip,
      after: "After these events",
    });
  }
  return { sides, panels: last.panels };
}

/** The group's price row: the last member's prices, its claimable, and the
 *  members' P/L summed where every member that states one reads. */
export function mergeGroupPrice(cards: CollectedCard[]): EventCardPrice | undefined {
  const last = cards[cards.length - 1]?.price;
  if (!last) return undefined;
  const pls = cards.map((c) => c.price?.outcome?.pl).filter((p) => p != null);
  const pl = pls.length > 0 ? { usd: pls.reduce((a, p) => a + p!.usd, 0), word: pls[0]!.word } : undefined;
  return {
    gas: null,
    prices: last.prices,
    figures: last.figures,
    outcome: last.outcome || pl ? { claimable: last.outcome?.claimable, pl } : null,
  };
}

/** Mounts the members out of sight and reports the group's sheet and price,
 *  or null where the members do not read as one. */
export function GroupSheetCollector({
  members,
  count,
  label,
  onSheet,
}: {
  members: ReactNode;
  /** The members the group holds: the sheet waits for every one. */
  count: number;
  /** The summed rows' label ("Redemptions"). */
  label: string;
  /** The merged sheet; null where the members do not read as one;
   *  undefined while they are still being collected. */
  onSheet: (merged: { sheet: EventSheet; price?: EventCardPrice } | null | undefined) => void;
}) {
  const [cards, setCards] = useState<Map<string, CollectedCard>>(() => new Map());
  const collect = useCallback((card: CollectedCard) => {
    setCards((m) => new Map(m).set(card.id, card));
    return () =>
      setCards((m) => {
        const next = new Map(m);
        next.delete(card.id);
        return next;
      });
  }, []);
  const merged = useMemo(() => {
    if (cards.size !== count) return null;
    const ordered = [...cards.values()].sort(
      (a, b) =>
        (a.number ?? 0) - (b.number ?? 0) || (a.blockNumber ?? 0) - (b.blockNumber ?? 0) || a.timestamp - b.timestamp,
    );
    const sheet = mergeGroupSheet(ordered, label);
    return sheet ? { sheet, price: mergeGroupPrice(ordered) } : null;
  }, [cards, count, label]);
  const complete = cards.size === count;
  useEffect(() => onSheet(complete ? merged : undefined), [complete, merged, onSheet]);
  return (
    <SheetCollectContext.Provider value={collect}>
      <div
        hidden
        data-group-collected={cards.size}
        data-group-sheets={[...cards.values()].filter((c) => c.sheet).length}
      >
        {members}
      </div>
    </SheetCollectContext.Provider>
  );
}

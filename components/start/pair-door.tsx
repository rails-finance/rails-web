"use client";

// The /start pair step's cards (G10; rails-ops ui-jobs 556, door 2): every
// hookless Uniswap pool for the pair in the order the reader picks, the
// set-aside line with its toggle. The order and the toggle change this page
// only (teal, color-grammar.md §4c). A card opens nothing: a pool has no page
// yet. Figures are plain, as on the asset step (G9). Every word is
// lib/uniswap/words.ts's; no card carries a verdict.

import { useState } from "react";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { orderCards, type PairOrder, type PoolCard } from "@/lib/uniswap/pairs";
import { protocolCut } from "@/lib/uniswap/position";
import { PAIR_DOOR, cutShort, num, pct, share } from "@/lib/uniswap/words";

const CARD = "block h-full rounded-xl border border-rb-200 bg-raised p-4 dark:border-rb-600";
const TEAL_PRESS =
  "text-teal-600 hover:underline dark:text-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:focus-visible:ring-teal-400 rounded";
const MUTED = "text-rb-500";

function Figure({ label, value, sub }: { label: string; value: string | null; sub?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className={`text-xs ${MUTED}`}>{label}</dt>
      <dd className={`tabular-nums ${value ? "text-base font-semibold text-foreground" : `text-sm ${MUTED}`}`}>
        {value ?? "—"}
      </dd>
      {sub && <dd className={`text-xs ${MUTED}`}>{sub}</dd>}
    </div>
  );
}

function Card({ c, base, quote }: { c: PoolCard; base: string; quote: string }) {
  const w = PAIR_DOOR.card;
  const ws = c.windows.filter((x): x is number => x !== null);
  return (
    <div className={CARD} data-pool-card={c.key} data-pool-card-aside={c.aside?.kind}>
      <div className="mb-3 flex items-center gap-2.5">
        <ProtocolIcon id={`uniswap-${c.version}`} className="h-7 w-7 shrink-0 text-foreground" />
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{w.title(base, quote)}</div>
          <div className={`truncate text-xs ${MUTED}`}>{w.sub(c)}</div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Figure
          label={w.fees}
          value={c.windows[0] !== null ? share(c.windows[0]) : null}
          sub={ws.length === 3 ? w.feesRange(Math.min(...ws), Math.max(...ws)) : w.noRange}
        />
        <Figure
          label={w.size}
          value={c.size !== null ? `${num(c.size)} ${quote}` : null}
          sub={c.size === null ? w.sizeNotRead : c.sizeThen ? w.sizeChange(c.size / c.sizeThen - 1) : w.noChange}
        />
        <Figure label={w.price} value={c.priceMove !== null ? pct(c.priceMove, 1) : null} />
        <Figure label={w.protocolFee} value={cutShort(protocolCut(c.version, c.protocolFee))} />
      </dl>
      {c.aside && <p className={`mt-2 text-xs ${MUTED}`}>{w.aside(c.aside, quote)}</p>}
    </div>
  );
}

export function PairDoorCards({ base, quote, cards }: { base: string; quote: string; cards: PoolCard[] }) {
  const [o, setO] = useState<PairOrder>("size");
  const [all, setAll] = useState(false);
  const aside = cards.filter((c) => c.aside).length;
  const drawn = orderCards(all ? cards : cards.filter((c) => !c.aside), o);
  return (
    <div data-pair-door={`${base}-${quote}`}>
      <div
        className="mb-2 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm"
        role="group"
        aria-label={PAIR_DOOR.orderLabel}
      >
        <span className={`mr-1 ${MUTED}`}>{PAIR_DOOR.orderLabel}</span>
        {(Object.keys(PAIR_DOOR.orders) as PairOrder[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === o}
            onClick={() => setO(k)}
            data-pair-order={k}
            className={`rounded-md px-2 py-0.5 ${
              k === o ? "bg-rb-100 font-medium text-foreground dark:bg-rb-700" : TEAL_PRESS
            }`}
          >
            {PAIR_DOOR.orders[k]}
          </button>
        ))}
      </div>
      <p className={`mb-4 max-w-3xl text-sm ${MUTED}`} data-pair-intro="">
        {PAIR_DOOR.intro(o)}
      </p>
      {drawn.length === 0 ? (
        <p className={`text-sm ${MUTED}`}>{PAIR_DOOR.none(base, quote)}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {drawn.map((c) => (
            <li key={c.key}>
              <Card c={c} base={base} quote={quote} />
            </li>
          ))}
        </ul>
      )}
      {aside > 0 && (
        <p className={`mt-5 text-sm ${MUTED}`} data-pair-aside={aside}>
          {PAIR_DOOR.aside(aside, all)}{" "}
          <button type="button" className={TEAL_PRESS} onClick={() => setAll(!all)} aria-pressed={all}>
            {all ? PAIR_DOOR.hide : PAIR_DOOR.show}
          </button>
        </p>
      )}
    </div>
  );
}

"use client";

// The asset explorer's body (rails-ops reference/asset-key-map.md, "The asset
// explorer"; anatomy A5): the category pills, the view switch and the sort,
// then the cards (A5.4) or the Prices-list rows (A5.1). The selection lives in
// the URL (`?cat=`, `?view=list`, `?sort=`), written in place without a reload.

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AssetPriceRow, asOfMark, asOfWords } from "@/components/assets/asset-price-row";
import { formatCompactTitled } from "@/lib/shared/format-compact";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { ASSET_CATEGORY_LABELS, ASSET_CATEGORY_ORDER, type AssetCategory } from "@/lib/shared/asset-categories";
import {
  CARD_SORTS,
  sortCards,
  type AssetCard,
  type CardFigure,
  type CardLink,
  type CardSort,
  type ExplorerState,
  PRICELESS_WHY,
} from "@/lib/shared/asset-explorer";
import { chainName } from "@/lib/shared/asset-roster";
import type { ChainId } from "@/lib/shared/chains";

const CATEGORY_NOTE = "Rails’ classification of the asset";

export function AssetExplorer({ cards, initial }: { cards: AssetCard[]; initial: ExplorerState }) {
  const [state, setState] = useState(initial);
  const update = useCallback((next: Partial<ExplorerState>) => {
    setState((s) => {
      const n = { ...s, ...next };
      const sp = new URLSearchParams(window.location.search);
      for (const [k, v, def] of [
        ["cat", n.cat, "all"],
        ["view", n.view, "grid"],
        ["sort", n.sort, "read"],
      ] as const)
        if (v === def) sp.delete(k);
        else sp.set(k, v);
      const qs = sp.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      return n;
    });
  }, []);

  const counts = useMemo(() => {
    const m = new Map<AssetCategory, number>();
    for (const c of cards) m.set(c.category, (m.get(c.category) ?? 0) + 1);
    return m;
  }, [cards]);
  const shown = useMemo(
    () => sortCards(state.cat === "all" ? cards : cards.filter((c) => c.category === state.cat), state.sort),
    [cards, state.cat, state.sort],
  );

  // The list holds the priced cards; a card with no price is in the grid alone.
  const count = state.view === "list" ? shown.filter((c) => c.row).length : shown.length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Category" data-anatomy="A5.5">
        {(["all", ...ASSET_CATEGORY_ORDER] as const).map((c) => {
          const n = c === "all" ? cards.length : (counts.get(c) ?? 0);
          if (c !== "all" && n === 0) return null;
          const on = state.cat === c;
          return (
            <button
              key={c}
              type="button"
              className={on ? "pill-active" : "pill-idle"}
              aria-pressed={on}
              data-asset-category-pill={c}
              title={c === "all" ? undefined : CATEGORY_NOTE}
              onClick={() => update({ cat: c })}
            >
              {c === "all" ? "All" : ASSET_CATEGORY_LABELS[c]} <span className="tabular-nums">({n})</span>
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex gap-1" role="group" aria-label="View" data-anatomy="A5.6">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={state.view === v ? "pill-active" : "pill-idle"}
              aria-pressed={state.view === v}
              data-asset-view={v}
              onClick={() => update({ view: v })}
            >
              {v === "grid" ? "Cards" : "List"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-rb-500" data-anatomy="A5.7">
          Sort
          <select
            className="rounded border border-rb-200 bg-transparent px-1.5 py-0.5 text-xs text-foreground dark:border-rb-800"
            value={state.sort}
            data-asset-sort=""
            onChange={(e) => update({ sort: e.target.value as CardSort })}
          >
            {CARD_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-rb-500 tabular-nums" data-asset-count={count}>
          {count.toLocaleString("en-US")} {count === 1 ? "asset" : "assets"}
          {state.view === "list" && count < shown.length ? ` with a price, of ${shown.length}` : ""}
        </span>
      </div>
      {state.view === "list" ? (
        <ul className="max-w-xl divide-y divide-rb-200 dark:divide-rb-800" data-asset-prices="">
          {shown.map((c) => c.row && <AssetPriceRow key={c.id} row={c.row} />)}
        </ul>
      ) : (
        <ul
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
          data-asset-cards={state.cat}
        >
          {shown.map((c) => (
            <AssetCardView key={c.id} card={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** One link per symbol: a token on two chains links its first chain's page. */
function RelLinks({ label, links: all }: { label: string; links: CardLink[] }) {
  const links = all.filter((l, i) => all.findIndex((x) => x.symbol === l.symbol) === i);
  if (!links.length) return null;
  return (
    <p className="truncate text-[11px] text-rb-500">
      {label}{" "}
      {links.map((l, i) => (
        <span key={l.href}>
          {i > 0 && ", "}
          <Link href={l.href} className="link-muted underline-offset-2 hover:underline">
            {l.symbol}
          </Link>
        </span>
      ))}
    </p>
  );
}

/** A card without a price's figure: "Supply 12.3M ZCHF 10:41 UTC", "Trove debt 38.2M BOLD". */
/** A card without a price's figure (A5.11); the asset page (A1.3) draws it too. */
export function FigureRow({ figure: f }: { figure: CardFigure }) {
  const n = formatCompactTitled(f.amount);
  const title = `${f.title}${f.asOf ? `, ${asOfWords(f.asOf)}` : ""}: ${n.title} ${f.unit}`;
  return (
    <p
      className="flex items-baseline gap-1.5 text-sm tabular-nums"
      title={title}
      data-asset-card-figure={f.label}
      data-anatomy="A5.11"
    >
      <span className="text-xs text-rb-500">{f.label}</span>
      <span className="font-semibold text-foreground">
        {n.display} {f.unit}
      </span>
      {f.asOf && (
        <span className="text-[11px] text-rb-500" data-asset-card-figure-as-of={f.asOf.block}>
          {asOfMark(f.asOf)}
        </span>
      )}
    </p>
  );
}

function AssetCardView({ card }: { card: AssetCard }) {
  const many = card.chains.length > 1;
  const wraps = card.wrapped.filter((w) => w.kind === "wraps");
  const rate = card.wrapped.filter((w) => w.kind === "rate");
  return (
    <li
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-rb-200 p-3 dark:border-rb-800"
      data-asset-card={card.id}
      data-asset-category={card.category}
      data-anatomy="A5.4"
    >
      <div className="flex min-w-0 items-center gap-2">
        {card.row || card.chains[0]?.href ? (
          <Link
            href={card.row?.href ?? card.chains[0].href!}
            className="min-w-0 truncate text-sm font-semibold text-foreground hover:underline"
          >
            {card.symbol}
          </Link>
        ) : (
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">{card.symbol}</span>
        )}
        {card.short && <span className="shrink-0 font-mono text-[11px] text-rb-500">{card.short}</span>}
        <span
          className="shrink-0 rounded-full border border-rb-200 px-1.5 py-0.5 text-[10px] leading-none text-rb-500 dark:border-rb-800"
          title={CATEGORY_NOTE}
          data-asset-category-badge={card.category}
          data-anatomy="A5.8"
        >
          {ASSET_CATEGORY_LABELS[card.category]}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5" data-asset-card-chains="">
          {card.chains.map((c) =>
            c.href ? (
              <Link
                key={c.href}
                href={c.href}
                title={`${card.symbol} on ${chainName(c.chain)}`}
                aria-label={`${card.symbol} on ${chainName(c.chain)}`}
                className="text-rb-500 hover:text-foreground"
              >
                <ChainGlyph id={c.chain as ChainId} className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span
                key={`${c.chain}:${c.token}`}
                title={`${card.symbol} on ${chainName(c.chain)}, no stored price`}
                aria-label={`${card.symbol} on ${chainName(c.chain)}, no stored price`}
                className="text-rb-500"
              >
                <ChainGlyph id={c.chain as ChainId} className="h-3.5 w-3.5" />
              </span>
            ),
          )}
        </span>
      </div>
      {card.row ? (
        <AssetPriceRow row={card.row} as="div" />
      ) : (
        <>
          {card.figure && <FigureRow figure={card.figure} />}
          <p className="text-xs text-rb-500" data-asset-priceless="" data-anatomy="A5.10">
            {PRICELESS_WHY}
          </p>
        </>
      )}
      {card.underlying && (
        <RelLinks label={card.underlying.kind === "rate" ? "Priced from" : "Wraps"} links={[card.underlying]} />
      )}
      <RelLinks label="Wrapped as" links={wraps} />
      <RelLinks label="Priced from it:" links={rate} />
      {card.takes.length > 0 && <p className="text-[11px] text-rb-500">Also as {card.takes.join(", ")}</p>}
      {card.chips.length > 0 ? (
        <ul className="flex flex-wrap gap-1" data-asset-chips="">
          {card.chips.map((ch) => (
            <li key={ch.explorer}>
              <Link
                href={ch.href}
                className="inline-flex items-center gap-1 rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-xs text-foreground hover:bg-[var(--surface-active)]"
                title={`${card.symbol} on ${ch.label}, ${chainName(ch.chain)}`}
                data-asset-chip={ch.explorer}
                data-asset-chip-link={ch.link}
                data-anatomy="A5.9"
              >
                <ProtocolIcon id={ch.explorer} className="h-3 w-3 shrink-0" />
                {ch.label}
                {many && <ChainGlyph id={ch.chain as ChainId} className="h-2.5 w-2.5 text-rb-500" />}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-rb-500">No Rails explorer lists it.</p>
      )}
    </li>
  );
}

"use client";

// The vault comparison's picker (E1.1; rails-ops ui-jobs 779): a stack of
// search fields joined by "vs", one vault each, two to four, each pick with a
// × that clears it, then Compare, which opens the page with the picks in
// `?v=` in slot order (shareable). Each field searches every vault the search
// index holds (lib/search/index-client.ts, /api/search/index): by name,
// symbol, asset or address, best match first, a funded vault before an empty
// one. A vault already picked is not offered again.

import { useEffect, useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { PILL_CTA } from "@/lib/shared/ui-grammar";
import { loadSearchIndex } from "@/lib/search/index-client";
import { matchTier, shortAddr, type SearchIndex, type SearchVault } from "@/lib/search/suggest";
import { COMPARE_MAX, COMPARE_MIN, compareHref, compareKey, pickedKeys } from "@/lib/vaults/compare";
import { COMPARE_PICKER as W } from "@/lib/vaults/compare-words";

/** One picked vault, as the slot shows it. */
export interface ComparePick {
  key: string;
  name: string;
  /** "Morpho · Base". */
  detail: string;
}

const SHOWN = 8;

const chainIdOf = (name: string): number | null =>
  (Object.values(CHAINS).find((c) => c.name === name)?.id as ChainId | undefined) ?? null;

interface Option extends ComparePick {
  address: string;
}

const optionOf = (v: SearchVault): Option | null => {
  const chainId = chainIdOf(v[4]);
  if (chainId == null) return null;
  return {
    key: compareKey(chainId, v[5]),
    name: v[0] || v[1] || shortAddr(v[5]),
    detail: `${v[3]} · ${v[4]}`,
    address: v[5],
  };
};

/** The index's vaults matching `q`: best tier first, then the index's order
 *  (stored size, funded before empty), at most eight. */
function matches(index: SearchIndex, q: string, taken: ReadonlySet<string>): Option[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const scored: { o: Option; tier: number; at: number }[] = [];
  index.vaults.forEach((v, at) => {
    const tier = Math.max(
      matchTier(v[0], needle),
      matchTier(v[1], needle),
      matchTier(v[2], needle),
      needle.startsWith("0x") && v[5].startsWith(needle) ? 3 : 0,
    );
    if (tier === 0) return;
    const o = optionOf(v);
    if (o && !taken.has(o.key)) scored.push({ o, tier, at });
  });
  scored.sort((a, b) => b.tier - a.tier || a.at - b.at);
  return scored.slice(0, SHOWN).map((s) => s.o);
}

function Slot({
  n,
  pick,
  index,
  failed,
  taken,
  onPick,
  onClear,
  onFirstUse,
}: {
  n: number;
  pick: ComparePick | null;
  index: SearchIndex | null;
  failed: boolean;
  taken: ReadonlySet<string>;
  onPick: (p: ComparePick) => void;
  onClear: () => void;
  onFirstUse: () => void;
}) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rows = useMemo(() => (index ? matches(index, q, taken) : []), [index, q, taken]);

  if (pick)
    return (
      <div
        className="flex min-h-11 items-center gap-3 rounded-xl border border-rb-300 bg-raised px-4 py-2 dark:border-rb-600"
        data-compare-slot={n}
        data-compare-pick={pick.key}
      >
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">{pick.name}</span>
          <span className="min-w-0 shrink-[8] truncate text-xs text-rb-500">{pick.detail}</span>
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label={W.clear(pick.name)}
          className="-mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-rb-500 hover:bg-[var(--surface-row-hover)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none dark:hover:bg-rb-800"
          data-compare-clear={pick.key}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );

  const choose = (o: Option) => {
    onPick({ key: o.key, name: o.name, detail: o.detail });
    setQ("");
    setOpen(false);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && rows[active]) {
      e.preventDefault();
      choose(rows[active]);
    } else if (e.key === "Escape") setOpen(false);
  };
  const said = !q.trim() ? null : failed ? W.failed : !index ? W.loading : rows.length === 0 ? W.noMatch : null;

  return (
    <div className="relative" data-compare-slot={n}>
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          onFirstUse();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey}
        placeholder={W.placeholder}
        aria-label={W.slot(n)}
        role="combobox"
        aria-expanded={open && rows.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        className="min-h-11 w-full rounded-xl border border-rb-300 bg-raised px-4 py-2 text-base text-foreground placeholder:text-rb-500 focus:border-teal-500 focus:outline-none sm:text-sm dark:border-rb-600"
        data-compare-input={n}
      />
      {open && rows.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-20 mt-2 overflow-hidden rounded-2xl border border-rb-300 bg-raised py-1.5 text-left shadow-lg dark:border-rb-600"
          data-compare-options=""
        >
          {rows.map((o, i) => (
            <li
              key={o.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => i !== active && setActive(i)}
              onClick={() => choose(o)}
              className={`flex cursor-pointer items-baseline gap-2 px-4 py-2 ${i === active ? "bg-rb-200 dark:bg-rb-600" : ""}`}
              data-compare-option={o.key}
            >
              <span className="min-w-0 truncate text-sm text-foreground">{o.name}</span>
              <span className="min-w-0 shrink-[8] truncate text-xs text-rb-500">
                {o.detail} · {shortAddr(o.address)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {said && (
        <p className="mt-1.5 px-1 text-xs text-rb-500" role="status" data-compare-said="">
          {said}
        </p>
      )}
    </div>
  );
}

export function ComparePicker({ initial }: { initial: ComparePick[] }) {
  const router = useRouter();
  const [slots, setSlots] = useState<(ComparePick | null)[]>(() => {
    const s: (ComparePick | null)[] = initial.slice(0, COMPARE_MAX);
    while (s.length < COMPARE_MIN) s.push(null);
    return s;
  });
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [asked, setAsked] = useState(false);
  // The index loads on the first field's focus, as the front-door search's does.
  useEffect(() => {
    if (!asked) return;
    let live = true;
    void loadSearchIndex().then((i) => {
      if (!live) return;
      setIndex(i);
      setFailed(i == null);
    });
    return () => {
      live = false;
    };
  }, [asked]);

  const keys = pickedKeys(slots.map((s) => s?.key ?? null));
  const taken = useMemo(() => new Set(keys), [keys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (i: number, p: ComparePick | null) => setSlots((s) => s.map((x, j) => (j === i ? p : x)));
  const ready = keys.length >= COMPARE_MIN;

  return (
    <form
      className="max-w-xl"
      aria-label={W.label}
      data-anatomy="E1.1"
      data-compare-picker={keys.join(",")}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) router.push(compareHref(keys));
      }}
    >
      <ol className="space-y-1">
        {slots.map((p, i) => (
          <li key={i}>
            {i > 0 && (
              <p className="py-1 text-center text-xs font-semibold tracking-wider text-rb-500 uppercase" aria-hidden>
                {W.vs}
              </p>
            )}
            <Slot
              n={i + 1}
              pick={p}
              index={index}
              failed={failed}
              taken={taken}
              onPick={(x) => set(i, x)}
              onClear={() => set(i, null)}
              onFirstUse={() => setAsked(true)}
            />
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="submit"
          disabled={!ready}
          className={`${PILL_CTA} disabled:cursor-not-allowed disabled:opacity-50`}
          data-compare-go=""
        >
          {W.go}
        </button>
        {slots.length < COMPARE_MAX && (
          <button
            type="button"
            onClick={() => setSlots((s) => [...s, null])}
            className="text-sm font-semibold text-teal-600 hover:underline dark:text-teal-400"
            data-compare-add=""
          >
            {W.add}
          </button>
        )}
        {!ready && (
          <span className="text-xs text-rb-500" data-compare-need="">
            {W.needTwo}
          </span>
        )}
      </div>
    </form>
  );
}

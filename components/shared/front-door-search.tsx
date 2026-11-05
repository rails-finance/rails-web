"use client";

// The search (rails-ops decision 0051, app anatomy H15): one control for the
// home hero, the brand rail, the header bar below 768px, a position-first
// explorer's front door (N5) and the listing toolbar (N1.1).
//
// - `SearchBox` is the shared look: the glyph and the field. The listing
//   toolbar draws its own search through it and keeps its own behaviour (that
//   explorer's filter, its family identifiers).
// - `FrontDoorSearch` is the lookup: an address or an ENS name, resolved
//   through /api/ens/resolve, landing on the wallet view `/wallet/<address>`
//   unless the surface names its own page (N5 opens that family's position).
//   With `suggest` (the home hero and the wallet panel, ui-jobs 482) the field
//   is a combobox over suggestions (H15.2) matched in the browser against
//   /api/search/index (lib/search/suggest.ts).
// - `SearchLauncher` is the glyph that opens it from the chrome (H15.1): the
//   wallet panel (components/nav/wallet-panel.tsx), from the brand rail or the
//   header bar.
// - `useSlashToSearch` puts `/` on it from any page: the page's own search
//   where one is drawn, else the wallet panel.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { NAV_BUTTON, ctrlWaking } from "@/lib/shared/ui-grammar";
import { useHydrated } from "@/hooks/useHydrated";
import { toggleWalletPanel, useWalletPanelOpen } from "@/components/nav/wallet-panel";
import { startNavigationProgress } from "@/components/nav/navigation-progress";
import { loadBookmarks, SESSIONS_CHANGED_EVENT } from "@/lib/shared/sessions";
import { Facehash } from "@/components/shared/facehash";
import {
  ADDRESS_RE,
  ENS_RE,
  expandIndex,
  isOpenable,
  suggest,
  type SearchIndex,
  type SearchIndexWire,
  type Suggestion,
  type SuggestBookmark,
} from "@/lib/search/suggest";

/** What the field takes, said on the field (Arbitrum item 31). */
export const SEARCH_PLACEHOLDER = "Wallet address or ENS name";
/** The placeholder where the search suggests (ui-jobs 482); with no button
 *  beside it, it fits the field down to 360px and in the wallet panel. */
export const SUGGEST_PLACEHOLDER = "Search a wallet, protocol or vault";
/** The verb, everywhere the search appears (Arbitrum item 31). */
export const LOOK_UP = "Look up";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ENS = /^[^\s]+\.eth$/i;

/** What the lookup takes: an address as it is, or an ENS name to resolve. */
const lookable = (raw: string): "address" | "ens" | null => {
  const typed = raw.trim();
  if (ADDRESS.test(typed)) return "address";
  return ENS.test(typed) && typed.length >= 7 ? "ens" : null;
};

/** The wallet view for an address. */
export const walletHref = (address: string): string => `/wallet/${address.toLowerCase()}`;

/** The marker `/` looks for: a search field drawn on the page. */
const SLASH_TARGET = "data-search-input";
/** Asks the wallet panel to open when no search field is on the page. */
export const OPEN_SEARCH_EVENT = "rails-open-search";
/** ⌘K: open the wallet panel, or close it when open. */
export const TOGGLE_SEARCH_EVENT = "rails-toggle-search";

type Size = "sm" | "md" | "lg";

// Below sm every field is 16px: iOS Safari zooms the page on focus into any
// field set smaller, and the zoom stays on the page the lookup lands on.
const FIELD: Record<Size, string> = {
  // The listing toolbar's field, as it was drawn before it joined the kit.
  sm: "h-8 pl-8 pr-3 text-base sm:text-xs",
  md: "h-9 pl-8 pr-3 text-base sm:text-sm",
  lg: "h-12 pl-10 pr-3 text-base",
};
/** The same fields without the magnifier, the left padding closed up. */
const FIELD_PLAIN: Record<Size, string> = {
  sm: "h-8 px-3 text-base sm:text-xs",
  md: "h-9 px-3 text-base sm:text-sm",
  lg: "h-12 pl-5 pr-3 text-base",
};
// The home page's field (the one lg search): a full pill whose placeholder
// shows on hover and focus only, with a blue glow behind it in dark. The field
// keeps its accessible name at rest.
// The placeholder fades in over 400ms on hover or focus and out over 600ms.
const HERO_FIELD =
  "relative rounded-full placeholder:opacity-0 placeholder:transition-opacity placeholder:duration-[600ms] placeholder:ease-in-out hover:placeholder:opacity-100 hover:placeholder:duration-[400ms] hover:placeholder:ease-out focus:placeholder:opacity-100 focus:placeholder:duration-[400ms] focus:placeholder:ease-out";
// "Look up" stays muted until the field holds something it can look up; a
// press on the muted button still answers with the problem line.
const HERO_BUTTON =
  "inline-flex h-12 shrink-0 cursor-pointer items-center rounded-full border px-6 text-base font-medium transition-colors duration-200 focus-ring disabled:opacity-60";
const HERO_BUTTON_IDLE = "border-rb-300 bg-raised text-rb-500";
const HERO_BUTTON_READY = "border-blue-500 bg-blue-500 text-white hover:bg-blue-600";

/** What the search sits on. The field and the idle "Look up" are the raised
 *  tone, so on the dark canvas they lift on their own and the hairline is
 *  light-mode only; on a raised surface (the wallet panel, H16) they are the
 *  surface's tone, so in dark they keep a hairline (rb-600, the event sheet's)
 *  and the button steps up a tone. The panel's field also draws no magnifier:
 *  the rail's glyph (H15.1), blue while the panel is open and level with the
 *  row, is the row's icon (Miles, 1 Nov 2026). */
export type SearchSurface = "canvas" | "raised";
const SURFACE: Record<SearchSurface, { field: string; button: string; glyph: boolean }> = {
  canvas: { field: "dark:border-transparent", button: "dark:border-transparent", glyph: true },
  raised: { field: "dark:border-rb-600", button: "dark:border-rb-600 dark:bg-rb-700", glyph: false },
};
const GLYPH: Record<Size, { size: number; left: string }> = {
  sm: { size: 14, left: "left-3" },
  md: { size: 14, left: "left-3" },
  lg: { size: 18, left: "left-3.5" },
};

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  /** A click or tap into the field, including one on a field that already has focus. */
  onClick?: () => void;
  placeholder: string;
  size?: Size;
  surface?: SearchSurface;
  /** The box's anatomy code(s): H15 alone, or the surface's code with it. */
  anatomy?: string;
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  /** The field as an ARIA combobox over a listbox of suggestions (ui-jobs 482). */
  combobox?: { expanded: boolean; listId: string; activeId?: string };
}

/** The shared look of the search field. */
export function SearchBox({
  value,
  onChange,
  onFocus,
  onClick,
  placeholder,
  size = "md",
  surface = "canvas",
  anatomy = "H15",
  className = "",
  inputRef,
  autoFocus,
  invalid,
  describedBy,
  onKeyDown,
  onBlur,
  combobox,
}: SearchBoxProps) {
  const glyph = GLYPH[size];
  return (
    <div className={`relative ${className}`} data-anatomy={anatomy || undefined}>
      {size === "lg" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-2 -inset-y-1 hidden rounded-full bg-blue-500/25 blur-2xl dark:block"
        />
      )}
      {SURFACE[surface].glyph && (
        <Search
          size={glyph.size}
          className={`pointer-events-none absolute z-10 ${glyph.left} top-1/2 -translate-y-1/2 text-rb-500`}
          aria-hidden="true"
        />
      )}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-label={combobox ? SUGGEST_PLACEHOLDER : placeholder || SEARCH_PLACEHOLDER}
        {...(combobox
          ? {
              role: "combobox",
              "aria-expanded": combobox.expanded,
              "aria-controls": combobox.listId,
              "aria-autocomplete": "list" as const,
              "aria-activedescendant": combobox.activeId,
            }
          : {})}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-keyshortcuts="/"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoFocus={autoFocus}
        {...{ [SLASH_TARGET]: "" }}
        // A hairline in light mode: on the white canvas the raised field is a
        // shade off the page and needs an edge to read as a field; in dark the
        // surface decides (EDGE).
        className={`w-full ${size === "lg" ? HERO_FIELD : "rounded-md"} border border-rb-300 bg-raised ${SURFACE[surface].field} ${(SURFACE[surface].glyph ? FIELD : FIELD_PLAIN)[size]} text-foreground placeholder:text-rb-500 focus:outline-none focus:ring-2 focus:ring-blue-500`}
      />
    </div>
  );
}

/** The lookup: an address passes as it is, an ENS name is resolved; either
 *  lands on `href(address)`. */
function useLookup(href: (address: string) => string, onDone?: () => void) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const go = useCallback(
    (address: string) => {
      setProblem(null);
      onDone?.();
      // A push is invisible to the progress bar's link listener (ui-jobs 495).
      const to = href(address.toLowerCase());
      startNavigationProgress(to);
      router.push(to);
    },
    [router, href, onDone],
  );

  const lookUp = useCallback(
    async (raw: string) => {
      const typed = raw.trim();
      const kind = lookable(typed);
      if (kind === "address") return go(typed);
      if (kind == null) {
        setProblem("Enter a wallet address (0x and 40 hexadecimal characters) or an ENS name ending in .eth.");
        return;
      }
      setResolving(true);
      try {
        const res = await fetch(`/api/ens/resolve?name=${encodeURIComponent(typed.toLowerCase())}`);
        const body = res.ok ? ((await res.json()) as { address?: string | null; failed?: boolean }) : null;
        if (body?.address && ADDRESS.test(body.address)) go(body.address);
        else if (!body || body.failed) setProblem("Couldn't reach ENS. Try again, or paste the address.");
        else setProblem(`${typed} has no address set on ENS.`);
      } catch {
        setProblem("The ENS lookup did not answer. Try again, or paste the address.");
      } finally {
        setResolving(false);
      }
    },
    [go],
  );

  return { lookUp, go, problem, setProblem, resolving };
}

export interface FrontDoorSearchProps {
  /** Where an address lands; the wallet view unless the surface names its own. */
  href?: (address: string) => string;
  /** The field's placeholder; "" for none (the home hero). The accessible
   *  name stands either way. */
  placeholder?: string;
  size?: Size;
  surface?: SearchSurface;
  autoFocus?: boolean;
  /** Called as the lookup navigates (closes a popover or sheet). */
  onDone?: () => void;
  anatomy?: string;
  className?: string;
  /** Drawn to the right of "Look up" on the same line (the home page's sample
   *  wallet); below sm it wraps under the row, right-aligned. */
  after?: ReactNode;
  /** Suggest as the reader types (ui-jobs 482): wallets, bookmarks, explorers,
   *  vaults and tokens in a dropdown under the field. The home hero and the
   *  wallet panel only; N5 and the wallet view's empty state keep the plain
   *  lookup. */
  suggest?: boolean;
  /** Put the cursor in the field once the page has loaded, on a desktop (wide
   *  screen, fine pointer) that has not moved on: no list opens until a key or
   *  a click. */
  focusOnLoad?: boolean;
}

/** The search as a form: field, "Look up", and the reason a value was
 *  refused; with `suggest`, the suggestions under the field and no button. */
export function FrontDoorSearch({
  href = walletHref,
  placeholder,
  size = "md",
  surface = "canvas",
  autoFocus,
  onDone,
  anatomy = "H15",
  className = "",
  after,
  suggest: suggesting = false,
  focusOnLoad = false,
}: FrontDoorSearchProps) {
  const hydrated = useHydrated();
  const inputRef = useRef<HTMLInputElement>(null);
  // Set around the load-time focus so the focus handler does not open the list.
  const quietFocus = useRef(false);
  const walletPanelOpen = useWalletPanelOpen();
  const problemId = useId();
  const listId = useId();
  const router = useRouter();
  const [value, setValue] = useState("");
  const { lookUp, go, problem, setProblem, resolving } = useLookup(href, onDone);
  const s = useSuggestions(value, suggesting);

  // The cursor is ready on load, on a desktop only: a phone's keyboard would
  // cover the page and iOS zooms. Skipped for a back-navigation, a hash, a
  // scrolled page, a field already focused elsewhere, or the wallet panel open.
  const focusTried = useRef(false);
  useEffect(() => {
    if (!focusOnLoad || focusTried.current) return;
    focusTried.current = true;
    const input = inputRef.current;
    if (!input || !window.matchMedia("(min-width: 768px) and (pointer: fine)").matches) return;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "back_forward" || window.location.hash || window.scrollY > 0) return;
    const active = document.activeElement;
    if ((active && active !== document.body) || walletPanelOpen) return;
    quietFocus.current = true;
    input.focus({ preventScroll: true });
    quietFocus.current = false;
  }, [focusOnLoad, walletPanelOpen]);
  const shownPlaceholder = placeholder ?? (suggesting ? SUGGEST_PLACEHOLDER : SEARCH_PLACEHOLDER);

  const choose = (row: Suggestion) => {
    s.close();
    if (row.href) {
      setProblem(null);
      onDone?.();
      startNavigationProgress(row.href);
      router.push(row.href);
    } else if (row.address) go(row.address);
    else if (row.ens) void lookUp(row.ens);
  };

  // Enter (and "Look up" where it is drawn) does one thing: the highlighted row, else the top row,
  // else the plain lookup (which says why a value was refused).
  const commit = () => {
    const row = s.active ?? s.rows.find(isOpenable);
    if (suggesting && row && isOpenable(row)) choose(row);
    else void lookUp(value);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!suggesting) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      s.move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Escape" && s.expanded) {
      // The dropdown closes first; a second Escape reaches the wallet panel.
      e.preventDefault();
      e.stopPropagation();
      s.close();
    } else if (e.key === "Tab") s.close();
  };

  const ready = lookable(value) != null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
      className={`flex flex-col gap-1.5 ${className}`}
      data-wallet-lookup=""
      data-front-door-search=""
      data-anatomy={anatomy}
      role="search"
      {...ctrlWaking(hydrated)}
    >
      <div
        className={`${after ? "flex flex-wrap items-center justify-end gap-2" : "flex items-center gap-2"} ${suggesting ? "relative z-30" : ""}`}
      >
        <div className={after ? "flex min-w-0 flex-1 items-center gap-2 max-sm:basis-full" : "contents"}>
          <SearchBox
            value={value}
            onChange={(v) => {
              setValue(v);
              // The list opens on typing and closes when the field is cleared
              // (Miles, 5 Nov 2026); an empty field leaves what is under it
              // uncovered. ArrowDown on it still opens the saved wallets.
              if (v.trim() === "") s.close();
              else s.reopen();
              if (problem) setProblem(null);
            }}
            inputRef={inputRef}
            onFocus={suggesting ? () => (value.trim() === "" || quietFocus.current ? s.prime() : s.focus()) : undefined}
            onClick={suggesting ? () => value.trim() !== "" && s.focus() : undefined}
            onBlur={suggesting ? s.blur : undefined}
            onKeyDown={onKeyDown}
            placeholder={shownPlaceholder}
            size={size}
            surface={surface}
            anatomy=""
            className="min-w-0 flex-1"
            autoFocus={autoFocus}
            invalid={problem != null}
            describedBy={problem ? problemId : undefined}
            combobox={
              suggesting
                ? { expanded: s.expanded, listId, activeId: s.active ? optionId(listId, s.active) : undefined }
                : undefined
            }
          />
          {/* With suggestions the field has no button (Miles, 3 Nov 2026): Enter
              or a row opens; a form with one field submits on Enter alone. */}
          {!suggesting && (
            <button
              type="submit"
              className={
                size === "lg"
                  ? `${HERO_BUTTON} ${ready ? HERO_BUTTON_READY : `${HERO_BUTTON_IDLE} ${SURFACE[surface].button}`}`
                  : `${NAV_BUTTON} shrink-0`
              }
              disabled={resolving}
            >
              {resolving ? "Looking up…" : LOOK_UP}
            </button>
          )}
        </div>
        {after}
        {suggesting && s.expanded && (
          <SuggestionList listId={listId} rows={s.rows} active={s.active} onChoose={choose} onHover={s.hover} />
        )}
      </div>
      {suggesting && resolving && !problem && (
        <p role="status" className="text-xs text-rb-500">
          Looking up…
        </p>
      )}
      {problem && (
        <p id={problemId} role="alert" className="text-xs text-rb-500" data-wallet-lookup-problem="">
          {problem}
        </p>
      )}
    </form>
  );
}

// ── Suggestions (ui-jobs 482) ───────────────────────────────────────────────

/** The index, fetched once per page load on the first focus and kept. */
let indexPromise: Promise<SearchIndex | null> | null = null;
function loadSearchIndex(): Promise<SearchIndex | null> {
  indexPromise ??= fetch("/api/search/index")
    .then((r) => (r.ok ? (r.json() as Promise<SearchIndexWire>) : null))
    .then((wire) => (wire?.v === 2 ? expandIndex(wire) : null))
    .catch(() => null)
    .then((index) => {
      // A failed read is asked again on the next focus.
      if (index == null) indexPromise = null;
      return index;
    });
  return indexPromise;
}

/** ENS answers by name, for the page's life: an address, or null for none. */
const ensAnswers = new Map<string, string | null>();
/** Names whose lookup did not answer; asked again when the name is typed again. */
const ensUnreachable = new Set<string>();

const readBookmarks = (): SuggestBookmark[] =>
  loadBookmarks().map((b) => {
    const address = b.addresses[0].toLowerCase();
    const ensNames = Object.values(b.ensNames).filter((n): n is string => !!n);
    return {
      address,
      label: b.customName || b.ensNames[b.addresses[0]] || null,
      names: [b.customName, ...ensNames].filter((n): n is string => !!n),
    };
  });

function useSuggestions(value: string, on: boolean) {
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [bookmarks, setBookmarks] = useState<SuggestBookmark[]>([]);
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [, setEnsTick] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!on) return;
    const sync = () => setBookmarks(readBookmarks());
    sync();
    window.addEventListener(SESSIONS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [on]);

  // A complete ENS name is resolved once the reader pauses.
  const typed = value.trim().toLowerCase();
  const ensName = on && ENS_RE.test(typed) && typed.length >= 7 ? typed : null;
  useEffect(() => {
    if (!ensName || ensAnswers.has(ensName)) return;
    const t = setTimeout(() => {
      if (ensUnreachable.delete(ensName)) setEnsTick((n) => n + 1);
      fetch(`/api/ens/resolve?name=${encodeURIComponent(ensName)}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ address?: string | null; failed?: boolean }>) : null))
        .then((body) => {
          if (!body || body.failed) {
            ensUnreachable.add(ensName);
          } else {
            const a = body.address;
            ensUnreachable.delete(ensName);
            ensAnswers.set(ensName, a && ADDRESS_RE.test(a) ? a.toLowerCase() : null);
          }
          setEnsTick((n) => n + 1);
        })
        .catch(() => {
          ensUnreachable.add(ensName);
          setEnsTick((n) => n + 1);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [ensName]);

  const ens = ensName ? (ensUnreachable.has(ensName) ? "unreachable" : ensAnswers.get(ensName)) : undefined;
  const rows = useMemo(() => (on ? suggest(value, index, bookmarks, ens) : []), [on, value, index, bookmarks, ens]);
  const noMatch = rows.length === 0 && typed !== "";
  const display: Suggestion[] = noMatch ? [{ key: "none", kind: "Wallet", name: "No match" }] : rows;
  const openable = rows.filter(isOpenable);
  const active = openable.find((r) => r.key === activeKey) ?? null;

  const ensureIndex = () => {
    if (!index) void loadSearchIndex().then(setIndex);
  };

  return {
    rows: display,
    active,
    expanded: on && open && display.length > 0,
    focus: () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
      setOpen(true);
      ensureIndex();
    },
    /** Read the index ahead of the first keystroke, the list still shut. */
    prime: ensureIndex,
    // A press on a row lands after the field's blur on some phones, so the
    // list stays a moment.
    blur: () => {
      blurTimer.current = setTimeout(() => setOpen(false), 150);
    },
    reopen: () => {
      setOpen(true);
      ensureIndex();
      setActiveKey(null);
    },
    close: () => {
      setOpen(false);
      setActiveKey(null);
    },
    hover: (key: string) => setActiveKey(key),
    move: (step: 1 | -1) => {
      setOpen(true);
      ensureIndex();
      if (openable.length === 0) return;
      const at = openable.findIndex((r) => r.key === activeKey);
      const next = at < 0 ? (step === 1 ? 0 : openable.length - 1) : (at + step + openable.length) % openable.length;
      setActiveKey(openable[next].key);
    },
  };
}

const optionId = (listId: string, row: Suggestion) => `${listId}-${row.key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

/** The dropdown under the field (H15.2): one flat list, each row a name, a
 *  muted line after it, and its kind on the right. */
function SuggestionList({
  listId,
  rows,
  active,
  onChoose,
  onHover,
}: {
  listId: string;
  rows: Suggestion[];
  active: Suggestion | null;
  onChoose: (row: Suggestion) => void;
  onHover: (key: string) => void;
}) {
  return (
    <ul
      id={listId}
      role="listbox"
      aria-label="Suggestions"
      data-anatomy="H15.2"
      data-search-suggestions=""
      className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-rb-300 bg-raised py-1.5 text-left shadow-lg dark:border-rb-600"
    >
      {rows.map((row) => {
        const openable = isOpenable(row);
        const on = active?.key === row.key;
        return (
          <li
            key={row.key}
            id={optionId(listId, row)}
            role="option"
            aria-selected={on}
            aria-disabled={!openable || undefined}
            data-suggestion-kind={openable ? row.kind : "none"}
            // Keep the field focused through the press so the list stays.
            onMouseDown={(e) => e.preventDefault()}
            onMouseMove={() => openable && !on && onHover(row.key)}
            onClick={() => openable && onChoose(row)}
            className={`flex items-center gap-3 px-4 py-2 ${openable ? "cursor-pointer" : "cursor-default"} ${
              on ? "bg-rb-100 dark:bg-rb-800" : ""
            }`}
          >
            {/* An address row (a wallet, a bookmark) leads with its facehash, as
                the bookmarks page does; an ENS name still resolving keeps the
                face's place so the row does not shift when it lands. */}
            {(row.kind === "Wallet" || row.kind === "Bookmark") &&
              (row.address ? (
                <span
                  className="shrink-0 rounded-[5px]"
                  style={{ boxShadow: "0 0 0 2px var(--facehash-ring)" }}
                  data-suggestion-face={row.address}
                >
                  <Facehash address={row.address} size={18} />
                </span>
              ) : (
                <span className="block size-[18px] shrink-0 rounded-[5px] bg-rb-300/40 dark:bg-rb-700/40" aria-hidden />
              ))}
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              {/* The name keeps its room; the muted line gives way first. */}
              <span className={`min-w-0 truncate text-sm ${openable ? "text-foreground" : "text-rb-500"}`}>
                {row.name}
              </span>
              {row.detail && <span className="min-w-0 shrink-[8] truncate text-xs text-rb-500">{row.detail}</span>}
            </span>
            {openable && (
              <span className="shrink-0 text-xs text-rb-500">{row.kind === "Bookmark" ? "Saved" : row.kind}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** `/` focuses the search from any page unless a field has focus: the page's
 *  own search where one is drawn and visible, else the wallet panel's. ⌘K
 *  (Ctrl+K off a Mac) opens and closes the wallet panel from anywhere, a
 *  field included (ui-jobs 503). */
export function useSlashToSearch() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new Event(TOGGLE_SEARCH_EVENT));
        return;
      }
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.isContentEditable)
      )
        return;
      e.preventDefault();
      const fields = Array.from(document.querySelectorAll<HTMLInputElement>(`input[${SLASH_TARGET}]`));
      const onPage = fields.find((f) => f.getClientRects().length > 0 && !f.closest("[data-search-launcher-panel]"));
      if (onPage) {
        onPage.focus();
        onPage.select();
        return;
      }
      window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** lucide's `layout-grid` with its four squares filled (Miles, 4 Nov 2026). */
function FilledLayoutGrid() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}

/** The glyph in the chrome that opens the wallet panel (H15.1), from the
 *  brand rail or the header bar. It reads as active while the panel is open.
 *  `at="chooser"` is the grid glyph (ui-jobs 497), a second way in that opens
 *  the same panel with the focus on the explorer chooser; it is not drawn
 *  since 503, and putting it back is one more launcher in the rail. */
export function SearchLauncher({
  placement,
  at = "search",
}: {
  placement: "rail" | "header";
  at?: "search" | "chooser";
}) {
  const open = useWalletPanelOpen();
  if (at === "chooser")
    return (
      <button
        type="button"
        onClick={(e) => toggleWalletPanel(e.currentTarget, "chooser")}
        className={`cursor-pointer rounded-lg p-2.5 transition-colors duration-150 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          open ? "text-blue-600 dark:text-blue-400" : "text-rb-700 dark:text-rb-300"
        }`}
        aria-label="Open an explorer"
        aria-expanded={open}
        title="Open an explorer"
        data-chooser-trigger={placement}
      >
        <FilledLayoutGrid />
      </button>
    );
  return (
    <button
      type="button"
      onClick={(e) => toggleWalletPanel(e.currentTarget)}
      className={`cursor-pointer rounded-lg p-2.5 transition-colors duration-150 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        open ? "text-blue-600 dark:text-blue-400" : "text-rb-700 dark:text-rb-300"
      }`}
      aria-label="Search and explorers"
      aria-expanded={open}
      aria-keyshortcuts="/ Meta+K"
      title="Search and explorers (/ or ⌘K)"
      data-anatomy="H15.1"
      data-search-launcher={placement}
    >
      <Search size={18} aria-hidden="true" />
    </button>
  );
}

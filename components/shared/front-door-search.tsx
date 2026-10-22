"use client";

// The search (rails-ops decision 0051, app anatomy H15): one control for the
// home hero, the brand rail, the header bar below 768px, a position-first
// explorer's front door (N5) and the listing toolbar (N1.1).
//
// - `SearchBox` is the shared look: the glyph, the field, and a slot for the
//   bookmarks dropdown under it. The listing toolbar draws its own search
//   through it and keeps its own behaviour (that explorer's filter, its family
//   identifiers, its bookmarks).
// - `FrontDoorSearch` is the lookup: an address or an ENS name, resolved
//   through /api/ens/resolve, landing on the wallet view `/wallet/<address>`
//   unless the surface names its own page (N5 opens that family's position).
// - `SearchLauncher` is the glyph that opens it from the chrome (H15.1): a
//   popover beside the brand rail, a sheet from the top of a phone.
// - `useSlashToSearch` puts `/` on it from any page: the page's own search
//   where one is drawn, else the launcher.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { WalletHistoryDropdown } from "@/components/shared/wallet-history-dropdown";
import { NAV_BUTTON, ctrlWaking } from "@/lib/shared/ui-grammar";
import { useHydrated } from "@/hooks/useHydrated";
import type { BookmarkScope } from "@/lib/shared/sessions";

/** What the field takes, said on the field (Arbitrum item 31). */
export const SEARCH_PLACEHOLDER = "Wallet address or ENS name";
/** The verb, everywhere the search appears (Arbitrum item 31). */
export const LOOK_UP = "Look up";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ENS = /^[^\s]+\.eth$/i;

/** The wallet view for an address. */
export const walletHref = (address: string): string => `/wallet/${address.toLowerCase()}`;

/** The marker `/` looks for: a search field drawn on the page. */
const SLASH_TARGET = "data-search-input";
/** Asks the chrome's launcher to open when no search field is on the page. */
const OPEN_SEARCH_EVENT = "rails-open-search";

type Size = "sm" | "md" | "lg";

// Below sm every field is 16px: iOS Safari zooms the page on focus into any
// field set smaller, and the zoom stays on the page the lookup lands on.
const FIELD: Record<Size, string> = {
  // The listing toolbar's field, as it was drawn before it joined the kit.
  sm: "h-8 pl-8 pr-3 text-base sm:text-xs",
  md: "h-9 pl-8 pr-3 text-base sm:text-sm",
  lg: "h-12 pl-10 pr-3 text-base",
};
// The home page's field (the one lg search): a full pill whose placeholder
// shows on hover and focus only, with a blue glow behind it in dark. The field
// keeps its accessible name at rest.
const HERO_FIELD =
  "relative rounded-full placeholder:opacity-0 placeholder:transition-opacity hover:placeholder:opacity-100 focus:placeholder:opacity-100";
const HERO_BUTTON =
  "inline-flex h-12 shrink-0 cursor-pointer items-center rounded-full bg-blue-500 px-6 text-base font-medium text-white transition-colors hover:bg-blue-600 focus-ring disabled:opacity-60";
const GLYPH: Record<Size, { size: number; left: string }> = {
  sm: { size: 14, left: "left-3" },
  md: { size: 14, left: "left-3" },
  lg: { size: 18, left: "left-3.5" },
};

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  placeholder: string;
  size?: Size;
  /** The box's anatomy code(s): H15 alone, or the surface's code with it. */
  anatomy?: string;
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  containerRef?: RefObject<HTMLDivElement | null>;
  autoFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Under the field: the bookmarks dropdown. */
  children?: ReactNode;
}

/** The shared look of the search field. */
export function SearchBox({
  value,
  onChange,
  onFocus,
  placeholder,
  size = "md",
  anatomy = "H15",
  className = "",
  inputRef,
  containerRef,
  autoFocus,
  invalid,
  describedBy,
  children,
}: SearchBoxProps) {
  const glyph = GLYPH[size];
  return (
    <div className={`relative ${className}`} ref={containerRef} data-anatomy={anatomy || undefined}>
      {size === "lg" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-2 -inset-y-1 hidden rounded-full bg-blue-500/25 blur-2xl dark:block"
        />
      )}
      <Search
        size={glyph.size}
        className={`pointer-events-none absolute ${glyph.left} top-1/2 -translate-y-1/2 text-rb-500`}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-keyshortcuts="/"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoFocus={autoFocus}
        {...{ [SLASH_TARGET]: "" }}
        // A hairline in light mode: on the white canvas the raised field is a
        // shade off the page and needs an edge to read as a field; the dark
        // canvas lifts it on its own.
        className={`w-full ${size === "lg" ? HERO_FIELD : "rounded-md"} border border-rb-300 bg-raised dark:border-transparent ${FIELD[size]} text-foreground placeholder:text-rb-500 focus:outline-none focus:ring-2 focus:ring-blue-500`}
      />
      {children}
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
      router.push(href(address.toLowerCase()));
    },
    [router, href, onDone],
  );

  const lookUp = useCallback(
    async (raw: string) => {
      const typed = raw.trim();
      if (ADDRESS.test(typed)) return go(typed);
      if (!ENS.test(typed) || typed.length < 7) {
        setProblem("Enter a wallet address (0x and 40 hexadecimal characters) or an ENS name ending in .eth.");
        return;
      }
      setResolving(true);
      try {
        const res = await fetch(`/api/ens/resolve?name=${encodeURIComponent(typed.toLowerCase())}`);
        const body = res.ok ? ((await res.json()) as { address?: string | null }) : null;
        if (body?.address && ADDRESS.test(body.address)) go(body.address);
        else setProblem(`${typed} does not name an address on ENS.`);
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
  placeholder?: string;
  size?: Size;
  /** The bookmarks under the field: one explorer's, or every explorer's. */
  bookmarks?: BookmarkScope | "all";
  /** Keep the bookmarks dropdown closed while there are none. */
  hideEmptyBookmarks?: boolean;
  autoFocus?: boolean;
  /** Called as the lookup navigates (closes a popover or sheet). */
  onDone?: () => void;
  anatomy?: string;
  className?: string;
  /** Drawn to the right of "Look up" on the same line (the home page's sample
   *  wallet); below sm it wraps under the row, right-aligned. */
  after?: ReactNode;
}

/** The search as a form: field, "Look up", the bookmarks, and the reason a
 *  value was refused. */
export function FrontDoorSearch({
  href = walletHref,
  placeholder = SEARCH_PLACEHOLDER,
  size = "md",
  bookmarks,
  hideEmptyBookmarks,
  autoFocus,
  onDone,
  anatomy = "H15",
  className = "",
  after,
}: FrontDoorSearchProps) {
  const hydrated = useHydrated();
  const problemId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const { lookUp, go, problem, setProblem, resolving } = useLookup(href, onDone);
  const showBookmarks = !!bookmarks && focused && !value;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void lookUp(value);
      }}
      className={`flex flex-col gap-1.5 ${className}`}
      data-wallet-lookup=""
      data-front-door-search=""
      data-anatomy={anatomy}
      role="search"
      {...ctrlWaking(hydrated)}
    >
      <div className={after ? "flex flex-wrap items-center justify-end gap-2" : "flex items-center gap-2"}>
        <div className={after ? "flex min-w-0 flex-1 items-center gap-2 max-sm:basis-full" : "contents"}>
          <SearchBox
            value={value}
            onChange={(v) => {
              setValue(v);
              if (problem) setProblem(null);
            }}
            onFocus={() => setFocused(true)}
            placeholder={placeholder}
            size={size}
            anatomy=""
            className="min-w-0 flex-1"
            containerRef={containerRef}
            autoFocus={autoFocus}
            invalid={problem != null}
            describedBy={problem ? problemId : undefined}
          >
            {bookmarks && (
              <WalletHistoryDropdown
                show={showBookmarks}
                containerRef={containerRef}
                onClose={() => setFocused(false)}
                onPick={(address) => {
                  setFocused(false);
                  go(address);
                }}
                protocol={bookmarks}
                hideWhenEmpty={hideEmptyBookmarks}
              />
            )}
          </SearchBox>
          <button type="submit" className={size === "lg" ? HERO_BUTTON : `${NAV_BUTTON} shrink-0`} disabled={resolving}>
            {resolving ? "Looking up…" : LOOK_UP}
          </button>
        </div>
        {after}
      </div>
      {problem && (
        <p id={problemId} role="alert" className="text-xs text-rb-500" data-wallet-lookup-problem="">
          {problem}
        </p>
      )}
    </form>
  );
}

/** `/` focuses the search from any page unless a field has focus: the page's
 *  own search where one is drawn and visible, else the chrome's launcher. */
export function useSlashToSearch() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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

/** The glyph in the chrome that opens the search (H15.1): from the brand rail
 *  a popover beside it, from the header bar a sheet from the top on a phone and
 *  a popover under the glyph from 768px. Every explorer's bookmarks sit under
 *  its field. */
export function SearchLauncher({ placement }: { placement: "rail" | "header" }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  // `/` with no search on the page: the launcher a reader can see opens.
  useEffect(() => {
    const onOpen = () => {
      if (buttonRef.current && buttonRef.current.getClientRects().length > 0) setOpen(true);
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const panelPlace =
    placement === "rail"
      ? // Beside the rail's glyph: the rail is 56px wide and fixed.
        "fixed left-16 top-3 w-[26rem] max-w-[calc(100vw-5rem)] rounded-xl"
      : // A sheet across the top of a phone; from md a popover under the glyph.
        "fixed inset-x-0 top-0 rounded-b-xl md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:w-[26rem] md:rounded-xl";

  return (
    <div className={placement === "header" ? "relative" : undefined}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer rounded-lg p-2.5 text-rb-700 transition-colors duration-150 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-rb-300"
        aria-label="Look up a wallet"
        aria-expanded={open}
        aria-keyshortcuts="/"
        title="Look up a wallet (/)"
        data-anatomy="H15.1"
        data-search-launcher={placement}
      >
        <Search size={18} aria-hidden="true" />
      </button>
      {open && (
        <>
          {placement === "header" && (
            <div className="fixed inset-0 z-[var(--z-modal)] bg-black/30 md:hidden" aria-hidden="true" />
          )}
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Look up a wallet"
            data-search-launcher-panel=""
            className={`${panelPlace} z-[var(--z-modal)] border border-rb-200 bg-background p-4 shadow-lg dark:border-rb-800`}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Look up a wallet</p>
              <button
                type="button"
                onClick={close}
                className="cursor-pointer rounded-md p-1 text-rb-500 hover:text-foreground"
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <FrontDoorSearch bookmarks="all" autoFocus onDone={close} />
          </div>
        </>
      )}
    </div>
  );
}

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
// - `SearchLauncher` is the glyph that opens it from the chrome (H15.1): the
//   wallet panel (components/nav/wallet-panel.tsx), from the brand rail or the
//   header bar.
// - `useSlashToSearch` puts `/` on it from any page: the page's own search
//   where one is drawn, else the wallet panel.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { NAV_BUTTON, ctrlWaking } from "@/lib/shared/ui-grammar";
import { useHydrated } from "@/hooks/useHydrated";
import { toggleWalletPanel, useWalletPanelOpen } from "@/components/nav/wallet-panel";

/** What the field takes, said on the field (Arbitrum item 31). */
export const SEARCH_PLACEHOLDER = "Wallet address or ENS name";
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
// The placeholder fades in over 400ms on hover or focus and out over 600ms.
const HERO_FIELD =
  "relative rounded-full placeholder:opacity-0 placeholder:transition-opacity placeholder:duration-[600ms] placeholder:ease-in-out hover:placeholder:opacity-100 hover:placeholder:duration-[400ms] hover:placeholder:ease-out focus:placeholder:opacity-100 focus:placeholder:duration-[400ms] focus:placeholder:ease-out";
// "Look up" stays muted until the field holds something it can look up; a
// press on the muted button still answers with the problem line.
const HERO_BUTTON =
  "inline-flex h-12 shrink-0 cursor-pointer items-center rounded-full border px-6 text-base font-medium transition-colors duration-200 focus-ring disabled:opacity-60";
const HERO_BUTTON_IDLE = "border-rb-300 bg-raised text-rb-500 dark:border-transparent";
const HERO_BUTTON_READY = "border-blue-500 bg-blue-500 text-white hover:bg-blue-600";
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
  autoFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
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
  autoFocus,
  invalid,
  describedBy,
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
      <Search
        size={glyph.size}
        className={`pointer-events-none absolute z-10 ${glyph.left} top-1/2 -translate-y-1/2 text-rb-500`}
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
      const kind = lookable(typed);
      if (kind === "address") return go(typed);
      if (kind == null) {
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
  autoFocus?: boolean;
  /** Called as the lookup navigates (closes a popover or sheet). */
  onDone?: () => void;
  anatomy?: string;
  className?: string;
  /** Drawn to the right of "Look up" on the same line (the home page's sample
   *  wallet); below sm it wraps under the row, right-aligned. */
  after?: ReactNode;
}

/** The search as a form: field, "Look up", and the reason a value was
 *  refused. */
export function FrontDoorSearch({
  href = walletHref,
  placeholder = SEARCH_PLACEHOLDER,
  size = "md",
  autoFocus,
  onDone,
  anatomy = "H15",
  className = "",
  after,
}: FrontDoorSearchProps) {
  const hydrated = useHydrated();
  const problemId = useId();
  const [value, setValue] = useState("");
  const { lookUp, problem, setProblem, resolving } = useLookup(href, onDone);

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
            placeholder={placeholder}
            size={size}
            anatomy=""
            className="min-w-0 flex-1"
            autoFocus={autoFocus}
            invalid={problem != null}
            describedBy={problem ? problemId : undefined}
          />
          <button
            type="submit"
            className={
              size === "lg"
                ? `${HERO_BUTTON} ${lookable(value) ? HERO_BUTTON_READY : HERO_BUTTON_IDLE}`
                : `${NAV_BUTTON} shrink-0`
            }
            disabled={resolving}
          >
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

/** The glyph in the chrome that opens the wallet panel (H15.1), from the
 *  brand rail or the header bar. It reads as active while the panel is open. */
export function SearchLauncher({ placement }: { placement: "rail" | "header" }) {
  const open = useWalletPanelOpen();
  return (
    <button
      type="button"
      onClick={(e) => toggleWalletPanel(e.currentTarget)}
      className={`cursor-pointer rounded-lg p-2.5 transition-colors duration-150 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        open ? "text-blue-500" : "text-rb-700 dark:text-rb-300"
      }`}
      aria-label="Look up a wallet"
      aria-expanded={open}
      aria-keyshortcuts="/"
      title="Look up a wallet (/)"
      data-anatomy="H15.1"
      data-search-launcher={placement}
    >
      <Search size={18} aria-hidden="true" />
    </button>
  );
}

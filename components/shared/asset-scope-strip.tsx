"use client";

// Focus mode (ui-jobs 557): its panel and its arrival dialog. Focus shows on
// the profile control (components/shared/focus-avatar.tsx), and its menu opens
// with a Focus section (Miles, 10 Nov 2026). The ways in are the profile
// menu, which opens the panel (OPEN_SCOPE_PANEL), and the Focus button on a
// token or chain row of the search's dropdown
// (components/shared/aim-search-button.tsx).
//
// The panel edits one view on a draft: its name, then two parts. Assets: each
// chosen asset with one switch, "Built on it", added through AssetChooser.
// Chains: one press per chain; none pressed is every chain. A draft becomes a
// view, put in use, once it holds something; a view emptied in the panel is
// removed, and Focus is off. Opened from a link's dialog, the draft is the
// link's proposal and nothing is saved until "Use this view".
//
// Arriving on `?assets=` / `?chains=` (with `&view=` naming it), a dialog says
// what Focus mode is and lists what the link sets (FocusLinkIntro). Nothing
// filters by the link until "Use this view".
//
// Words: "Turn off" ends Focus; "Show all" lifts it on one list or page until
// it is left; "Off" is the menu's row. Inside a Focus section (the menu, the
// dialog, the panel) the press is "Change"; outside one (a gate, a row's ⋮,
// a list's chip) it is "Change focus".

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CHAINS } from "@/lib/shared/chains";
import { useChainListing, type ExplorerStatus } from "@/lib/shared/explorer-scope";
import { createPortal } from "react-dom";
import { Check, Lightbulb, Link2, ListFilter, X } from "lucide-react";
import { FocusAvatar } from "@/components/shared/focus-avatar";
import { useBookmarks } from "@/components/shared/bookmark-list";
import { SAMPLE_WALLET } from "@/lib/shared/sample-wallet";
import { AssetChooser, optionKey, type AssetChooserOption } from "@/components/shared/asset-chooser";
import { MobileSheet, MobileSheetFilterHeader } from "@/components/shared/mobile-sheet";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { ChainGlyph, segmentClass } from "@/components/shared/chain-toggle";
import { launchedChains } from "@/lib/shared/protocols";
import type { ChainId } from "@/lib/shared/chains";
import { builtOnSymbols, FAMILY_ROWS, familyDisplaySymbol, familyOf } from "@/lib/shared/asset-family";
import type { Focus } from "@/lib/shared/asset-preference";
import {
  chainNameOf,
  focusKeys,
  focusViews,
  type FocusProposal,
  type FocusView,
  OPEN_SCOPE_PANEL,
  SCOPE_CHAINS,
  SCOPE_TOKENS,
  scopeLink,
  scopeLabelOf,
  useAssetScope,
  withRecord,
  type AssetPick,
  manageHref,
} from "@/lib/shared/asset-scope";
import { OVERLAY_HEADING, PAGE_LINK, PAGE_SCRIM, RESET_LINK, FOOT_LINK } from "@/lib/shared/ui-grammar";

export const chainName = (c: number) => SCOPE_CHAINS[c] ?? chainNameOf(c);
const symbolOf = (p: Pick<AssetPick, "chain" | "token">) =>
  scopeLabelOf(p.chain, p.token) ?? `${p.token.slice(0, 6)}…${p.token.slice(-4)}`;

// Ordered by how much is built on each (BOLD, ETH and BTC first), the
// count not drawn.
export const FOCUS_OPTIONS: AssetChooserOption[] = SCOPE_TOKENS.map((t) => ({
  address: t.token,
  chain: t.chain,
  symbol: familyDisplaySymbol(t.symbol),
  count: familyOf([{ chain: t.chain, token: t.token, builtOn: true }]).size,
}));

/** The panel's target: the view in use, a new view, or a link's proposal. */
type PanelMode = "edit" | "new" | "link";

/** Focus's overlays, mounted once in the shell: the panel (opened by
 *  OPEN_SCOPE_PANEL) and the arrival dialog. */
export function AssetScopeStrip() {
  const scope = useAssetScope();
  const [panel, setPanel] = useState<{ mode: PanelMode; draft?: FocusProposal; view?: string } | null>(null);
  useEffect(() => {
    const show = (e: Event) => {
      const d = (e as CustomEvent<{ mode?: PanelMode; view?: string } | undefined>).detail;
      setPanel({ mode: d?.mode === "new" ? "new" : "edit", view: d?.view });
    };
    window.addEventListener(OPEN_SCOPE_PANEL, show);
    return () => window.removeEventListener(OPEN_SCOPE_PANEL, show);
  }, []);
  const link = scope.link;
  const linkValue = useLinkValue();

  return (
    <>
      {panel && (
        <AssetScopePanel mode={panel.mode} view={panel.view} proposal={panel.draft} onClose={() => setPanel(null)} />
      )}
      {link && !panel && (
        <FocusLinkIntro
          key={linkValue}
          seenKey={`rails-focus-intro:${linkValue}`}
          proposal={link}
          onChange={() => setPanel({ mode: "link", draft: link })}
        />
      )}
    </>
  );
}

/** The link's params as one string: a new link is a new dialog. */
function useLinkValue(): string {
  usePathname();
  if (typeof window === "undefined") return "";
  const sp = new URLSearchParams(window.location.search);
  return `${sp.get("assets") ?? ""}|${sp.get("chains") ?? ""}|${sp.get("view") ?? ""}`;
}

/** The first two picks' icons, inline before the summary. */
function PickIcons({ picks }: { picks: AssetPick[] }) {
  const shown = [...new Map(picks.map((p) => [symbolOf(p), p])).values()].slice(0, 2);
  return (
    <span className="mr-1 inline-flex shrink-0 -space-x-1 align-[-3px]" aria-hidden="true">
      {shown.map((p) => (
        <TokenChipIcon
          key={`${p.chain}:${p.token}`}
          symbol={symbolOf(p)}
          address={p.token}
          size={14}
          filterable={false}
          untitled
        />
      ))}
    </span>
  );
}

/** What a focus holds, as a view's name until it has one of its own: "WETH
 *  and BOLD", "WETH, BOLD, USDC +2 on Ethereum", "Base". */
export function focusName(picks: AssetPick[], chains: number[]): string {
  const names = [...new Set(picks.map(symbolOf))];
  const a = names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : andList(names);
  const c = andList(chains.map(chainNameOf));
  return a && c ? `${a} on ${c}` : a || c || "New view";
}

/** A saved view's name: its own, else what it holds. */
export const viewName = (v: Pick<FocusView, "name" | "assets" | "chains">) => v.name || focusName(v.assets, v.chains);

/** A view's first marks: its assets', else its chains'. */
export function ViewIcons({ picks, chains }: { picks: AssetPick[]; chains: number[] }) {
  if (picks.length) return <PickIcons picks={picks} />;
  return (
    <span className="mr-1 inline-flex shrink-0 -space-x-1 align-[-3px]" aria-hidden="true">
      {chains.slice(0, 2).map((c) => (
        <ChainGlyph key={c} chainId={c as ChainId} className="size-3.5" />
      ))}
    </span>
  );
}

/** "with sBOLD, yBOLD and 3 more": what one pick adds, short. */
function addsLine(p: AssetPick): string | null {
  if (!p.builtOn) return null;
  const adds = examplesOf([p], 99).map(familyDisplaySymbol);
  if (!adds.length) return null;
  return adds.length > 2 ? `with ${adds.slice(0, 2).join(", ")} and ${adds.length - 2} more` : `with ${andList(adds)}`;
}

/**
 * A focus as rows: one per asset (its mark, symbol and chain, and under it
 * what it adds when built-on is on), then one per chain. `max` rows, then "and
 * N more"; or every row, scrolling past `scrollAfter` with the bottom fade.
 */
export function FocusRows({
  picks,
  chains,
  max,
  scrollAfter,
  size = 18,
}: {
  picks: AssetPick[];
  chains: number[];
  max?: number;
  scrollAfter?: number;
  size?: number;
}) {
  // One row per symbol and switch: WETH on Ethereum and on Base is one row.
  const groups = new Map<string, { pick: AssetPick; chains: number[] }>();
  for (const p of picks) {
    const k = `${symbolOf(p)}:${p.builtOn ? 1 : 0}`;
    const g = groups.get(k);
    if (!g) groups.set(k, { pick: p, chains: [p.chain] });
    else if (!g.chains.includes(p.chain)) g.chains.push(p.chain);
  }
  const unique = [...groups.values()];
  const chainFocus = chains.length > 0;
  const rows: ReactNode[] = [
    ...unique.map(({ pick: p, chains: on }) => {
      const sub = addsLine(p);
      return (
        <li key={`${p.chain}:${p.token}`} className="flex items-start gap-2 py-1.5" data-focus-row="asset">
          <span className="mt-px shrink-0">
            <TokenChipIcon symbol={symbolOf(p)} address={p.token} size={size} filterable={false} untitled />
          </span>
          <span className="min-w-0">
            <span className="flex items-baseline gap-1.5">
              <span className="truncate text-sm font-semibold text-foreground">{symbolOf(p)}</span>
              {!chainFocus && <span className="shrink-0 text-[11px] text-rb-500">{andList(on.map(chainNameOf))}</span>}
            </span>
            {sub && <span className="block text-[11px] leading-snug text-rb-500">{sub}</span>}
          </span>
        </li>
      );
    }),
    ...chains.map((c) => (
      <li key={`chain-${c}`} className="flex items-center gap-2 py-1.5" data-focus-row="chain">
        <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
          <ChainGlyph chainId={c as ChainId} className="size-4" />
        </span>
        <span className="text-sm font-semibold text-foreground">{chainNameOf(c)}</span>
        <span className="text-[11px] text-rb-500">{unique.length ? "only this chain" : "chain"}</span>
      </li>
    )),
  ];
  const shown = max != null ? rows.slice(0, max) : rows;
  const more = rows.length - shown.length;
  return (
    <>
      <FadeList count={rows.length} scrollAfter={scrollAfter} data-focus-rows={rows.length}>
        {shown}
      </FadeList>
      {more > 0 && <p className="pt-0.5 text-[11px] text-rb-500">and {more} more</p>}
    </>
  );
}

const EXAMPLES_SHOWN = 3;

/**
 * A few of what the picks add, taken in turn from each pick, each pick's
 * ordered by how much is built on it in turn, then rate tokens before vaults
 * (sBOLD and yBOLD before a one-off vault, wstETH before a WETH vault).
 */
function examplesOf(picks: AssetPick[], limit = EXAMPLES_SHOWN): string[] {
  const KIND_RANK = ["rate", "wraps", "vault", "pt", "yt", "lp", "debt"];
  const rank = (sym: string) => {
    const row = FAMILY_ROWS.find((r) => r.symbol === sym);
    if (!row) return [0, KIND_RANK.length];
    const [chain, token] = row.token.split(":");
    return [familyOf([{ chain: Number(chain), token, builtOn: true }]).size, KIND_RANK.indexOf(row.kind)];
  };
  const order = (a: string, b: string) => {
    const [ra, ka] = rank(a);
    const [rb, kb] = rank(b);
    return rb - ra || ka - kb;
  };
  const lists = picks.filter((p) => p.builtOn).map((p) => builtOnSymbols(p).sort(order));
  const out = new Set<string>();
  for (let i = 0; out.size < limit && lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length && out.size < limit) out.add(l[i]);
  return [...out];
}

/** "sBOLD, yBOLD and ysyBOLD": a list in prose. */
const andList = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

interface FocusMiss {
  text: string;
  /** "none": every explorer on the chain has a list and none holds it;
   *  "unknown": Rails cannot say (an explorer there has no asset list). */
  kind: "none" | "unknown";
  chain: number;
}

/**
 * Where a focus holds nothing, chain by chain: "BOLD isn't listed on Base"
 * only where every explorer there has an asset list and none holds it; "Rails
 * knows no BOLD on Base" where the address tables hold no BOLD there; "Rails
 * has no asset list for Arbitrum yet" where it cannot say. `empty`: on every
 * focused chain no asset is reached, so the focus would show nothing as
 * Rails stands. Null until the explorer index has arrived.
 */
export function useFocusMisses(focus: Focus): { misses: FocusMiss[]; empty: boolean } | null {
  const listing = useChainListing();
  return useMemo(() => {
    if (!listing) return null;
    const misses: FocusMiss[] = [];
    const bySymbol = new Map<string, AssetPick[]>();
    for (const p of focus.assets) bySymbol.set(symbolOf(p), [...(bySymbol.get(symbolOf(p)) ?? []), p]);
    let emptyChains = 0;
    for (const c of focus.chains) {
      let unknown = false;
      let none = 0;
      for (const [sym, picks] of bySymbol) {
        const keys = focusKeys({ assets: picks, chains: [c] }) ?? new Set<string>();
        if (!keys.size) {
          // No address for it on this chain: where Rails keeps no token table
          // for the chain it cannot say; where it does, it knows none.
          none++;
          if (SCOPE_CHAINS[c] == null) unknown = true;
          else misses.push({ text: `Rails knows no ${sym} on ${chainNameOf(c)}`, kind: "none", chain: c });
          continue;
        }
        const status: ExplorerStatus = listing(keys, c);
        if (status === "none") {
          none++;
          misses.push({ text: `${sym} isn't listed on ${chainNameOf(c)}`, kind: "none", chain: c });
        } else if (status === "unknown") unknown = true;
      }
      if (unknown)
        misses.push({ text: `Rails has no asset list for ${chainNameOf(c)} yet`, kind: "unknown", chain: c });
      if (bySymbol.size > 0 && none === bySymbol.size) emptyChains++;
    }
    return { misses, empty: focus.chains.length > 0 && emptyChains === focus.chains.length };
  }, [listing, focus]);
}

/** The dialog's rows scroll past this many (fewer on a phone). */
const INTRO_ROWS = 5;
const INTRO_ROWS_PHONE = 3;

/** On a phone, a press is at least 44px tall. */
const TAP = "min-h-11 sm:min-h-0";

/** Focus moves into a dialog as it opens, Tab stays inside it, and the page
 *  behind does not scroll. */
function useModalFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const before = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (el.querySelector<HTMLElement>("[data-autofocus]:not([disabled])") ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const all = [...el.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],input,[tabindex='0']")];
      if (!all.length) return;
      const a = all[0];
      const z = all[all.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      before?.focus?.();
    };
  }, [ref]);
}

/**
 * Arriving on a focus link: what Focus mode is and what the link sets, with
 * "Use this view" (saved as a view and put in use), Change (the panel, on the
 * link's proposal) and "Not now" (the link's params dropped). Once per link
 * per tab (sessionStorage); Escape and the scrim are "Not now". Where the
 * focus would show nothing, the dialog says so and "Use this view" waits for
 * a change.
 */
function FocusLinkIntro({
  seenKey,
  proposal,
  onChange,
}: {
  seenKey: string;
  proposal: FocusProposal;
  onChange: () => void;
}) {
  const scope = useAssetScope();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [shown, setShown] = useState(() => {
    try {
      return sessionStorage.getItem(seenKey) == null;
    } catch {
      return true;
    }
  });
  const judged = useFocusMisses(proposal.focus);
  const empty = !!judged?.empty;
  const close = () => {
    try {
      sessionStorage.setItem(seenKey, "1");
    } catch {}
    setShown(false);
  };
  const notNow = () => {
    close();
    scope.dismissLink();
  };
  useEffect(() => {
    if (!shown || isPhone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) notNow();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  if (!shown) return null;

  const { focus, name } = proposal;
  const body = (
    <div className="flex flex-col gap-3" data-focus-intro-body="">
      <p className="text-sm leading-relaxed text-rb-600 dark:text-rb-300">
        Focus mode limits Rails to the assets and chains you choose. This link sets:
      </p>
      <div className="rounded-lg border border-rb-200 px-3 py-2 dark:border-rb-800" data-focus-intro-view="">
        {name && (
          <p className="pb-1 text-sm font-bold text-foreground [overflow-wrap:anywhere]" data-focus-intro-name="">
            {name}
          </p>
        )}
        <FocusRows picks={focus.assets} chains={focus.chains} scrollAfter={isPhone ? INTRO_ROWS_PHONE : INTRO_ROWS} />
      </div>
      {judged && judged.misses.length > 0 && (
        <ul className="text-xs leading-snug text-foreground" data-focus-intro-miss={judged.misses.length}>
          {judged.misses.map((m) => (
            <li key={m.text} data-miss-kind={m.kind}>
              {m.text}
            </li>
          ))}
          {empty && (
            <li className="text-rb-500" data-focus-intro-empty="">
              It would show nothing as it stands. Press Change to fix it first.
            </li>
          )}
        </ul>
      )}
      {!isPhone && <FocusTip />}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="button" onClick={notNow} className={`${RESET_LINK} ${TAP}`} data-focus-intro-not-now="">
          Not now
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            onChange();
          }}
          className={`${RESET_LINK} ${TAP}`}
          data-focus-intro-change=""
        >
          Change
        </button>
        <button
          type="button"
          disabled={empty}
          data-autofocus=""
          onClick={() => {
            close();
            scope.adoptLink(proposal);
          }}
          className={`ml-auto rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-rb-300 disabled:text-rb-600 dark:disabled:bg-rb-700 dark:disabled:text-rb-400 ${TAP}`}
          data-focus-intro-use=""
        >
          Use this view
        </button>
      </div>
    </div>
  );

  if (isPhone)
    return (
      <div data-focus-intro="" data-anatomy="H22">
        <MobileSheet label="Focus mode" onClose={notNow} header={<MobileSheetFilterHeader label="Focus mode" />}>
          {body}
        </MobileSheet>
      </div>
    );

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)]" data-focus-intro="" data-anatomy="H22">
      <div className={`absolute inset-0 ${PAGE_SCRIM}`} onClick={notNow} aria-hidden="true" />
      <ModalFrame labelledBy="focus-intro-title" className="top-24 w-[28rem] gap-3 p-5">
        <div className="flex items-center gap-2">
          <ListFilter className="size-4 text-rb-500" aria-hidden="true" />
          <h2 id="focus-intro-title" className="text-sm font-bold text-foreground">
            Focus mode
          </h2>
        </div>
        {body}
      </ModalFrame>
    </div>,
    document.body,
  );
}

/** A centred modal panel that takes focus, keeps Tab inside and locks the page's scroll. */
function ModalFrame({
  labelledBy,
  label,
  className,
  children,
}: {
  labelledBy?: string;
  label?: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={label}
      tabIndex={-1}
      className={`overlay-panel absolute left-1/2 flex max-h-[calc(100dvh-7rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col overflow-y-auto focus:outline-none ${className}`}
    >
      {children}
    </div>
  );
}

/** Where Focus lives once the dialog closes: the profile control, drawn small. */
function FocusTip() {
  const bookmarks = useBookmarks();
  const face = bookmarks == null ? null : (bookmarks[0]?.addresses[0] ?? SAMPLE_WALLET);
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-rb-200 px-3 py-2.5 text-xs text-rb-500 dark:border-rb-800"
      data-focus-intro-tip=""
    >
      <Lightbulb className="size-4 shrink-0 text-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-snug">
        <span className="font-semibold text-foreground">Tip</span> Change or turn off Focus from the menu at the top
        right
      </p>
      <span className="shrink-0 rounded-md bg-rb-100 p-1.5 dark:bg-rb-800" aria-hidden="true">
        <FocusAvatar face={face} size={18} />
      </span>
    </div>
  );
}

/** Why Focus hides an explorer; null where it shows. */
export function explorerWhy(
  entry: { label: string; chainId: number },
  status: ExplorerStatus,
  keys: Set<string>,
): { why: string; kind: "chain" | "none" | "unknown" } | null {
  if (status === "lists") return null;
  const chain = CHAINS[entry.chainId as ChainId];
  const onChain = [...keys].some((k) => k.startsWith(`${entry.chainId}:`));
  if (!onChain) return { why: `None of your assets is on ${chain.name}`, kind: "chain" };
  return status === "none"
    ? { why: `${entry.label} lists none of your assets`, kind: "none" }
    : { why: `Rails has no asset list for ${entry.label} yet`, kind: "unknown" };
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`inline-flex shrink-0 items-center gap-2 text-xs text-rb-500 hover:text-foreground ${TAP}`}
      data-asset-scope-built-on={on}
    >
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${
          on ? "bg-teal-500" : "bg-rb-300 dark:bg-rb-700"
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 size-3 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

const ADDS_SHOWN = 5;
/** The pick list scrolls past this many. */
const PICKS_BEFORE_SCROLL = 6;

/** The one place the name is spelled out. */
const PANEL_TITLE = "Focus";

function PickRow({
  pick,
  chainFocus,
  onChange,
  onRemove,
}: {
  pick: AssetPick;
  chainFocus: boolean;
  onChange: (p: AssetPick) => void;
  onRemove: () => void;
}) {
  const adds = useMemo(() => builtOnSymbols(pick).map(familyDisplaySymbol), [pick]);
  const sym = symbolOf(pick);
  return (
    <li className="flex items-center gap-2 py-1.5" data-asset-scope-pick={`${pick.chain}:${pick.token}`}>
      <TokenChipIcon symbol={sym} address={pick.token} size={18} filterable={false} untitled />
      <span className="min-w-0 truncate text-sm font-semibold text-foreground">{sym}</span>
      {/* Under chain focus the pick stands for its asset on the focused chains. */}
      {!chainFocus && <span className="shrink-0 text-[11px] text-rb-500">{chainName(pick.chain)}</span>}
      <span
        className="ml-auto shrink-0"
        title={
          pick.builtOn
            ? adds.length
              ? `Adds ${adds.slice(0, ADDS_SHOWN).join(", ")}${adds.length > ADDS_SHOWN ? ` and ${adds.length - ADDS_SHOWN} more` : ""}`
              : "Nothing in the family map is built on it yet."
            : undefined
        }
        data-asset-scope-adds={pick.builtOn ? adds.length : undefined}
      >
        <Switch on={pick.builtOn} onChange={(builtOn) => onChange({ ...pick, builtOn })} label="Built on it" />
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${sym} on ${chainName(pick.chain)}`}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-rb-500 transition-colors hover:bg-rb-100 hover:text-foreground sm:size-6 dark:hover:bg-rb-800"
      >
        <X className="size-3.5" strokeWidth={2.5} />
      </button>
    </li>
  );
}

/** The panel's Chains part: one press per launched chain, pressed is in
 *  focus, none pressed is every chain. Under it, where the focus holds
 *  nothing on a chain, and where Rails cannot say. */
function FocusChains({ draft, setChains }: { draft: Focus; setChains: (next: number[]) => void }) {
  const judged = useFocusMisses(draft);
  const chains = launchedChains().map((c) => c.id);
  const toggle = (id: number) =>
    setChains(
      draft.chains.includes(id)
        ? draft.chains.filter((c) => c !== id)
        : chains.filter((c) => c === id || draft.chains.includes(c)),
    );
  return (
    <div className="flex flex-col gap-2 border-t border-rb-200 pt-3 dark:border-rb-800" data-focus-chains="">
      <h3 className={OVERLAY_HEADING}>Chains</h3>
      <div className="-ml-2 flex flex-wrap items-center gap-1" role="group" aria-label="Chains in focus">
        {chains.map((id) => {
          const on = draft.chains.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(id)}
              className={`${segmentClass(on)} ${TAP}`}
              data-focus-chain={id}
            >
              <ChainGlyph chainId={id} className="h-3.5 w-3.5" />
              {chainNameOf(id)}
            </button>
          );
        })}
      </div>
      {!draft.chains.length && <p className="text-[11px] text-rb-500">None chosen is every chain.</p>}
      {judged && judged.misses.length > 0 && (
        <ul className="text-[11px] leading-snug text-foreground" data-focus-chain-miss={judged.misses.length}>
          {judged.misses.map((m) => (
            <li key={m.text} data-miss-kind={m.kind}>
              {m.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A list that scrolls past `scrollAfter` rows, its bottom edge fading while
 *  more is below (a mask, so it reads on any ground). */
function FadeList({
  count,
  scrollAfter,
  children,
  ...data
}: {
  count: number;
  scrollAfter?: number;
  children: ReactNode;
  [data: `data-${string}`]: unknown;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [more, setMore] = useState(false);
  const scrolls = scrollAfter != null && count > scrollAfter;
  const measure = () => {
    const el = ref.current;
    setMore(!!el && el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  };
  useEffect(measure, [count]);
  return (
    <ul
      ref={ref}
      onScroll={scrolls ? measure : undefined}
      className={`divide-y divide-rb-200 dark:divide-rb-800 ${scrolls ? "overflow-y-auto pr-1" : ""} ${
        scrolls && more ? "[mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]" : ""
      }`}
      style={scrolls ? { maxHeight: `${scrollAfter * 2.6}rem` } : undefined}
      data-fade-more={scrolls && more ? "" : undefined}
      {...data}
    >
      {children}
    </ul>
  );
}

const keyOf = (p: Pick<AssetPick, "chain" | "token">) => optionKey({ chain: p.chain, address: p.token });

/**
 * The panel. It edits a draft: in "edit" mode the view in use, written
 * through as the draft changes (emptied, the view is removed and Focus is
 * off; the draft and its name stay, and the next pick saves a view again);
 * in "new" mode nothing is saved until the draft holds something, and then it
 * is a new view, put in use; in "link" mode a link's proposal, saved only by
 * "Use this view". /saved-views makes a new view in a row of its Focus
 * table instead (`NewFocusRow`, components/shared/bookmark-list.tsx).
 */
function AssetScopePanel({
  mode: initial,
  view,
  proposal,
  onClose,
}: {
  mode: PanelMode;
  /** The saved view "edit" opens on; the view in use when absent. */
  view?: string;
  proposal?: FocusProposal;
  onClose: () => void;
}) {
  const scope = useAssetScope();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [copied, setCopied] = useState(false);
  // Read from the store: the scope hook is not hydrated on this first render.
  const [target] = useState(() => (initial === "edit" ? focusViews.find(view) : null));
  const [mode] = useState<PanelMode>(initial === "edit" && !target ? "new" : initial);
  const [viewId, setViewId] = useState<string | null>(target?.id ?? null);
  const [draft, setDraft] = useState<Focus>(() =>
    mode === "link" && proposal
      ? proposal.focus
      : target
        ? { assets: target.assets, chains: target.chains }
        : { assets: [], chains: [] },
  );
  const [name, setName] = useState<string>((mode === "link" ? proposal?.name : target?.name) ?? "");
  const linkMode = mode === "link";

  // A link's proposal closed without a choice is "Not now".
  const close = linkMode
    ? () => {
        scope.dismissLink();
        onClose();
      }
    : onClose;

  useEffect(() => {
    if (isPhone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const commit = (next: Focus) => {
    const f = { assets: next.assets.map(withRecord), chains: next.chains };
    setDraft(f);
    if (linkMode) return;
    const holds = f.assets.length > 0 || f.chains.length > 0;
    if (viewId && scope.views.some((v) => v.id === viewId)) {
      focusViews.edit(viewId, f);
      if (!holds) setViewId(null);
    } else if (holds) setViewId(focusViews.add(f, name));
  };
  const setPicks = (assets: AssetPick[]) => commit({ ...draft, assets });
  const setChains = (chains: number[]) => commit({ ...draft, chains });
  const rename = (v: string) => {
    if (!linkMode && viewId) focusViews.rename(viewId, v);
  };

  const choose = (keys: string[]) => {
    const now = new Map(draft.assets.map((p) => [keyOf(p), p]));
    setPicks(
      keys.map((k) => {
        const had = now.get(k);
        if (had) return had;
        const [chain, token] = k.split(":");
        return { chain: Number(chain), token, builtOn: true };
      }),
    );
  };

  const holds = draft.assets.length > 0 || draft.chains.length > 0;
  const judged = useFocusMisses(draft);
  const empty = !!judged?.empty;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(scopeLink(draft.assets, draft.chains, name.trim() || undefined));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const body = (
    <div className="flex flex-col gap-3 px-4 pb-4" data-asset-scope-panel={mode}>
      <label className="flex flex-col gap-1" data-focus-view-name="">
        <span className={OVERLAY_HEADING}>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => rename(name)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              rename(name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder={focusName(draft.assets, draft.chains)}
          maxLength={60}
          className="rounded-md border border-rb-300 bg-raised px-2 py-1 text-base font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-rb-500 focus:border-teal-500 sm:text-sm dark:border-rb-700"
        />
      </label>
      <p className="text-xs leading-relaxed text-rb-500">
        {linkMode
          ? "This focus came with a link. Nothing is saved until you use it."
          : "Rails shows only what holds, lends or is built on these assets, on these chains."}
      </p>
      <h3 className={OVERLAY_HEADING}>Assets</h3>
      {draft.assets.length > 0 && (
        <FadeList
          count={draft.assets.length}
          scrollAfter={PICKS_BEFORE_SCROLL}
          data-asset-scope-picks={draft.assets.length}
        >
          {draft.assets.map((p) => (
            <PickRow
              key={keyOf(p)}
              pick={p}
              chainFocus={draft.chains.length > 0}
              onChange={(next) => setPicks(draft.assets.map((q) => (keyOf(q) === keyOf(p) ? next : q)))}
              onRemove={() => setPicks(draft.assets.filter((q) => keyOf(q) !== keyOf(p)))}
            />
          ))}
        </FadeList>
      )}
      <AssetChooser
        options={FOCUS_OPTIONS}
        selected={draft.assets.map(keyOf)}
        onChange={choose}
        label="Add an asset"
        addLabel="Add an asset"
        topLabel="Most built on"
        countNoun={null}
        pills={false}
        chainName={chainName}
        anatomy={undefined}
      />
      {!linkMode && (
        <Link
          href={manageHref()}
          onClick={onClose}
          className={`self-start text-xs font-semibold ${FOOT_LINK}`}
          data-asset-scope-manage=""
        >
          Add from all assets
        </Link>
      )}
      <FocusChains draft={draft} setChains={setChains} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rb-200 pt-3 dark:border-rb-800">
        {!linkMode && viewId && holds && scope.active?.id === viewId && (
          <button
            type="button"
            onClick={() => {
              scope.clear();
              onClose();
            }}
            className={`${RESET_LINK} ${TAP}`}
            data-asset-scope-panel-clear=""
          >
            Turn off
          </button>
        )}
        {holds && (
          <button
            type="button"
            onClick={copy}
            className={`inline-flex items-center gap-1 text-xs font-semibold text-rb-500 hover:text-foreground ${TAP}`}
            data-asset-scope-copy=""
          >
            {copied ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Link2 className="size-3.5" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy link"}
          </button>
        )}
        {linkMode ? (
          <>
            <button
              type="button"
              onClick={close}
              className={`ml-auto ${RESET_LINK} ${TAP}`}
              data-asset-scope-not-now=""
            >
              Not now
            </button>
            <button
              type="button"
              disabled={!holds || empty}
              onClick={() => {
                scope.adoptLink({ focus: draft, name: name.trim() || null });
                onClose();
              }}
              className={`rounded-md bg-teal-600 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-rb-300 disabled:text-rb-600 dark:disabled:bg-rb-700 dark:disabled:text-rb-400 ${TAP}`}
              data-asset-scope-use=""
            >
              Use this view
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className={`ml-auto rounded-md bg-rb-100 px-3 py-1 text-xs font-semibold text-foreground hover:bg-rb-200 dark:bg-rb-800 dark:hover:bg-rb-700 ${TAP}`}
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );

  const title = linkMode ? "Focus from a link" : !viewId ? "New focus" : PANEL_TITLE;

  if (isPhone)
    return (
      <MobileSheet label={title} onClose={close} header={<MobileSheetFilterHeader label={title} />}>
        {body}
      </MobileSheet>
    );

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)]" data-asset-scope-dialog="">
      <div className={`absolute inset-0 ${PAGE_SCRIM}`} onClick={close} aria-hidden="true" />
      <ModalFrame label={title} className="top-20 w-[26rem]">
        <div className="flex items-center justify-between px-4 py-3">
          <span className={OVERLAY_HEADING}>{title}</span>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="inline-flex size-6 items-center justify-center rounded-full text-rb-500 hover:bg-rb-100 hover:text-foreground dark:hover:bg-rb-800"
          >
            <X className="size-3.5" />
          </button>
        </div>
        {body}
      </ModalFrame>
    </div>,
    document.body,
  );
}

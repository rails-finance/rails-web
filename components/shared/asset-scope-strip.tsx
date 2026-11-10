"use client";

// Focus mode (ui-jobs 557): its panel and its arrival dialog. Focus shows on
// the profile control (components/shared/focus-avatar.tsx), and its menu opens
// with a Focus section (Miles, 10 Nov 2026). The strip that ran across the top
// of every page is kept here unshown (SHOW_STRIP) for comparison. The ways in
// are "Focus" in the profile menu (H20), which opens the panel
// (OPEN_SCOPE_PANEL), and the Focus button on a token or chain row of the
// search's dropdown (components/shared/aim-search-button.tsx).
//
// The panel has two parts. Assets: each chosen asset with one switch, "And
// what's built on it", added through AssetChooser. Chains: one press per
// chain; none pressed is every chain, and a focused chain where an asset is
// not listed says so. Arriving on `?assets=` / `?chains=`, a dialog says what
// Focus mode is and what the link set it to (FocusLinkIntro), and the strip's
// "Keep this focus" (in the dialog and the profile menu) stores the link's
// focus in this browser.
//
// On an explorer's own pages the strip carries one more line where the
// explorer is one the preference hides (lib/shared/explorer-scope.ts): its
// chain holds none of the reader's assets, or it lists none of them, or Rails
// has no asset list for it. The page itself still opens whole.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { protocolForPathname } from "@/lib/shared/protocols";
import { CHAINS } from "@/lib/shared/chains";
import { useExplorerScope } from "@/lib/shared/explorer-scope";
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
import { focusShort } from "@/components/shared/aim-gate";
import { useListedOn } from "@/lib/shared/explorer-scope";
import { launchedChains } from "@/lib/shared/protocols";
import type { ChainId } from "@/lib/shared/chains";
import { builtOnSymbols, FAMILY_ROWS, familyOf } from "@/lib/shared/asset-family";
import {
  chainNameOf,
  effectivePicks,
  OPEN_SCOPE_PANEL,
  SCOPE_CHAINS,
  SCOPE_TOKENS,
  scopeLink,
  scopeSymbolOf,
  useAssetScope,
  type AssetPick,
  manageHref,
} from "@/lib/shared/asset-scope";
import { INLINE_LINK, INPLACE_TEXT, OVERLAY_HEADING, PAGE_LINK, PAGE_SCRIM, RESET_LINK } from "@/lib/shared/ui-grammar";

/** The strip across the top of every page, replaced by the profile control's
 *  ring and badge (Miles, 10 Nov 2026); kept for a side-by-side. */
const SHOW_STRIP = false as boolean;

const chainName = (c: number) => SCOPE_CHAINS[c] ?? `chain ${c}`;
const symbolOf = (p: Pick<AssetPick, "chain" | "token">) =>
  scopeSymbolOf(p.chain, p.token) ?? `${p.token.slice(0, 6)}…${p.token.slice(-4)}`;

/** "WETH, BOLD +2 and what's built on them": the chosen symbols, each once. */
export function scopeSummary(picks: AssetPick[]): string {
  const names = [...new Set(picks.map(symbolOf))];
  const named = names.slice(0, 2).join(", ");
  const more = names.length > 2 ? ` +${names.length - 2}` : "";
  const built = picks.filter((p) => p.builtOn).length;
  const tail =
    built === 0 || names.length > 2
      ? ""
      : built === picks.length
        ? names.length === 1
          ? " and what's built on it"
          : " and what's built on them"
        : "";
  return `${named}${more}${tail}`;
}

// Ordered by how much is built on each (BOLD, ETH and BTC first), the
// count not drawn.
const OPTIONS: AssetChooserOption[] = SCOPE_TOKENS.map((t) => ({
  address: t.token,
  chain: t.chain,
  symbol: t.symbol,
  count: familyOf([{ chain: t.chain, token: t.token, builtOn: true }]).size,
}));

export function AssetScopeStrip({ column = "app" }: { column?: "app" | "site" }) {
  const scope = useAssetScope();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SCOPE_PANEL, show);
    return () => window.removeEventListener(OPEN_SCOPE_PANEL, show);
  }, []);
  const on = scope.on && SHOW_STRIP;

  return (
    <>
      {on && (
        <div
          // The app column's main pulls up 17px from md; the margin gives it back.
          className={`border-b border-rb-200 bg-rb-100/60 dark:border-rb-800 dark:bg-rb-900/60 ${column === "app" ? "md:mb-[17px]" : ""}`}
          data-asset-scope-strip={scope.fromLink ? "link" : "stored"}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5 text-xs md:px-6">
            <span className="min-w-0 text-foreground" title={focusTitle(scope.picks, scope.chains)} data-focus-label="">
              <ListFilter className="mr-1.5 inline size-3.5 align-[-2px] text-rb-500" aria-hidden="true" />
              {isPhone ? (
                <>
                  <span className="text-rb-600 dark:text-rb-400">Focus:</span>{" "}
                  <span className="font-semibold">{focusShort(scope.picks, scope.chains)}</span>
                </>
              ) : (
                <>
                  <span className="text-rb-600 dark:text-rb-400">Focus mode active:</span>{" "}
                  <FocusWords picks={scope.picks} chains={scope.chains} />
                </>
              )}
            </span>
            {/* On a phone the presses take their own line, with no dot leading it. */}
            {isPhone ? (
              <span className="basis-full" aria-hidden="true" />
            ) : (
              <span className="text-rb-500" aria-hidden="true">
                ·
              </span>
            )}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`font-semibold ${INPLACE_TEXT}`}
              data-asset-scope-change=""
            >
              Change
            </button>
            {scope.fromLink && (
              <>
                <span className="text-rb-500" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  onClick={scope.keepLink}
                  className={`font-semibold ${INPLACE_TEXT}`}
                  data-asset-scope-keep=""
                >
                  Keep this focus
                </button>
              </>
            )}
            <span className="text-rb-500" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={scope.clear}
              className={`font-semibold ${INPLACE_TEXT}`}
              data-asset-scope-clear=""
            >
              Show everything
            </button>
          </div>
          <ExplorerScopeLine keys={scope.keys} />
        </div>
      )}
      {open && <AssetScopePanel onClose={() => setOpen(false)} />}
      {scope.fromLink && !open && <FocusLinkIntro onChange={() => setOpen(true)} />}
    </>
  );
}

/** "BOLD on Ethereum; Base": every pick and chain, for the strip's title. */
function focusTitle(picks: AssetPick[], chains: number[]): string {
  const a = picks.map((p) => `${symbolOf(p)} on ${chainName(p.chain)}`).join(", ");
  const c = chains.map(chainNameOf).join(", ");
  return [a, c && `chains: ${c}`].filter(Boolean).join("; ");
}

/** The chains in prose, each with its mark: "Ethereum and Base". */
function ChainWords({ chains, size = "size-3" }: { chains: number[]; size?: string }) {
  return (
    <>
      {chains.map((c, i) => (
        <span key={c}>
          {i > 0 && (i === chains.length - 1 ? " and " : ", ")}
          <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-foreground">
            <ChainGlyph chainId={c as ChainId} className={size} />
            {chainNameOf(c)}
          </span>
        </span>
      ))}
    </>
  );
}

/** The strip's words: "[icons] BOLD and what's built on it, on [mark] Ethereum"; "[mark] Base". */
export function FocusWords({ picks, chains }: { picks: AssetPick[]; chains: number[] }) {
  if (!picks.length) return <ChainWords chains={chains} />;
  return (
    <>
      <PickIcons picks={picks} />
      <span className="font-semibold">{scopeSummary(picks)}</span>
      {chains.length > 0 && (
        <>
          {", on "}
          <ChainWords chains={chains} />
        </>
      )}
    </>
  );
}

/** The first two picks' icons, inline before the summary. */
function PickIcons({ picks }: { picks: AssetPick[] }) {
  const shown = [...new Map(picks.map((p) => [symbolOf(p), p])).values()].slice(0, 2);
  return (
    <span className="mr-1 inline-flex -space-x-1 align-[-3px]" aria-hidden="true">
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

const EXAMPLES_SHOWN = 3;

/**
 * A few of what the picks add, taken in turn from each pick, each pick's
 * ordered by how much is built on it in turn, then rate tokens before vaults
 * (sBOLD and yBOLD before a one-off vault, wstETH before a WETH vault).
 */
function examplesOf(picks: AssetPick[]): string[] {
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
  for (let i = 0; out.size < EXAMPLES_SHOWN && lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length && out.size < EXAMPLES_SHOWN) out.add(l[i]);
  return [...out];
}

/** "sBOLD, yBOLD and ysyBOLD": a list in prose. */
const andList = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/**
 * Arriving on a `?assets=` link: what Focus mode is and what this view is set
 * to, once per link per tab (sessionStorage; without it, every load).
 */
function FocusLinkIntro({ onChange }: { onChange: () => void }) {
  const scope = useAssetScope();
  const sp = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const linkValue = `${sp?.get("assets") ?? ""}|${sp?.get("chains") ?? ""}`;
  const seenKey = `rails-focus-intro:${linkValue}`;
  const [shown, setShown] = useState(() => {
    try {
      return sessionStorage.getItem(seenKey) == null;
    } catch {
      return true;
    }
  });
  const close = () => {
    try {
      sessionStorage.setItem(seenKey, "1");
    } catch {}
    setShown(false);
  };
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  if (!shown) return null;

  const picks = [...new Map(scope.picks.map((p) => [symbolOf(p), p])).values()];
  const examples = examplesOf(scope.picks);
  const builtOn = scope.picks.some((p) => p.builtOn);
  const one = picks.length === 1;
  const chains = scope.chains;
  const onChains = chains.length > 0 && (
    <>
      {picks.length ? " on " : ""}
      <ChainWords chains={chains} size="size-3.5" />
    </>
  );
  const chainsTail = chains.length ? `, on ${chains.map(chainNameOf).join(" and ")}` : "";

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)]" data-focus-intro="">
      <div className={`absolute inset-0 ${PAGE_SCRIM}`} onClick={close} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-intro-title"
        className="overlay-panel absolute left-1/2 top-24 flex w-[28rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-3 p-5"
      >
        <div className="flex items-center gap-2">
          <ListFilter className="size-4 text-rb-500" aria-hidden="true" />
          <h2 id="focus-intro-title" className="text-sm font-bold text-foreground">
            Focus mode
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-rb-600 dark:text-rb-300">
          Focus mode isolates the Rails app to the assets and chains you choose. This view is set to focus on{" "}
          {picks.slice(0, NAMED_SHOWN).map((p, i, shown) => (
            <span key={`${p.chain}:${p.token}`}>
              {i > 0 && (i === shown.length - 1 && picks.length <= NAMED_SHOWN ? " and " : ", ")}
              <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-foreground">
                <TokenChipIcon symbol={symbolOf(p)} address={p.token} size={16} filterable={false} untitled />
                {symbolOf(p)}
              </span>
            </span>
          ))}
          {picks.length > NAMED_SHOWN && ` and ${picks.length - NAMED_SHOWN} more`}
          {onChains}
          {builtOn &&
            (examples.length
              ? `, with assets built on ${one ? "it" : "them"} such as ${andList(examples)}`
              : `, with assets built on ${one ? "it" : "them"}`)}
          .
        </p>
        <p className="text-xs leading-relaxed text-rb-500">
          {picks.length
            ? `Lists, explorers, chains and search show only what holds, lends or is built on ${one ? "it" : "them"}${chainsTail}.`
            : `Lists, explorers and search show only what is on ${chains.map(chainNameOf).join(" and ")}.`}
        </p>
        <FocusTip />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => {
              close();
              scope.clear();
            }}
            className={RESET_LINK}
            data-focus-intro-clear=""
          >
            Show everything
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              onChange();
            }}
            className={RESET_LINK}
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              scope.keepLink();
            }}
            className={RESET_LINK}
            data-focus-intro-keep=""
          >
            Keep this focus
          </button>
          <button
            type="button"
            onClick={close}
            className="ml-auto rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
            data-focus-intro-continue=""
          >
            Continue in focus
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Where Focus lives once the dialog closes: the profile control, drawn small. */
function FocusTip() {
  const bookmarks = useBookmarks();
  const face = bookmarks == null ? null : (bookmarks[0]?.addresses[0] ?? SAMPLE_WALLET);
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-teal-600/30 px-3 py-2.5 text-xs text-rb-500"
      data-focus-intro-tip=""
    >
      <Lightbulb className="size-4 shrink-0 text-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-snug">
        <span className="font-semibold text-foreground">Tip</span> Change or end{" "}
        <span className="font-semibold text-foreground">Focus mode</span> from the menu at the top right
      </p>
      <span className="shrink-0 rounded-md bg-rb-100 p-1.5 dark:bg-rb-800" aria-hidden="true">
        <FocusAvatar face={face} size={18} />
      </span>
    </div>
  );
}

/** Why the preference hides the explorer this page belongs to; nothing where it shows. */
export function ExplorerScopeLine({
  keys,
  className = "mx-auto max-w-7xl px-4 pb-1.5 text-xs text-rb-500 md:px-6",
  onLeave,
}: {
  keys: Set<string> | null;
  className?: string;
  /** Called as the link is followed (the menu closes). */
  onLeave?: () => void;
}) {
  const entry = protocolForPathname(usePathname());
  const ex = useExplorerScope();
  if (!entry || !keys || !ex.on) return null;
  const status = ex.statusOf(entry.id);
  if (status === "lists") return null;
  const chain = CHAINS[entry.chainId];
  const onChain = [...keys].some((k) => k.startsWith(`${entry.chainId}:`));
  const why = !onChain
    ? `None of your assets is on ${chain.name}`
    : status === "none"
      ? `${entry.label} lists none of your assets`
      : `Rails has no asset list for ${entry.label} yet`;
  return (
    <p className={className} data-explorer-scope={!onChain ? "chain" : status}>
      {why} ·{" "}
      <Link href={manageHref(false)} onClick={onLeave} className={`font-semibold ${INLINE_LINK}`}>
        Where your assets are listed
      </Link>
    </p>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="inline-flex shrink-0 items-center gap-2 text-xs text-rb-500 hover:text-foreground"
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
/** The dialog names this many picks, then "and N more". */
const NAMED_SHOWN = 3;

/** The one place the name is spelled out. */
const PANEL_TITLE = "Focus";

function PickRow({
  pick,
  onChange,
  onRemove,
}: {
  pick: AssetPick;
  onChange: (p: AssetPick) => void;
  onRemove: () => void;
}) {
  const adds = useMemo(() => builtOnSymbols(pick), [pick]);
  const sym = symbolOf(pick);
  const chainFocus = useAssetScope().chains.length > 0;
  return (
    <li className="flex items-center gap-2 py-1.5" data-asset-scope-pick={`${pick.chain}:${pick.token}`}>
      <TokenChipIcon symbol={sym} address={pick.token} size={18} filterable={false} untitled />
      <span className="min-w-0 truncate text-sm font-semibold text-foreground">{sym}</span>
      {/* Under chain focus the pick stands for its symbol on the focused chains. */}
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
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-rb-500 transition-colors hover:bg-teal-500/15 hover:text-teal-600 dark:hover:text-teal-400"
      >
        <X className="size-3.5" strokeWidth={2.5} />
      </button>
    </li>
  );
}

/** The panel's Chains part: one press per launched chain, pressed is in
 *  focus, none pressed is every chain. Under it, each focused chain where a
 *  picked asset is not listed ("BOLD isn't listed on Arbitrum"), judged by the
 *  explorer index (lib/shared/explorer-scope.ts). */
function FocusChains() {
  const scope = useAssetScope();
  const listedOn = useListedOn();
  const chains = launchedChains().map((c) => c.id);
  const toggle = (id: number) =>
    scope.setChains(
      scope.chains.includes(id)
        ? scope.chains.filter((c) => c !== id)
        : chains.filter((c) => c === id || scope.chains.includes(c)),
    );
  const misses: string[] = [];
  if (listedOn)
    for (const p of [...new Map(scope.picks.map((q) => [symbolOf(q), q])).values()])
      for (const c of scope.chains) {
        const sameSymbol = scope.picks.filter((q) => symbolOf(q) === symbolOf(p));
        const keys = familyOf(effectivePicks(sameSymbol, [c]));
        const onChain = new Set([...keys].filter((k) => k.startsWith(`${c}:`)));
        if (!listedOn(onChain, c)) misses.push(`${symbolOf(p)} isn't listed on ${chainNameOf(c)}`);
      }
  return (
    <div className="flex flex-col gap-2 border-t border-rb-200 pt-3 dark:border-rb-800" data-focus-chains="">
      <h3 className={OVERLAY_HEADING}>Chains</h3>
      <div className="-ml-2 flex flex-wrap items-center gap-1" role="group" aria-label="Chains in focus">
        {chains.map((id) => {
          const on = scope.chains.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(id)}
              className={segmentClass(on)}
              data-focus-chain={id}
            >
              <ChainGlyph chainId={id} className="h-3.5 w-3.5" />
              {chainNameOf(id)}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-rb-500">
        {scope.chains.length ? "Only the chosen chains show." : "Every chain shows while none is chosen."}
      </p>
      {misses.length > 0 && (
        <ul className="text-[11px] leading-snug text-foreground" data-focus-chain-miss={misses.length}>
          {misses.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The panel's picks: past PICKS_BEFORE_SCROLL they scroll, and the list's
 *  bottom edge fades while more is below (a mask, so it reads on any ground). */
function PicksList({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [more, setMore] = useState(false);
  const scrolls = count > PICKS_BEFORE_SCROLL;
  const measure = () => {
    const el = ref.current;
    setMore(!!el && el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  };
  useEffect(measure, [count]);
  return (
    <ul
      ref={ref}
      onScroll={scrolls ? measure : undefined}
      className={`divide-y divide-rb-200 dark:divide-rb-800 ${scrolls ? "max-h-[15.5rem] overflow-y-auto pr-1" : ""} ${
        scrolls && more ? "[mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]" : ""
      }`}
      data-asset-scope-picks={count}
      data-asset-scope-picks-more={scrolls && more ? "" : undefined}
    >
      {children}
    </ul>
  );
}

function AssetScopePanel({ onClose }: { onClose: () => void }) {
  const scope = useAssetScope();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [copied, setCopied] = useState(false);
  const picks = scope.picks;
  const keyOf = (p: Pick<AssetPick, "chain" | "token">) => optionKey({ chain: p.chain, address: p.token });

  useEffect(() => {
    if (isPhone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isPhone, onClose]);

  const choose = (keys: string[]) => {
    const now = new Map(picks.map((p) => [keyOf(p), p]));
    scope.setPicks(
      keys.map((k) => {
        const had = now.get(k);
        if (had) return had;
        const [chain, token] = k.split(":");
        return { chain: Number(chain), token, builtOn: true };
      }),
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(scopeLink(picks, scope.chains));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const body = (
    <div className="flex flex-col gap-3 px-4 pb-4" data-asset-scope-panel="">
      <p className="text-xs leading-relaxed text-rb-500">
        {scope.fromLink
          ? "This focus came with the link and applies to this view. Keep it to see every page this way."
          : "Rails shows only what holds, lends or is built on these assets, on these chains. Kept in this browser."}
      </p>
      <h3 className={OVERLAY_HEADING}>Assets</h3>
      {picks.length > 0 && (
        <PicksList count={picks.length}>
          {picks.map((p) => (
            <PickRow
              key={keyOf(p)}
              pick={p}
              onChange={(next) => scope.setPicks(picks.map((q) => (keyOf(q) === keyOf(p) ? next : q)))}
              onRemove={() => scope.setPicks(picks.filter((q) => keyOf(q) !== keyOf(p)))}
            />
          ))}
        </PicksList>
      )}
      <AssetChooser
        options={OPTIONS}
        selected={picks.map(keyOf)}
        onChange={choose}
        label="Add an asset"
        addLabel="Add an asset"
        topLabel="Most built on"
        countNoun={null}
        pills={false}
        chainName={chainName}
        anatomy={undefined}
      />
      <Link
        href={manageHref()}
        onClick={onClose}
        className={`self-start text-xs ${PAGE_LINK}`}
        data-asset-scope-manage=""
      >
        Add from all assets <span aria-hidden>→</span>
      </Link>
      <FocusChains />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rb-200 pt-3 dark:border-rb-800">
        {scope.on && (
          <>
            <button
              type="button"
              onClick={() => {
                scope.clear();
                onClose();
              }}
              className={RESET_LINK}
              data-asset-scope-panel-clear=""
            >
              Show everything
            </button>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 text-xs font-semibold text-rb-500 hover:text-foreground"
              data-asset-scope-copy=""
            >
              {copied ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Link2 className="size-3.5" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy a link to this view"}
            </button>
          </>
        )}
        {scope.fromLink && (
          <button type="button" onClick={scope.keepLink} className={RESET_LINK}>
            Keep in this browser
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md bg-rb-100 px-3 py-1 text-xs font-semibold text-foreground hover:bg-rb-200 dark:bg-rb-800 dark:hover:bg-rb-700"
        >
          Done
        </button>
      </div>
    </div>
  );

  if (isPhone)
    return (
      <MobileSheet label={PANEL_TITLE} onClose={onClose} header={<MobileSheetFilterHeader label={PANEL_TITLE} />}>
        {body}
      </MobileSheet>
    );

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)]" data-asset-scope-dialog="">
      <div className={`absolute inset-0 ${PAGE_SCRIM}`} onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={PANEL_TITLE}
        className="overlay-panel absolute left-1/2 top-20 flex w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <span className={OVERLAY_HEADING}>{PANEL_TITLE}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-6 items-center justify-center rounded-full text-rb-500 hover:bg-rb-100 hover:text-foreground dark:hover:bg-rb-800"
          >
            <X className="size-3.5" />
          </button>
        </div>
        {body}
      </div>
    </div>,
    document.body,
  );
}

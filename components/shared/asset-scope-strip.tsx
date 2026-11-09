"use client";

// The asset preference's chip and panel (ui-jobs 557). With the preference on,
// a strip across the top of the app column on every page, at every width:
// "Showing WETH, BOLD and what's built on them · Change · Show everything".
// Off, nothing: the way in is "Your assets" in the profile menu (H20), which
// opens the same panel (OPEN_SCOPE_PANEL).
//
// The panel lists each chosen asset with one switch, "And what's built on it",
// and adds assets through AssetChooser. From `?assets=` the strip says the
// assets came with the link, and "Keep as my assets" stores them.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Link2, ListFilter, X } from "lucide-react";
import { AssetChooser, optionKey, type AssetChooserOption } from "@/components/shared/asset-chooser";
import { MobileSheet, MobileSheetFilterHeader } from "@/components/shared/mobile-sheet";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { builtOnSymbols, familyOf } from "@/lib/shared/asset-family";
import {
  OPEN_SCOPE_PANEL,
  SCOPE_CHAINS,
  SCOPE_TOKENS,
  scopeLink,
  scopeSymbolOf,
  useAssetScope,
  type AssetPick,
} from "@/lib/shared/asset-scope";
import { INPLACE_TEXT, OVERLAY_HEADING, RESET_LINK } from "@/lib/shared/ui-grammar";

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
    built === 0
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

export function AssetScopeStrip() {
  const scope = useAssetScope();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SCOPE_PANEL, show);
    return () => window.removeEventListener(OPEN_SCOPE_PANEL, show);
  }, []);
  const on = scope.picks.length > 0;

  return (
    <>
      {on && (
        <div
          className="border-b border-rb-200 bg-rb-100/60 md:mb-[17px] dark:border-rb-800 dark:bg-rb-900/60"
          data-asset-scope-strip={scope.fromLink ? "link" : "stored"}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5 text-xs md:px-6">
            <ListFilter className="size-3.5 shrink-0 text-rb-500" aria-hidden="true" />
            <span
              className="min-w-0 text-foreground"
              title={scope.picks.map((p) => `${symbolOf(p)} on ${chainName(p.chain)}`).join(", ")}
            >
              {scope.fromLink ? <span className="text-rb-500">From this link: showing </span> : "Showing "}
              <span className="font-semibold">{scopeSummary(scope.picks)}</span>
            </span>
            <span className="text-rb-500" aria-hidden="true">
              ·
            </span>
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
                  Keep as my assets
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
        </div>
      )}
      {open && <AssetScopePanel onClose={() => setOpen(false)} />}
    </>
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
  return (
    <li className="py-2" data-asset-scope-pick={`${pick.chain}:${pick.token}`}>
      <div className="flex items-center gap-2">
        <TokenChipIcon symbol={sym} address={pick.token} size={18} filterable={false} untitled />
        <span className="text-sm font-semibold text-foreground">{sym}</span>
        <span className="text-[11px] text-rb-500">{chainName(pick.chain)}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${sym} on ${chainName(pick.chain)}`}
          className="ml-auto inline-flex size-6 items-center justify-center rounded-full text-rb-500 transition-colors hover:bg-teal-500/15 hover:text-teal-600 dark:hover:text-teal-400"
        >
          <X className="size-3.5" strokeWidth={2.5} />
        </button>
      </div>
      <div className="mt-1 pl-[26px]">
        <Switch
          on={pick.builtOn}
          onChange={(builtOn) => onChange({ ...pick, builtOn })}
          label="And what's built on it"
        />
        {pick.builtOn && adds.length > 0 && (
          <p className="mt-1 text-[11px] leading-snug text-rb-500" data-asset-scope-adds={adds.length}>
            Adds {adds.slice(0, ADDS_SHOWN).join(", ")}
            {adds.length > ADDS_SHOWN && ` and ${adds.length - ADDS_SHOWN} more`}
          </p>
        )}
        {pick.builtOn && adds.length === 0 && (
          <p className="mt-1 text-[11px] text-rb-500">Nothing in the family map is built on it yet.</p>
        )}
      </div>
    </li>
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
      await navigator.clipboard.writeText(scopeLink(picks));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const body = (
    <div className="flex flex-col gap-3 px-4 pb-4" data-asset-scope-panel="">
      <p className="text-xs leading-relaxed text-rb-500">
        {scope.fromLink
          ? "These came with the link and apply to this view. Keep them to see every page this way."
          : "Lists show only what holds, lends or is built on these assets. Kept in this browser."}
      </p>
      {picks.length > 0 && (
        <ul className="divide-y divide-rb-200 dark:divide-rb-800" data-asset-scope-picks={picks.length}>
          {picks.map((p) => (
            <PickRow
              key={keyOf(p)}
              pick={p}
              onChange={(next) => scope.setPicks(picks.map((q) => (keyOf(q) === keyOf(p) ? next : q)))}
              onRemove={() => scope.setPicks(picks.filter((q) => keyOf(q) !== keyOf(p)))}
            />
          ))}
        </ul>
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rb-200 pt-3 dark:border-rb-800">
        {picks.length > 0 && (
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
            Keep as my assets
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
      <MobileSheet label="Your assets" onClose={onClose} header={<MobileSheetFilterHeader label="Your assets" />}>
        {body}
      </MobileSheet>
    );

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)]" data-asset-scope-dialog="">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Your assets"
        className="overlay-panel absolute left-1/2 top-20 flex w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <span className={OVERLAY_HEADING}>Your assets</span>
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

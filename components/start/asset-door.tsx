"use client";

// The /start asset step's cards (G9; rails-ops ui-jobs 553, door 2): nine
// of one coin's vaults in the order the reader picks, the hidden vaults'
// line with its toggle, and the link to the full index. The order and the
// toggle change this page only (teal, color-grammar.md §4c); a card opens the
// vault's page under its protocol (blue). Every word is
// lib/vaults/health-words.ts's; no card carries a verdict.

import { useState } from "react";
import Link from "next/link";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { VaultLead } from "@/components/vaults/vault-heads";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { ASSET_DOOR, type AssetOrder } from "@/lib/vaults/health-words";
import type { AssetCard } from "@/lib/start/asset-door";

const SHOWN = 9;
const CARD =
  "block h-full rounded-xl border border-rb-200 bg-raised p-4 transition-colors duration-150 hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-rb-600";
const TEAL_PRESS =
  "text-teal-600 hover:underline dark:text-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:focus-visible:ring-teal-400 rounded";
const MUTED = "text-rb-500";

/** Highest first; a card with no figure after every figure. */
const desc = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : b - a);
const asc = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b);

function order(cards: AssetCard[], o: AssetOrder): AssetCard[] {
  const out = [...cards];
  if (o === "size") out.sort((a, b) => b.held - a.held);
  // Among the largest only, as the intro says.
  if (o === "yield") out.sort((a, b) => desc(a.yearly30, b.yearly30) || b.held - a.held);
  if (o === "range") out.sort((a, b) => asc(a.range, b.range) || b.held - a.held);
  return out;
}

function Figure({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className={`text-xs ${MUTED}`}>{label}</dt>
      <dd className={`truncate tabular-nums ${value ? "text-base font-semibold text-foreground" : `text-sm ${MUTED}`}`}>
        {value ?? "—"}
      </dd>
      {sub && <dd className={`truncate text-xs ${MUTED}`}>{sub}</dd>}
    </div>
  );
}

function Card({ c }: { c: AssetCard }) {
  const w = ASSET_DOOR.card;
  return (
    <Link href={c.href} className={CARD} data-asset-card={c.key} data-asset-card-hidden={c.hidden ? "" : undefined}>
      <div className="mb-3 flex items-center gap-2.5">
        <VaultLead vault={c.vault} size={28} />
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground" title={c.name}>
            {c.name}
          </div>
          <div className={`flex items-center gap-1 text-xs ${MUTED}`}>
            <ProtocolIcon id={VAULT_FAMILIES[c.vault.family].venue} className="h-3 w-3" />
            {c.family} · {c.chain}
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Figure label={w.yield} value={c.yieldText} sub={c.rangeText} />
        <Figure label={w.size} value={c.sizeText} sub={c.changeText} />
        <Figure label={w.steward} value={c.steward?.address ?? null} sub={c.steward?.role} />
        <Figure
          label={w.withdrawals}
          value={c.withdrawals?.value ?? null}
          sub={c.withdrawals ? (c.withdrawals.sub ?? undefined) : w.notRead}
        />
      </dl>
    </Link>
  );
}

export function AssetDoorCards({
  symbol,
  cards,
  hiddenCount,
  pool,
}: {
  symbol: string;
  cards: AssetCard[];
  hiddenCount: number;
  /** How many of the largest the other orders rank among. */
  pool: number;
}) {
  const [o, setO] = useState<AssetOrder>("size");
  const [all, setAll] = useState(false);
  const candidates = all ? cards : cards.filter((c) => !c.hidden);
  const shown = order(candidates, "size").slice(0, pool);
  const drawn = order(o === "size" ? candidates : shown, o).slice(0, SHOWN);
  return (
    <div data-asset-door={symbol}>
      <div
        className="mb-2 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm"
        role="group"
        aria-label={ASSET_DOOR.orderLabel}
      >
        <span className={`mr-1 ${MUTED}`}>{ASSET_DOOR.orderLabel}</span>
        {(Object.keys(ASSET_DOOR.orders) as AssetOrder[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === o}
            onClick={() => setO(k)}
            data-asset-order={k}
            className={`rounded-md px-2 py-0.5 ${
              k === o ? "bg-rb-100 font-medium text-foreground dark:bg-rb-700" : TEAL_PRESS
            }`}
          >
            {ASSET_DOOR.orders[k]}
          </button>
        ))}
      </div>
      <p className={`mb-4 text-sm ${MUTED}`} data-asset-intro="">
        {ASSET_DOOR.intro(o, Math.min(SHOWN, drawn.length), Math.min(pool, shown.length))}
      </p>
      {drawn.length === 0 ? (
        <p className={`text-sm ${MUTED}`}>{ASSET_DOOR.none(symbol)}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {drawn.map((c) => (
            <li key={c.key}>
              <Card c={c} />
            </li>
          ))}
        </ul>
      )}
      {hiddenCount > 0 && (
        <p className={`mt-5 text-sm ${MUTED}`} data-asset-hidden={hiddenCount}>
          {all ? ASSET_DOOR.showing(hiddenCount) : ASSET_DOOR.hidden(hiddenCount)}{" "}
          <button type="button" className={TEAL_PRESS} onClick={() => setAll(!all)} aria-pressed={all}>
            {all ? ASSET_DOOR.hide : ASSET_DOOR.showAll}
          </button>
        </p>
      )}
      <p className="mt-3 text-sm">
        <Link href={`/vaults?asset=${encodeURIComponent(symbol)}`} className={INLINE_LINK} data-asset-all="">
          {ASSET_DOOR.all(symbol)}
        </Link>
        <span className={MUTED}>{ASSET_DOOR.allTail}</span>
      </p>
    </div>
  );
}

"use client";

// A stat of two or more assets (C18), read as the headline's multi-asset side
// reads (C19): its figure and icon cluster are one button that opens the
// assets in a dropdown under it (the bottom sheet on a phone), so the cell
// holds one line whatever the count. The panel's `Stat` draws it where a row
// carries a `breakdown` (components/shared/position-card-panel.tsx). The
// dropdown (`BreakdownOverlay`) is the one the headlines open too
// (components/shared/position-card.tsx).

import { useId, useRef, useState, type ReactNode } from "react";
import { QuietTipsContext } from "@/components/shared/reveal-tip";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { AnchoredPanel } from "@/components/shared/asset-popover";
import { Prov, ProvInert, type Provenance } from "@/components/shared/provenance";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { formatUsdValue } from "@/lib/utils/format";
import type { AssetMark } from "@/lib/shared/asset-mark";

/** A stat row's breakdown: the button's icons and the overlay it opens. */
export interface PanelRowBreakdown {
  /** The assets, largest first, for the button's icon cluster. */
  assets: AssetMark[];
  /** The overlay heading's exact total and its receipt, where the assets are priced. */
  total?: { usd: number; info: Provenance };
  /** The overlay's body. */
  panel: ReactNode;
}

/** "1 asset", "10 assets": the count in a C19 button's name. */
export const assetsWords = (n: number) => `${n} ${n === 1 ? "asset" : "assets"}`;

/** The C19 dropdown: anchored under its button (the bottom sheet under 640
 *  px), headed by the side's label and, where priced, its exact total with
 *  the receipt. Escape, a press outside or the sheet's close calls `onClose`. */
export function BreakdownOverlay({
  id,
  label,
  total,
  anchor,
  onClose,
  children,
}: {
  id: string;
  label: string;
  total?: { usd: number; info: Provenance };
  anchor: () => HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    // The overlay renders in a portal, but its events still pass through
    // the card's React handlers: this stops them here.
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <AnchoredPanel
        id={id}
        label={total ? `${label} ${formatUsdValue(total.usd)}` : label}
        anchor={anchor}
        onClose={onClose}
        fit={420}
        drop
        name="breakdown-panel"
        // A donut's slices grade toward the overlay's ground.
        surface="overlay"
        className="[--donut-ground:var(--surface-overlay)] max-sm:[--donut-ground:var(--surface-raised)] dark:[--donut-ground:var(--color-rb-900)]"
      >
        <p className="mb-3 flex items-baseline gap-2 pr-8 sm:pr-0" data-breakdown-heading="">
          <span className={OVERLAY_HEADING}>{label}</span>
          {total && (
            <Prov info={total.info} echo>
              <span className="text-sm font-semibold tabular-nums text-foreground">{formatUsdValue(total.usd)}</span>
            </Prov>
          )}
        </p>
        {children}
      </AnchoredPanel>
    </span>
  );
}

export function StatBreakdown({
  id,
  label,
  figure,
  breakdown: { assets, total, panel },
}: {
  /** The button's `data-stat-breakdown-toggle`: the row's id. */
  id: string;
  label: string;
  /** The figure on the button: the assets' USD total. Null: the icons alone,
   *  as a closed account's peaks read. */
  figure: ReactNode | null;
  breakdown: PanelRowBreakdown;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={(e) => {
          // The card can be a link: the press is the button's alone.
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={[
          total ? `${label} ${formatUsdValue(total.usd)}` : label,
          assetsWords(assets.length),
          "show breakdown",
        ].join(", ")}
        className={`-mx-1.5 -my-1 inline-flex max-w-full cursor-pointer flex-wrap items-center gap-x-1.5 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-rb-200/70 focus-ring dark:hover:bg-rb-700/60 ${open ? "bg-rb-200/70 dark:bg-rb-700/60" : ""}`}
        data-stat-breakdown-toggle={id}
        data-anatomy="C19"
      >
        <QuietTipsContext.Provider value={true}>
          {figure != null && <ProvInert>{figure}</ProvInert>}
          <span className="inline-flex shrink-0 items-center">
            <InlineAssetCluster assets={assets} size={16} overlap={5} />
          </span>
        </QuietTipsContext.Provider>
      </button>
      {open && (
        <BreakdownOverlay id={panelId} label={label} total={total} anchor={() => button.current} onClose={close}>
          {panel}
        </BreakdownOverlay>
      )}
    </>
  );
}

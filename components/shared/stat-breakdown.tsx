"use client";

// A stat of two or more assets (C18), read as the headline's multi-asset side
// reads (C19): its figure and icon cluster are one button that opens the
// assets in a dropdown under it (the bottom sheet on a phone), so the cell
// holds one line whatever the count. The panel's `Stat` draws it where a row
// carries a `breakdown` (components/shared/position-card-panel.tsx).

import { useId, useRef, useState, type ReactNode } from "react";
import { QuietTipsContext } from "@/components/shared/reveal-tip";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { AnchoredPanel } from "@/components/shared/asset-popover";
import { Prov, ProvInert, type Provenance } from "@/components/shared/provenance";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { formatUsdValue } from "@/lib/utils/format";

/** A stat row's breakdown: the button's icons and the overlay it opens. */
export interface PanelRowBreakdown {
  /** The assets' symbols, largest first, for the button's icon cluster. */
  symbols: string[];
  /** The overlay heading's exact total and its receipt, where the assets are priced. */
  total?: { usd: number; info: Provenance };
  /** The overlay's body. */
  panel: ReactNode;
}

export function StatBreakdown({
  id,
  label,
  figure,
  breakdown: { symbols, total, panel },
}: {
  /** The button's `data-stat-breakdown-toggle`: the row's id. */
  id: string;
  label: string;
  /** The figure on the button: the assets' USD total, or their count. */
  figure: ReactNode;
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
          `${symbols.length} assets`,
          "show breakdown",
        ].join(", ")}
        className={`-mx-1.5 -my-1 inline-flex max-w-full cursor-pointer flex-wrap items-center gap-x-1.5 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-rb-200/70 focus-ring dark:hover:bg-rb-700/60 ${open ? "bg-rb-200/70 dark:bg-rb-700/60" : ""}`}
        data-stat-breakdown-toggle={id}
        data-anatomy="C19"
      >
        <QuietTipsContext.Provider value={true}>
          <ProvInert>{figure}</ProvInert>
          <span className="inline-flex shrink-0 items-center">
            <InlineAssetCluster symbols={symbols} size={16} overlap={5} />
          </span>
        </QuietTipsContext.Provider>
      </button>
      {open && (
        // The overlay renders in a portal, but its events still pass through
        // the card's React handlers: this stops them here.
        <span className="contents" onClick={(e) => e.stopPropagation()}>
          <AnchoredPanel
            id={panelId}
            label={total ? `${label} ${formatUsdValue(total.usd)}` : label}
            anchor={() => button.current}
            onClose={close}
            fit={420}
            drop
            name="breakdown-panel"
            surface="overlay"
            className="[--donut-ground:var(--surface-overlay)] max-sm:[--donut-ground:var(--surface-raised)] dark:[--donut-ground:var(--color-rb-900)]"
          >
            <p className="mb-3 flex items-baseline gap-2 pr-8 sm:pr-0" data-breakdown-heading="">
              <span className={OVERLAY_HEADING}>{label}</span>
              {total && (
                <Prov info={total.info} echo>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatUsdValue(total.usd)}
                  </span>
                </Prov>
              )}
            </p>
            {panel}
          </AnchoredPanel>
        </span>
      )}
    </>
  );
}

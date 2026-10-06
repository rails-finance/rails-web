"use client";

// Minimal activity-timeline module — just the bits the universal event-card
// system imports. This app only renders trove-scoped timelines (not a
// cross-protocol home feed), so this keeps only what those consumers need:
//
//   - useTimelineScale  — sizing tokens (avatar, token icon, grid)
//   - useSingleWallet   — when true, EventCard suppresses the avatar
//   - SpineVal / fmtSpine — flanking value cell on the spine column
//
// If we later port the full timeline (e.g. for the address page), this
// shim can be replaced with the verbatim 1200-line file.

import { createContext, useContext, useState, useRef } from "react";
import { fmtSpine } from "@/lib/shared/spine-format";
export { fmtSpine };
import { Prov, type Provenance } from "@/components/shared/provenance";

/** A receipt identity for a spine flanking value — the SAME info/value/symbol
 *  the card's primary instance (the header change value) registers with, so
 *  the spine figure echoes into that receipt and the locator pulse reaches it. */
export interface SpineValProv {
  info: Provenance;
  value: string;
  symbol?: string;
}

// ── Timeline scale ─────────────────────────────────────────────────────

interface TimelineScale {
  avatarSize: number;
  tokenSize: number;
  arrowSize: number;
  gridCols: string;
  cardPad: number;
  cardRounded: string;
}

const TIMELINE_SCALE: TimelineScale = {
  avatarSize: 20,
  tokenSize: 32,
  arrowSize: 18,
  gridCols: "1fr 18px 32px 18px 1fr",
  cardPad: 4,
  cardRounded: "rounded-xl",
};

const TimelineScaleContext = createContext<TimelineScale>(TIMELINE_SCALE);

export function useTimelineScale() {
  return useContext(TimelineScaleContext);
}

// ── Single-wallet suppression ───────────────────────────────────────────

const SingleWalletContext = createContext(false);

export function useSingleWallet() {
  return useContext(SingleWalletContext);
}

export function SingleWalletProvider({ children, value }: { children: React.ReactNode; value: boolean }) {
  return <SingleWalletContext.Provider value={value}>{children}</SingleWalletContext.Provider>;
}

// ── Spine value formatter ───────────────────────────────────────────────

/** Inline spine value cell for 5-column grid rows. When `onChange` is set,
 *  renders a click-to-edit input — used by simulator cards so the spine
 *  values are editable in sim mode. */
export function SpineVal({
  value,
  side,
  onChange,
  decimals = 4,
  max,
  prov,
  unit,
  full,
  text,
}: {
  value?: string | number;
  side: "left" | "right";
  /** A symbol printed after the figure, smaller and muted. */
  unit?: string;
  /** Whole units below a million instead of "8.8K" (fmtSpine's `full`). */
  full?: boolean;
  /** The figure as shown, in place of fmtSpine's (a family's own precision). */
  text?: string;
  onChange?: (v: number) => void;
  decimals?: number;
  max?: number;
  /** Echo this figure into the receipt it re-renders (see SpineValProv). */
  prov?: SpineValProv;
}) {
  const compact = fmtSpine(value, full);
  const txt = compact && text != null ? text : compact;
  if (!txt) return <span />;
  const sideClass = side === "left" ? "justify-self-end pr-5" : "justify-self-start pl-5";
  if (onChange && typeof value === "number") {
    return (
      <span className={sideClass}>
        <SpineValEditable value={value} onChange={onChange} decimals={decimals} max={max} display={txt} />
      </span>
    );
  }
  return (
    <span className={`text-base font-semibold whitespace-nowrap ${sideClass}`}>
      {prov ? (
        <Prov echo info={prov.info} value={prov.value} symbol={prov.symbol}>
          {txt}
        </Prov>
      ) : (
        txt
      )}
      {unit ? <span className="ml-1 text-xs font-normal text-rb-500">{unit}</span> : null}
    </span>
  );
}

function SpineValEditable({
  value,
  onChange,
  decimals,
  max,
  display,
}: {
  value: number;
  onChange: (v: number) => void;
  decimals: number;
  max?: number;
  display: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const startEditing = () => {
    setEditText(value.toFixed(decimals));
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  };
  const commitEdit = () => {
    setEditing(false);
    const v = parseFloat(editText);
    if (!isNaN(v)) {
      const clamped = Math.max(0, max != null ? Math.min(max, v) : v);
      onChange(clamped);
    }
  };
  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit();
          if (e.key === "Escape") setEditing(false);
        }}
        onClick={(e) => e.stopPropagation()}
        className="bg-sunken rounded px-1 py-0 text-base font-semibold tabular-nums w-24 outline-none ring-1 ring-blue-500/50 text-foreground"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        startEditing();
      }}
      className="text-base font-semibold whitespace-nowrap px-1 rounded hover:bg-rb-200 dark:hover:bg-rb-900 transition-colors text-blue-500"
      title="Edit simulated amount"
    >
      {display}
    </button>
  );
}

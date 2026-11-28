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

import Link from "next/link";
import { createContext, useContext, useState, useRef } from "react";
import { fmtSpine } from "@/lib/shared/spine-format";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";
export { fmtSpine };

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

/** A spine amount that opens another page (SpineTokenRow `amountLink`): the
 *  href, its tooltip (also the accessible name), whether it leaves Rails, and
 *  whether the amount wears the hairline border that marks a pETH account link. */
export interface SpineAmountLink {
  href: string;
  tip: string;
  external?: boolean;
  marked?: boolean;
}

/** Inline spine value cell for 5-column grid rows. When `onChange` is set,
 *  renders a click-to-edit input — used by simulator cards so the spine
 *  values are editable in sim mode. */
export function SpineVal({
  value,
  side,
  onChange,
  decimals = 4,
  max,
  unit,
  unitClass,
  full,
  text,
  link,
}: {
  value?: string | number;
  side: "left" | "right";
  /** The amount opens this page: the figure keeps its look at rest and
   *  takes the link cue (underline, the focus ring) on hover and focus. */
  link?: SpineAmountLink;
  /** A symbol printed after the figure, smaller and muted. */
  unit?: string;
  /** The unit's colour in place of the muted rb-500 (a Pendle PT or YT's hue). */
  unitClass?: string;
  /** Whole units below a million instead of "8.8K" (fmtSpine's `full`). */
  full?: boolean;
  /** The figure as shown, in place of fmtSpine's (a family's own precision). */
  text?: string;
  onChange?: (v: number) => void;
  decimals?: number;
  max?: number;
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
  const body = (
    <>
      {txt}
      {unit ? <span className={`ml-1 text-xs font-normal ${unitClass ?? "text-rb-500"}`}>{unit}</span> : null}
    </>
  );
  if (!link) return <span className={`text-base font-semibold whitespace-nowrap ${sideClass}`}>{body}</span>;
  // The link sits inside the card's row: a press opens the page and leaves
  // the card as it was.
  const mark = link.marked ? " rounded-md border border-edge-raised px-1.5 -my-px" : "";
  const cls =
    "text-base font-semibold whitespace-nowrap underline-offset-2 hover:underline focus-visible:underline " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] rounded-sm" +
    mark;
  const common = {
    title: link.tip,
    "aria-label": `${txt}${unit ? ` ${unit}` : ""}: ${link.tip}`,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    "data-spine-amount-link": link.marked ? "marked" : "",
    "data-anatomy": link.marked ? "L3.3" : "L3.2",
  };
  return (
    <span className={sideClass}>
      {link.external ? (
        <a href={link.href} target="_blank" rel="noopener" className={cls} {...common}>
          {body}
        </a>
      ) : (
        <Link href={link.href} prefetch={false} className={cls} {...common}>
          {body}
        </Link>
      )}
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
      className={`text-base font-semibold whitespace-nowrap px-1 rounded hover:bg-rb-200 dark:hover:bg-rb-900 transition-colors ${INPLACE_TEXT}`}
      title="Edit simulated amount"
    >
      {display}
    </button>
  );
}

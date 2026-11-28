"use client";

// LinkedValue — a timeline value that opens a page (a hash, a block, an
// address, an amount, an id or a name), with a tooltip naming where it goes
// (anatomy L14, ui-jobs 878). A Rails link's tooltip is one line, the page's
// name as the link ("Trove 123 →"). An explorer link's is the context line
// ("Went to the Curve pETH/fpETH/vpETH pool"), then the link "View on
// Etherscan ↗" (the chain's explorer, from lib/shared/chains.ts). The timeline
// spine links Rails pages only. The value keeps its look at rest and takes
// the underline and the focus ring on hover and focus; on a screen without
// hover it rests on a dotted hairline underline.
//
// A mouse opens the tooltip on hover and a click follows at once. A touch or a
// pen opens the tooltip first (RevealTip, held open here), holding the words as
// a link, and a second press or that link follows. Enter follows. With no
// pointer event (a screen reader's activation), `(hover: none)` decides
// (lib/shared/spine-amount-press.ts `valuePress`). A tap elsewhere or Escape
// closes it. Tested by scripts/test/linked-value.test.mjs.

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { chainMeta, type ChainId } from "@/lib/shared/chains";
import { valuePress } from "@/lib/shared/spine-amount-press";
import { RevealTip } from "@/components/shared/reveal-tip";
import { startNavigationProgressOnClick } from "@/components/nav/navigation-progress";

/** The cue every linked value wears; the caller's `className` sets the type. */
const LINK_CUE =
  "underline-offset-2 hover:underline focus-visible:underline " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] rounded-sm" +
  // The resting cue without hover (anatomy L14).
  " [@media(hover:none)]:underline [@media(hover:none)]:decoration-dotted [@media(hover:none)]:decoration-1" +
  " [@media(hover:none)]:decoration-[var(--edge-row-line)]";

/** How long a hover tooltip stays once the mouse leaves, so the mouse can
 *  cross the gap to the link in it. */
const HOVER_CLOSE_MS = 200;

type Destination =
  /** The page's words: "Trove 123 →" for a Rails page; an outside page
   *  that is not a block explorer sets `external`. */
  | { tip: string; external?: boolean; explorer?: never; context?: never }
  /** A block explorer page: the tooltip's link reads "View on {explorer} ↗",
   *  under `context`, the place in words, where the caller has them. */
  | { explorer: { chainId: ChainId }; context?: string; tip?: never; external?: never };

export type LinkedValueProps = Destination & {
  href: string;
  /** The value as words, for the accessible name: the name reads it, then
   *  the tooltip's words without the arrow, the context line first. */
  label: string;
  /** The value as it renders unlinked. */
  children: ReactNode;
  /** The value's type and layout classes, after the link cue. */
  className?: string;
  /** Which edge of the value the tooltip lines up with: "end" for a value at
   *  the right of its row. */
  align?: "start" | "end";
  /** The caller's data-* hooks, on the link; a `data-anatomy` here replaces
   *  L14. */
  dataAttrs?: Record<`data-${string}`, string | undefined>;
};

/** The tooltip's words for a destination. */
export function linkedValueTip(d: Destination): string {
  return d.explorer ? `View on ${chainMeta(d.explorer.chainId).explorerName} ↗` : d.tip;
}

export function LinkedValue(props: LinkedValueProps) {
  const { href, label, children, className, align = "start", dataAttrs } = props;
  const tip = linkedValueTip(props);
  const context = props.explorer ? props.context : undefined;
  const external = Boolean(props.explorer || props.external);
  const [open, setOpen] = useState(false);
  // Once a press has opened the tooltip the link says whether it is open;
  // before that, and with a mouse or a keyboard, it is a plain link.
  const [discloses, setDiscloses] = useState(false);
  const tipId = useId();
  // The pointer that pressed the link, read at its click; none for a
  // keyboard or a screen reader's activation.
  const pointer = useRef<string | undefined>(undefined);
  const hoverClose = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keepHover = () => clearTimeout(hoverClose.current);
  const leaveHover = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    keepHover();
    hoverClose.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  };
  useEffect(() => keepHover, []);
  const common = {
    className: `${LINK_CUE}${className ? ` ${className}` : ""}`,
    "aria-expanded": discloses ? open : undefined,
    "aria-describedby": open ? tipId : undefined,
    // A spine node stands above the rows around it while this is set.
    "data-tip-open": open ? "" : undefined,
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      keepHover();
      setOpen(true);
    },
    onPointerLeave: leaveHover,
    onPointerDown: (e: React.PointerEvent) => {
      pointer.current = e.pointerType;
    },
    // A touch that turns into a scroll leaves no pointer behind.
    onPointerCancel: () => {
      pointer.current = undefined;
    },
    // The arrows are visual: the name reads the words alone.
    "aria-label": `${label}: ${context ? `${context}, ` : ""}${tip.replace(/\s*[→↗]\s*$/u, "")}`,
    onClick: (e: React.MouseEvent) => {
      // The value may sit inside a card's link: a press is the value's.
      e.stopPropagation();
      const pressedBy = pointer.current;
      pointer.current = undefined;
      const press = valuePress(open, {
        on: "value",
        pointer: pressedBy,
        hoverless: pressedBy === undefined && window.matchMedia("(hover: none)").matches,
        keyboard: e.detail === 0,
      });
      if (!press.follow) e.preventDefault();
      else if (!external) startNavigationProgressOnClick(e, href);
      if (press.open) setDiscloses(true);
      setOpen(press.open);
    },
    "data-anatomy": "L14",
    ...dataAttrs,
  };
  const tipLink = {
    className: `font-semibold ${INLINE_LINK}`,
    // The press belongs to the link.
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!external) startNavigationProgressOnClick(e, href);
    },
  };
  const outside = { on: "outside", hoverless: false, keyboard: false } as const;
  return (
    <RevealTip
      tip={
        // Covers the bubble's padding, so a mouse resting there keeps it open.
        <span className="-m-3 block p-3" onPointerEnter={keepHover} onPointerLeave={leaveHover}>
          {context ? <span className="mb-1 block">{context}</span> : null}
          {external ? (
            <a href={href} target="_blank" rel="noopener" {...tipLink}>
              {tip}
            </a>
          ) : (
            <Link href={href} prefetch={false} {...tipLink}>
              {tip}
            </Link>
          )}
        </span>
      }
      interactive
      wrap
      align={align}
      open={open}
      bubbleId={tipId}
      onOpenChange={(o) => {
        if (!o) setOpen(valuePress(open, outside).open);
      }}
    >
      {external ? (
        <a href={href} target="_blank" rel="noopener" {...common}>
          {children}
        </a>
      ) : (
        <Link href={href} prefetch={false} {...common}>
          {children}
        </Link>
      )}
    </RevealTip>
  );
}

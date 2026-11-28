"use client";

// LinkedValue — a timeline value that opens a page (a hash, a block, an
// address, an amount, an id or a name), with a tooltip naming where it goes
// (anatomy L14, ui-jobs 878). A Rails link's tooltip is one line, the page's
// name as the link ("Trove 123 →"). An explorer link's is the context line
// where it adds to the value's words ("Router 0x8888…f946"), then the link
// "View on Etherscan ↗"; the chain, the kind and the value build the href and name the
// explorer, both from lib/shared/chains.ts; on a chain that file does not
// name the value renders plain, with no link or tooltip. The timeline
// spine links Rails pages only. The value keeps its look at rest and takes
// the underline and the focus ring on hover and focus; on a screen without
// hover it rests on a dotted hairline underline.
//
// A mouse opens the tooltip on hover and a click follows at once. A touch or a
// pen opens the tooltip first (RevealTip, held open here), holding the words as
// a link, and a second press or that link follows. Enter follows; Enter and Space
// stop at the value, as a press does. With no
// pointer event (a screen reader's activation), `(hover: none)` decides
// (lib/shared/spine-amount-press.ts `valuePress`). A tap elsewhere or Escape
// closes it. While the receipts inspector is armed, a press on a value inside
// a receipt pins the receipt. A Rails link given `onFollow` jumps in place:
// each press that would follow runs it, starts no progress bar and closes the
// tooltip, and the href stays for a new tab (`followsInPlace`). Tested by scripts/test/linked-value.test.mjs.

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { CHAINS, chainMeta, explorerUrl, type ChainId, type ExplorerLinkKind } from "@/lib/shared/chains";
import { followsInPlace, valuePress } from "@/lib/shared/spine-amount-press";
import { PICKABLE_SELECTOR } from "@/lib/shared/tip-yields";
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

/** A page on a chain's block explorer. */
export interface ExplorerPage {
  chainId: ChainId;
  kind: ExplorerLinkKind;
  value: string | number;
}

/** The caller's jump in place of a Rails link's navigation. */
export type FollowHandler = (e: React.MouseEvent) => void;

type Destination =
  /** The page and its words: "Trove 123 →" for a Rails page; an outside page
   *  that is not a block explorer sets `external`, and may carry `context`.
   *  A Rails page may set `onFollow`: a press that follows calls it in place
   *  of loading the page, and a new tab still opens the href. */
  | { href: string; tip: string; external?: false; context?: string; onFollow?: FollowHandler; explorer?: never }
  | { href: string; tip: string; external: true; context?: string; onFollow?: never; explorer?: never }
  /** A block explorer page: the tooltip's link reads "View on {explorer} ↗",
   *  under `context`, the place in words, where the caller has them. */
  | { explorer: ExplorerPage; context?: string; href?: never; tip?: never; external?: never; onFollow?: never };

export type LinkedValueProps = Destination & {
  /** The value as words, for the accessible name: the name reads it, then
   *  the tooltip's words without the arrow, the context line first. Where
   *  those words hold the label, the name reads them alone. */
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

/** Whether lib/shared/chains.ts names the chain. `chainMeta` falls back to
 *  Ethereum's, so a link on another chain would name one explorer and open
 *  that chain's page on it. */
export function hasExplorer(chainId: ChainId): boolean {
  return chainId in CHAINS;
}

/** The tooltip's words for a destination whose chain has an explorer. */
export function linkedValueTip(d: Destination): string {
  return d.explorer ? `View on ${chainMeta(d.explorer.chainId).explorerName} ↗` : d.tip;
}

/** Where a destination whose chain has an explorer opens. */
export function linkedValueHref(d: Destination): string {
  if (!d.explorer) return d.href;
  const { chainId, kind, value } = d.explorer;
  return explorerUrl(chainId, kind, value);
}

/** The chains already warned about, so a page warns once per chain. */
const warned = new Set<number>();

/** The caller's classes less those that dress a link (its colour, its hover
 *  and focus states, its underline), behind any variant prefix (`dark:`,
 *  `group-hover:`, `sm:`), for the value rendered unlinked. */
export function unlinkedClasses(className: string | undefined): string | undefined {
  const kept = (className ?? "")
    .split(/\s+/)
    .filter(
      (c) =>
        c &&
        !/^(?:[a-z-]+:)*(link(-|$)|hover:|focus-visible:|underline|decoration-|text-blue-|text-\[var\(--text-(link|external)\)\])/.test(
          c,
        ),
    );
  return kept.length > 0 ? kept.join(" ") : undefined;
}

export function LinkedValue(props: LinkedValueProps) {
  if (props.explorer && !hasExplorer(props.explorer.chainId)) {
    const { chainId } = props.explorer;
    if (process.env.NODE_ENV !== "production" && !warned.has(chainId)) {
      warned.add(chainId);
      console.warn(`[LinkedValue] no explorer for chain ${chainId}: "${props.label}" renders unlinked`);
    }
    return (
      <span className={unlinkedClasses(props.className)} {...props.dataAttrs}>
        {props.children}
      </span>
    );
  }
  return <LinkedValueLink {...props} />;
}

function LinkedValueLink(props: LinkedValueProps) {
  const { label, children, className, align = "start", dataAttrs, onFollow } = props;
  const href = linkedValueHref(props);
  const tip = linkedValueTip(props);
  const context = props.context;
  // The arrows are visual: the name reads the words alone.
  const words = [context, tip.replace(/\s*[→↗]\s*$/u, "")].filter(Boolean).join(", ");
  const name = words.includes(label) ? words : `${label}: ${words}`;
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
  // The caller's jump, for a press that follows.
  const jump = (e: React.MouseEvent, follow: FollowHandler) => {
    e.preventDefault();
    follow(e);
    setOpen(false);
  };
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
    "aria-label": name,
    // The value may sit inside a card's header, which opens on Enter and
    // Space; while the inspector is armed the receipt around it takes them.
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.currentTarget.closest(PICKABLE_SELECTOR)) return;
      if (e.key === "Enter" || e.key === " ") e.stopPropagation();
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      // While the receipts inspector is armed, a receipt around the value
      // takes the press and pins its receipt (decision 0062 point 4).
      if (e.currentTarget.closest(PICKABLE_SELECTOR)) return;
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
      if (onFollow && followsInPlace(press, e)) {
        jump(e, onFollow);
        return;
      }
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
  if (onFollow) {
    // The link in the tooltip always follows.
    tipLink.onClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (followsInPlace({ follow: true }, e)) jump(e, onFollow);
    };
  }
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

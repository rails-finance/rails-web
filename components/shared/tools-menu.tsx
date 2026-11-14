"use client";

// Tools — the one instrument menu on a position or detail view.
// ----------------------------------------------------------------------------
// A spanner trigger opening a dropdown that holds the export shapes the caller
// adds (ExportMenu passes the three "Copy for LLM" items). The provenance
// inspector is armed from the profile menu (H20.1; ui-jobs 625), so a menu
// with no rows draws nothing.
//
// The `card` variant is the position card's one menu (ui-jobs 270, 246): a ⋮
// trigger at the right end of the card's heading (ui-jobs 295), the position's
// rows (`leading`) first, then the export shapes. The `event`, `panel` and
// `view` menus draw the same trigger for an event card, a section and a
// listing. Below sm these open as a sheet with each row full width.

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, EllipsisVertical, Wrench } from "lucide-react";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON, OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { MobileSheet } from "@/components/shared/mobile-sheet";

/** One row of the Tools menu: icon, title, one line of subtitle. With `href`
 *  the row is a link (`external` opens it in a new tab). `copied` marks a copy
 *  row whose confirmation is showing. */
export function ToolsMenuItem({
  icon,
  title,
  subtitle,
  onClick,
  disabled,
  href,
  external,
  copied,
  item,
  expanded,
  internal,
  offsite,
  checked,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle: string;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
  external?: boolean;
  copied?: boolean;
  /** A name for the row (`data-menu-item`), for the verifiers. */
  item?: string;
  /** A row that shows or hides a group (ui-jobs 250): its state, drawn as
   *  `aria-expanded` with `data-group-button` on the row. */
  expanded?: boolean;
  /** A row that goes to another page of Rails: its title and icon in link
   *  blue (`--text-link`, ui-jobs 535). */
  internal?: boolean;
  /** A row that leaves Rails (the chain's explorer, the protocol's app or
   *  docs): its title and icon in the off-site pink (`--text-external`). */
  offsite?: boolean;
  /** A switch row (the Morpho roster's "Show all markets"): its state, drawn
   *  as `role="menuitemcheckbox"` with `aria-checked`. */
  checked?: boolean;
}) {
  const className =
    "flex items-start gap-3 mx-1 my-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-[rgba(196,205,217,0.08)] dark:focus-visible:bg-[rgba(196,205,217,0.08)]";
  const tone = internal ? "text-[var(--text-link)]" : offsite ? "text-[var(--text-external)]" : null;
  const body = (
    <>
      <span className={`mt-0.5 shrink-0 ${tone ?? "text-rb-500"}`}>{icon}</span>
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${tone ?? "text-foreground"}`}>{title}</span>
        <span className="block text-xs text-rb-500">{subtitle}</span>
      </span>
    </>
  );
  const data = {
    "data-menu-item": item,
    "data-copied": copied ? "" : undefined,
    ...(expanded !== undefined ? { "data-group-button": "", "aria-expanded": expanded } : {}),
  };
  if (href) {
    return external ? (
      <a href={href} target="_blank" rel="noopener" role="menuitem" className={className} onClick={onClick} {...data}>
        {body}
      </a>
    ) : (
      <Link href={href} role="menuitem" className={className} onClick={onClick} {...data}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      className={className}
      {...data}
    >
      {body}
    </button>
  );
}

/** The menu's keys (C17 and the event card's ⋮): the arrows, Home and End move
 *  between the rows. */
function moveFocus(e: React.KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const items = [
    ...e.currentTarget.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])',
    ),
  ];
  if (items.length === 0) return;
  e.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? items.length - 1
        : e.key === "ArrowDown"
          ? (at + 1) % items.length
          : (at - 1 + items.length) % items.length;
  items[next]?.focus();
}

export function ToolsMenu({
  ariaLabel,
  copied = false,
  variant = "tools",
  leading,
  label,
  heading,
  noun = "position",
  children,
}: {
  /** `tools`: the spanner trigger of a page row. `card`: the position card's
   *  ⋮ menu, a sheet on a phone. `event`: the event card's ⋮ at its header's
   *  right end, the card menu named by `label` and `heading`. `panel`: the
   *  same for a section's header. `view`: the listing's ⋮ at the
   *  right end of its sort and filter row (N1.7, ui-jobs 521), named like
   *  `event`. */
  variant?: "tools" | "card" | "event" | "panel" | "view";
  /** Rows above the export shapes (the card's ID, NFT and page link), handed
   *  the menu's close like `children`. */
  leading?: (close: () => void) => ReactNode;
  /** What the caller's shapes act on, added to the trigger's accessible
   *  name ("Tools: Export this position"). */
  ariaLabel?: string;
  /** The `event` menu's accessible name and its sheet's heading. */
  label?: string;
  /** The family's unit, naming the card and Tools menus ("Position menu",
   *  Compound V3's "Account menu"); lower case. */
  noun?: string;
  heading?: string;
  /** Flash the trigger as the confirmation for a copy taken from the menu —
   *  the menu closes on action, so the trigger is where the answer lands. */
  copied?: boolean;
  /** The caller's rows. Handed the menu's close so a row can shut the panel
   *  when it acts. */
  children?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The event, panel and view menus: the card menu's trigger and rows, named
  // by `label` and `heading`.
  const eventMenu = variant === "event" || variant === "panel" || variant === "view";
  const card = variant === "card" || eventMenu;
  const isPhone = useMediaQuery(PHONE_QUERY);
  const sheet = card && isPhone;
  const close = () => setOpen(false);
  // Escape and the sheet's close hand focus back to the trigger.
  const closeToTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Close on outside click / Escape — mirrors the listing sort dropdown. While
  // the inspector is armed Escape is also the inspector's ladder, which is
  // mounted on document too; closing this panel as well is harmless.
  useEffect(() => {
    // The sheet closes from its own scrim and Escape; its rows are portalled
    // outside `ref`, so the outside-press rule would shut it under a tap.
    if (!open || sheet) return;
    function handlePointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      if (ref.current?.contains(document.activeElement)) triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, sheet]);

  // The first row takes focus as the menu opens, so the arrows move from
  // there; in the sheet, after the sheet has focused its panel.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() =>
      menuRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])')
        ?.focus({ preventScroll: true }),
    );
    return () => window.clearTimeout(t);
  }, [open, sheet]);

  const rows = (
    <>
      {leading?.(close)}
      {leading && children && <div className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />}
      {children?.(close)}
    </>
  );
  // Nothing to offer: no trigger.
  if (!leading && !children) return null;

  if (card) {
    const name = eventMenu ? (label ?? "") : `${noun[0].toUpperCase()}${noun.slice(1)} menu`;
    const wrapperData =
      variant === "panel"
        ? { "data-panel-menu": "" }
        : variant === "view"
          ? { "data-view-menu": "", "data-anatomy": "N1.7" }
          : eventMenu
            ? { "data-event-menu": "" }
            : { "data-export-menu": "", "data-tools-menu": "", "data-card-menu": "", "data-anatomy": "C17" };
    return (
      <div ref={ref} className="relative flex" {...wrapperData}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={copied ? "Copied" : ariaLabel ? `${name}: ${ariaLabel}` : name}
          // A 28px glyph with a 44px press area: the after: box reaches past
          // the button without moving the strip.
          className={`${CTRL_GHOST} ${open ? CTRL_ON : CTRL_OFF} relative h-7 w-7 justify-center rounded-md after:absolute after:-inset-2 after:content-['']`}
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <EllipsisVertical className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        {open &&
          (sheet ? (
            <MobileSheet
              label={name}
              onClose={closeToTrigger}
              header={<div className={`${OVERLAY_HEADING} px-1 pb-2`}>{eventMenu ? heading : "Position"}</div>}
            >
              <div
                ref={menuRef}
                role="menu"
                aria-label={name}
                onKeyDown={moveFocus}
                className="-mx-4 [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:w-[calc(100%-0.5rem)] [&_[role=menuitemcheckbox]]:min-h-11 [&_[role=menuitemcheckbox]]:w-[calc(100%-0.5rem)]"
              >
                {rows}
              </div>
            </MobileSheet>
          ) : (
            <div
              ref={menuRef}
              className="overlay-panel absolute right-0 top-full z-[var(--z-dropdown)] mt-2 min-w-[260px] overflow-hidden py-1"
              role="menu"
              aria-label={name}
              onKeyDown={moveFocus}
            >
              {rows}
            </div>
          ))}
      </div>
    );
  }

  return (
    // `data-export-menu` stays on the wrapper: it is what the export verifiers
    // reach for, and this is still the element they mean.
    <div ref={ref} className="relative" data-export-menu data-tools-menu data-anatomy="H7.3">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel ? `Tools: ${ariaLabel}` : "Tools"}
        className={`${CTRL_GHOST} ${open ? CTRL_ON : CTRL_OFF} h-8 gap-1.5 rounded-md px-2.5 text-xs font-medium sm:gap-2 sm:px-3`}
      >
        <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
        {/* Below sm the row carries back, block, prices and this across 390px,
            so the spanner stands for the word. The accessible name says it
            either way, and a copy's confirmation always shows. */}
        <span className={copied ? undefined : "hidden sm:inline"}>{copied ? "Copied" : "Tools"}</span>
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          // Below sm the wallet row also carries the price and recency strip
          // (ui-jobs 272): the spanner alone is the trigger there.
          <ChevronDown
            className={`hidden h-3.5 w-3.5 text-rb-500 transition-transform sm:block ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          className="overlay-panel absolute right-0 top-full z-[var(--z-dropdown)] mt-2 min-w-[260px] overflow-hidden py-1"
          role="menu"
          onKeyDown={moveFocus}
        >
          {rows}
        </div>
      )}
    </div>
  );
}

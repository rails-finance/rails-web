"use client";

// Tools — the one instrument menu on a position or detail view.
// ----------------------------------------------------------------------------
// A spanner trigger opening a dropdown that holds the page's instruments: the
// provenance inspector's toggle, then whatever export shapes the caller adds
// (ExportMenu passes the three "Copy for LLM" items). Before this the export
// shapes were their own trigger and the inspector's toggle rode in the fixed
// bottom dock; the dock is gone from these views, so the two live together.
//
// While the inspector is armed the trigger carries a small green dot. The dot
// is always in the DOM and merely uncoloured at rest, so arming the tool never
// moves the row.
//
// A caller with no export shapes (the vault holder pages) renders <ToolsMenu />
// with no children: the menu is then the inspector alone, which is what those
// pages had in the dock.
//
// The `card` variant is the position card's one menu (ui-jobs 270, 246): a ⋮
// trigger at the right end of the card's heading (ui-jobs 295), the position's rows
// (`leading`) first, the export shapes, then "Show provenance", which arms the
// inspector on the card alone (ui-jobs 284). The `event` and `panel` menus end
// on the same row for their section where the caller names one (`provScope`).
// Below sm these open as a sheet with each row full width.

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, ChevronDown, EllipsisVertical, Wrench } from "lucide-react";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON, OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { MobileSheet } from "@/components/shared/mobile-sheet";
import { POSITION_CARD_SCOPE, provInspector } from "@/components/shared/provenance";
import { ProvInspectorToggle, ProvScopeToggle } from "@/components/shared/prov-inspector";

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
}: {
  icon: ReactNode;
  title: string;
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
}) {
  const className =
    "flex items-start gap-3 mx-1 my-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-[rgba(196,205,217,0.08)] dark:focus-visible:bg-[rgba(196,205,217,0.08)]";
  const body = (
    <>
      <span className="mt-0.5 shrink-0 text-rb-500">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
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
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        role="menuitem"
        className={className}
        onClick={onClick}
        {...data}
      >
        {body}
      </a>
    ) : (
      <Link href={href} role="menuitem" className={className} onClick={onClick} {...data}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} role="menuitem" className={className} {...data}>
      {body}
    </button>
  );
}

/** The menu's keys (C17 and the event card's ⋮): the arrows, Home and End move
 *  between the rows. */
function moveFocus(e: React.KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
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
  provScope,
  children,
}: {
  /** `tools`: the spanner trigger of a page row. `card`: the position card's
   *  ⋮ menu, a sheet on a phone. `event`: the event card's ⋮ at its header's
   *  right end, the card menu named by `label` and `heading`. `panel`: the
   *  same for a panel's header (Lifetime flows), its last row the panel's
   *  "Show provenance" (`provScope`). */
  variant?: "tools" | "card" | "event" | "panel";
  /** Rows above the export shapes (the card's ID, NFT and page link), handed
   *  the menu's close like `children`. */
  leading?: (close: () => void) => ReactNode;
  /** What the caller's shapes act on, added to the trigger's accessible
   *  name ("Tools: Export this position"). Absent on a menu that carries only
   *  the inspector. */
  ariaLabel?: string;
  /** The `event` menu's accessible name and its sheet's heading. */
  label?: string;
  heading?: string;
  /** The section a menu's last row arms the inspector on (ui-jobs 284), and
   *  the row's subtitle. The `card` menu's is the position card. */
  provScope?: { id: string; hint: string };
  /** Flash the trigger as the confirmation for a copy taken from the menu —
   *  the menu closes on action, so the trigger is where the answer lands. */
  copied?: boolean;
  /** The caller's rows, under the inspector. Handed the menu's close so a row
   *  can shut the panel when it acts. */
  children?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The event and panel menus: the card menu's trigger and rows, named by
  // `label` and `heading`; a panel's ends on its section's "Show provenance".
  const eventMenu = variant === "event" || variant === "panel";
  const card = variant === "card" || eventMenu;
  const scope =
    provScope ??
    (variant === "card" ? { id: POSITION_CARD_SCOPE, hint: "Click a value on this card to trace it" } : null);
  // The trigger's dot: armed page-wide on the Tools menu; armed on this
  // section, or page-wide, on a ⋮.
  const armed = useSyncExternalStore(
    provInspector.subscribe,
    () => (scope ? provInspector.armedFor(scope.id) : provInspector.getArmed()),
    () => false,
  );
  const isPhone = useMediaQuery(PHONE_QUERY);
  const sheet = card && isPhone;
  const close = () => setOpen(false);
  // Escape and the sheet's close hand focus back to the trigger.
  const closeToTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Close on outside click / Escape — mirrors the listing sort dropdown. While
  // the inspector is armed Escape belongs to the inspector's own ladder, which
  // is mounted on document too; closing this panel as well is harmless because
  // the panel is shut by the time a pick can be made.
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
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true }),
    );
    return () => window.clearTimeout(t);
  }, [open, sheet]);

  const rows = (
    <>
      {card ? (
        <>
          {leading?.(close)}
          {leading && children && <div className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />}
          {children?.(close)}
          {scope && (
            <>
              {(leading || children) && <div className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />}
              <ProvScopeToggle scope={scope.id} hint={scope.hint} onPick={closeToTrigger} openerRef={triggerRef} />
            </>
          )}
        </>
      ) : (
        <>
          <ProvInspectorToggle variant="menu" onPick={closeToTrigger} openerRef={triggerRef} />
          {children && (
            <>
              <div className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />
              {children(close)}
            </>
          )}
        </>
      )}
    </>
  );

  if (card) {
    const name = eventMenu ? (label ?? "") : "Position menu";
    const wrapperData =
      variant === "panel"
        ? { "data-panel-menu": "" }
        : eventMenu
          ? { "data-event-menu": "" }
          : { "data-export-menu": "", "data-tools-menu": "", "data-card-menu": "", "data-anatomy": "C17" };
    return (
      <div ref={ref} className="relative" {...wrapperData}>
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
          {scope && (
            <span
              data-prov-armed={armed ? "" : undefined}
              className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ${armed ? "bg-green-500" : "bg-transparent"}`}
              aria-hidden="true"
            />
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
                className="-mx-4 [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:w-[calc(100%-0.5rem)]"
              >
                {rows}
              </div>
            </MobileSheet>
          ) : (
            <div
              ref={menuRef}
              className="overlay-panel absolute right-0 top-full z-50 mt-2 min-w-[260px] overflow-hidden py-1"
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
        <span
          data-prov-armed={armed ? "" : undefined}
          className={`h-1.5 w-1.5 rounded-full ${armed ? "bg-green-500" : "bg-transparent"}`}
          aria-hidden="true"
        />
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
          className="overlay-panel absolute right-0 top-full z-50 mt-2 min-w-[260px] overflow-hidden py-1"
          role="menu"
          onKeyDown={moveFocus}
        >
          {rows}
        </div>
      )}
    </div>
  );
}

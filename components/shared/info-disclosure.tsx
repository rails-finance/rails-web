"use client";

import { useCallback, useState } from "react";

/**
 * Standard "plain language" help affordance — the single info grammar for every
 * card in the product. Renders a page-background pill at the bottom-left of the
 * card: a solid (i) disc with a chevron to its right (pointing down when
 * closed, up when open). Clicking expands a rounded panel *within* the card —
 * the pill moves to the panel's top-left, the explanation renders below, and an
 * optional footer (gas / Etherscan) pins to the bottom.
 *
 * Replaces the older right-aligned `InfoIconButton` / `SpokeInfoButton` /
 * per-element triggers (e.g. the price-runway (i)). Keep new help affordances
 * on this component so location + style stay consistent across rails.
 *
 * Controlled (`open` + `onToggle`) or uncontrolled (`defaultOpen`). `warning`
 * swaps the disc to a red triangle so dangerous states surface without a click.
 *
 * The disc uses the existing (i) glyph, whose center "i" is a cutout — it shows
 * the pill/panel background through it (near-white in light mode). The disc
 * rests muted (rb-500) and goes to foreground on hover, mirroring CTRL_OFF's
 * direction: this is a *disclosure* (it reveals more of this card), not an
 * in-place utility action, so it deliberately does not take the utility teal —
 * teal stays with controls that change the view (see ui-grammar.ts).
 */

/** The (i) glyph's path — exported so the rail header's info link can draw the
 *  SAME mark the disclosure trigger uses (one glyph source, as with the
 *  /coverage matrix trigger), at whatever size its slot needs. */
export const INFO_PATH =
  "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z";
const WARNING_PATH =
  "M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z";

export interface InfoDisclosureTriggerProps {
  open: boolean;
  onToggle: (e: React.MouseEvent) => void;
  /** aria-label noun — "Show {label}" / "Hide {label}". */
  label?: string;
  /** Swap the (i) disc for a red warning triangle. */
  warning?: boolean;
  /** Pill fill — see `InfoDisclosureProps.surface`. */
  surface?: "background" | "raised";
  /** id of the panel this controls, when the panel is NOT a DOM descendant of
   *  the trigger's wrapper (the /coverage matrix row, whose panel is a sibling
   *  `<tr>`). Omitted by `InfoDisclosure`, whose panel encloses the trigger. */
  ariaControls?: string;
  /** Visible text rendered inside the button, after the chevron — so the words
   *  are part of the click target rather than dead text beside it. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The bare (i) · chevron pill. The pill keeps the same padding/background in
 * both states so the glyph never shifts when a panel opens — the expanded
 * panel's body padding lives on the content, not the trigger frame. Hover only
 * re-tones the icon + chevron (muted rb-500 → foreground, in both themes),
 * never the pill fill.
 *
 * Split out of `InfoDisclosure` so the glyph has one source: /coverage's matrix
 * rows need the same trigger driving a panel that can't be a descendant.
 */
export function InfoDisclosureTrigger({
  open,
  onToggle,
  label = "details",
  warning = false,
  surface = "background",
  ariaControls,
  children,
  className,
}: InfoDisclosureTriggerProps) {
  const surfaceBg = surface === "raised" ? "bg-raised" : "bg-background";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={ariaControls}
      aria-label={open ? `Hide ${label}` : `Show ${label}`}
      className={`group/info inline-flex cursor-pointer items-center gap-1 rounded-full p-1 ${surfaceBg}${
        className ? ` ${className}` : ""
      }`}
    >
      <svg
        className={`h-5 w-5 transition-colors ${
          warning ? "text-red-500 dark:text-red-400" : "text-rb-500 group-hover/info:text-foreground"
        }`}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path fillRule="evenodd" d={warning ? WARNING_PATH : INFO_PATH} clipRule="evenodd" />
      </svg>
      <svg
        className={`mr-0.5 h-3 w-3 text-rb-500 transition-[color,transform] duration-200 group-hover/info:text-foreground ${
          open ? "rotate-180" : ""
        }`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
      {children}
    </button>
  );
}

export interface InfoDisclosureProps {
  /** Controlled open state. Omit to use internal (uncontrolled) state. */
  open?: boolean;
  /** Initial open state when uncontrolled. */
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  /** Swap the (i) disc for a red warning triangle. */
  warning?: boolean;
  /** Explanation body, shown when open. */
  children: React.ReactNode;
  /** Optional footer row pinned to the bottom of the open panel. */
  footer?: React.ReactNode;
  /** Extra classes on the outer wrapper. */
  className?: string;
  /** aria-label noun — "Show {label}" / "Hide {label}". */
  label?: string;
  /** Pill/panel fill. The default punches page background through a raised
   *  card; hosts sitting ON the page canvas (e.g. a listing header) invert to
   *  "raised" so the pill and open panel still read as a surface. */
  surface?: "background" | "raised";
  /** Inline content sharing the trigger's row (the `InfoTabsDisclosure`
   *  pattern) — rendered right after the pill in both states, so it stays put
   *  while the panel opens below. Listing headers use it for the recency
   *  stamp. */
  rowExtra?: React.ReactNode;
}

export function InfoDisclosure({
  open: openProp,
  defaultOpen = false,
  onToggle,
  warning = false,
  children,
  footer,
  className,
  label = "details",
  surface = "background",
  rowExtra,
}: InfoDisclosureProps) {
  const surfaceBg = surface === "raised" ? "bg-raised" : "bg-background";
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const next = !open;
      if (!isControlled) setInternalOpen(next);
      onToggle?.(next);
    },
    [open, isControlled, onToggle],
  );

  // The panel encloses the trigger in both states, so no `ariaControls` is
  // needed here — the association is structural.
  const trigger = (
    <InfoDisclosureTrigger open={open} onToggle={toggle} label={label} warning={warning} surface={surface} />
  );

  if (!open) {
    return (
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className ?? ""}`}>
        {trigger}
        {rowExtra}
      </div>
    );
  }

  return (
    // The info panel is editorial — narrated figures and footer chrome, never a
    // stat surface — so it's exempt from the dev provenance-coverage tripwire
    // (a <Prov> inside still registers; the exemption only silences the scan).
    <div className={`rounded-xl ${surfaceBg} ${className ?? ""}`} data-prov-exempt="">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {trigger}
        {rowExtra}
      </div>
      {children && <div className="px-3 pb-3 pt-1">{children}</div>}
      {footer}
    </div>
  );
}

/* ── Tabbed variant — the event-card info grammar ─────────────────────── */

/**
 * One section of an `InfoTabsDisclosure`: the heading IS the button. Every tab
 * shows the (i) disc. There is deliberately no provenance trigger here — the
 * provenance inspector is the one prov surface and lives in the floating price
 * bar at the foot of the page, not on the card.
 */
export interface InfoDisclosureTab {
  key: string;
  /** Accessible name for the button ("Explanation") — feeds the aria-label
   *  only; the icon is the visible identity. */
  label: string;
  content: React.ReactNode;
}

export interface InfoTabsDisclosureProps {
  tabs: InfoDisclosureTab[];
  /** Key of the open tab, or null when collapsed. Controlled only. */
  openTab: string | null;
  onOpenTabChange: (key: string | null) => void;
  /** Optional footer row pinned to the bottom of the open pane. */
  footer?: React.ReactNode;
  /** Keep every tab's content mounted (hidden when not the open one) instead
   *  of mounting only the open tab. For surfaces whose explanation embeds
   *  `<Prov>` values: unmounting would unregister them from the receipts
   *  scope, so the Provenance list would thin out the moment it opened. Event
   *  cards keep the default (mount-on-open) — their panes are heavier and
   *  their traced values live on the card, not in the pane. */
  keepMounted?: boolean;
  /** Inline content sharing the heading-button row — a shorthand stat line
   *  flowing on from the buttons (the host supplies its own flex sizing/gaps).
   *  The row wraps when present, so the extras break to their own line before
   *  crowding the buttons on narrow viewports. */
  rowExtra?: React.ReactNode;
  className?: string;
}

/**
 * The event card's info affordance: each section heading is its own button —
 * icon · chevron, no text (the icon is the identity; the label lives in the
 * aria-label) — and the open one bridges into the shared pane beneath (same
 * background, squared bottom, a painted connector across the gap), so button
 * and content read as one physical piece. The buttons are rounded-lg in both
 * states so opening only squares the bottom corners — the shape is retained,
 * not rearched. Clicking the open heading collapses the pane; clicking the
 * other switches sections.
 */
export function InfoTabsDisclosure({
  tabs,
  openTab,
  onOpenTabChange,
  footer,
  keepMounted,
  rowExtra,
  className,
}: InfoTabsDisclosureProps) {
  const open = tabs.find((t) => t.key === openTab) ?? null;
  const openIndex = open ? tabs.indexOf(open) : -1;

  return (
    <div className={className}>
      {/* With a `rowExtra` (a tall risk strip) the row grows past the buttons'
          own height; centring would float the open button away from the pane it
          is supposed to be a tab of, and the `after:` connector can't span the
          gap. Bottom-align in that case; without a rowExtra the row is
          button-height and centring is unchanged. */}
      <div className={`flex gap-2 ${rowExtra != null ? "flex-wrap items-end" : "items-center"}`}>
        {tabs.map((t) => {
          const active = open?.key === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenTabChange(active ? null : t.key);
              }}
              aria-expanded={active}
              aria-label={active ? `Hide ${t.label.toLowerCase()}` : `Show ${t.label.toLowerCase()}`}
              className={`group/info relative inline-flex cursor-pointer items-center gap-1 rounded-lg bg-background p-1 ${
                // The open button becomes the pane's tab: square bottom corners
                // plus an ::after strip that paints the button's background
                // across the gap down into the pane — the physical connection.
                active
                  ? "rounded-b-none after:absolute after:inset-x-0 after:top-full after:h-1.5 after:bg-background"
                  : ""
              }`}
            >
              <svg
                className="h-5 w-5 text-rb-500 transition-colors group-hover/info:text-foreground"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d={INFO_PATH} clipRule="evenodd" />
              </svg>
              <svg
                className={`mr-0.5 h-3 w-3 text-rb-500 transition-[color,transform] duration-200 group-hover/info:text-foreground ${
                  active ? "rotate-180" : ""
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          );
        })}
        {rowExtra}
      </div>
      {keepMounted ? (
        // All tab contents stay in the DOM; the pane chrome (and the footer)
        // only shows while a tab is open, and only the open tab's content is
        // visible. Hidden content still registers its <Prov> values.
        // data-prov-exempt: the pane is editorial (explanations, footer) or
        // receipts chrome — never a stat surface the coverage tripwire owns.
        <div
          className={open ? `mt-1.5 rounded-xl bg-background ${openIndex === 0 ? "rounded-tl-none" : ""}` : "hidden"}
          data-prov-exempt=""
        >
          {tabs.map((t) => (
            <div key={t.key} className={open?.key === t.key ? "px-3 pb-3 pt-3 text-sm" : "hidden"}>
              {t.content}
            </div>
          ))}
          {open && footer}
        </div>
      ) : (
        open && (
          <div
            className={`mt-1.5 rounded-xl bg-background ${openIndex === 0 ? "rounded-tl-none" : ""}`}
            data-prov-exempt=""
          >
            <div className="px-3 pb-3 pt-3 text-sm">{open.content}</div>
            {footer}
          </div>
        )
      )}
    </div>
  );
}

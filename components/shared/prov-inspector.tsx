"use client";

// The provenance inspector — the page-level target mode.
// ----------------------------------------------------------------------------
// Armed in one place, the profile menu's switch "Inspector" (H20.1, decision
// 0062; ui-jobs 625, 651): while it is on, the layer arms each page view on
// arrival, on the routes in lib/shared/prov-preference-routes.ts. Two ways
// put it down, both through `putDownInspector`, which turns the switch off too:
// the switch and Escape's second press. While it is armed on a page with a
// traced value, the header shows the inspector indicator beside the profile
// control (<ProvInspectorIndicator>, H7.4), which turns nothing off.
//
// - <ProvInspectorLayer> — armed, every scoped <Prov> on the page is a click
//   target with a light dotted underline (the coverage map). A pick anchors
//   the figure's WHOLE receipt at the clicked value: name + figure + class
//   dots (a button that opens the class modal) in the head, then the
//   summary, via, formula, operand rows, and source coordinates — one card,
//   no second click, so it renders at its final height and never re-anchors.
//   Sticky mode: the popover moves pick to pick; click-away closes the
//   popover but keeps the tool armed; Escape closes the popover first, then
//   the mode. Under 640px the same content renders as a bottom sheet instead
//   of an anchored popover.
//
// This is the only receipt surface (rails-ops
// `standards/provenance-receipts-grammar.md` §1). The per-card receipts panel
// it once sat beside was retired for it in web `161d0cd` (2026-07-22).

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Crosshair, X } from "lucide-react";
import {
  CLASS_CSS,
  CLASS_META,
  classifyValue,
  entryKey,
  LadderModal,
  locateEntries,
  provInspector,
  provTraced,
  ProvReceipt,
  receiptLabel,
  type ProvInspectorPin,
  type ProvReceiptEntry,
} from "./provenance";
import { involvedClasses } from "@/lib/shared/prov-class";
import { LADDER_TITLE } from "@/lib/shared/prov-class-words";
import { useParams, usePathname } from "next/navigation";
import { setProvPreference, useProvPreference } from "@/lib/shared/prov-preference";
import { provPreferenceAllows } from "@/lib/shared/prov-preference-routes";

/** Put the inspector down from a control the reader pressed (Escape's
 *  second rung, the profile menu's switch): one state, so
 *  the saved preference (decision 0062) goes off with it and the switch reads
 *  off at once (ui-jobs 624). Leaving a page disarms with `setArmed(false)`
 *  alone and keeps the preference. */
export function putDownInspector() {
  provInspector.setArmed(false);
  setProvPreference(false);
}

/** An open menu or modal; the wallet panel stays mounted, `aria-hidden`, while shut. */
const OPEN_OVERLAY = '[role="menu"], [aria-modal="true"]:not([aria-hidden="true"])';

/** Mount once per page (beside the timeline, outside any card). Renders
 *  nothing at rest; arms from the saved preference and owns the Escape ladder
 *  and the pinned popover. */
export function ProvInspectorLayer() {
  const armed = useSyncExternalStore(provInspector.subscribe, provInspector.getArmed, () => false);
  const pin = useSyncExternalStore(provInspector.subscribe, provInspector.getPin, () => null);
  const preference = useProvPreference();
  const pathname = usePathname();
  const params = useParams();
  const allowed = provPreferenceAllows(pathname, params);
  // Escape, in rungs: an open popover closes first; a second press disarms.
  // An Escape that closes an open menu or modal (the profile menu, a ⋮) is
  // theirs, so it never turns the switch off. A menu that heard it first has
  // closed by the time this runs (the switch turned on with the profile menu
  // open), so its `preventDefault` counts as the menu's claim (ui-jobs 651).
  useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (provInspector.getPin()) provInspector.unpin();
      else if (!document.querySelector(OPEN_OVERLAY)) putDownInspector();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [armed]);
  // Leaving the page puts the tool down.
  useEffect(() => () => provInspector.setArmed(false), []);
  // The preference arms each page view on arrival, on the routes that pass
  // the coverage gate; turned off, the inspector goes down. Values that mount
  // later are pickable as they land; the header indicator waits for the first
  // (ui-jobs 651).
  useEffect(() => {
    provInspector.setArmed(preference && allowed);
  }, [preference, allowed, pathname]);
  if (typeof document === "undefined" || !armed) return null;
  // Keyed per pick: a fresh mount per figure resets expansion + position.
  return pin ? <InspectorPopover key={`${pin.key}:${pin.tick}`} pin={pin} /> : null;
}

const INSPECTOR_TIP = "Click a figure to see where it comes from.";

/** The header's inspector indicator, H7.4 (ui-jobs 624.2, redrawn in 651):
 *  beside the profile control (H20), the teal crosshair, drawn only while the
 *  inspector is armed and the page has at least one traced value mounted
 *  (`provTraced`); otherwise nothing. It says the inspector is on and does
 *  nothing on a press: the profile menu's switch (H20.1) is the one way to
 *  turn it off. Focusable, with a tip on hover and keyboard focus in the house
 *  tooltip's look (RevealTip opens on a press, so this draws its own). */
export function ProvInspectorIndicator() {
  const armed = useSyncExternalStore(provInspector.subscribe, provInspector.getArmed, () => false);
  const traced = useSyncExternalStore(provTraced.subscribe, provTraced.getAny, () => false);
  if (!armed || !traced) return null;
  return (
    <span
      tabIndex={0}
      role="img"
      className="prov-inspect-on group"
      data-anatomy="H7.4"
      data-prov-inspect-on=""
      aria-label={`Inspector on. ${INSPECTOR_TIP}`}
    >
      <Crosshair className="prov-inspect-on-icon" strokeWidth={1.75} aria-hidden="true" />
      <span
        aria-hidden="true"
        data-prov-inspect-tip=""
        className="pointer-events-none invisible absolute right-0 top-full z-[var(--z-dropdown)] mt-2.5 w-max max-w-[min(20rem,calc(100vw-1.5rem))] whitespace-normal rounded-2xl border p-3 text-xs font-medium text-foreground opacity-0 shadow-lg transition-opacity duration-100 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
        style={{ background: "var(--rb-tooltip-bg)", borderColor: "var(--rb-tooltip-border)" }}
      >
        {INSPECTOR_TIP}
        <span
          className="absolute bottom-full right-3 -mb-[5px] size-2.5 rotate-45 border-l border-t"
          style={{ background: "var(--rb-tooltip-bg)", borderColor: "var(--rb-tooltip-border)" }}
        />
      </span>
    </span>
  );
}

const POP_WIDTH = 400;

function InspectorPopover({ pin }: { pin: ProvInspectorPin }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [sheet, setSheet] = useState(false);

  // While pinned, the figure holds the locator pill on every rendered
  // instance — the value and its popover read as the two ends of one
  // selection.
  useEffect(() => {
    const { registry, key } = pin;
    return locateEntries(() => registry.getEntries().filter((x) => entryKey(x) === key));
  }, [pin]);

  // Anchor to the clicked value; below it when there's room, above when not,
  // clamped inside the viewport. The card renders at its one full size, so
  // the measurement is final on the first pass — nothing later changes the
  // height and re-anchors it. Re-measured on scroll/resize (tracking the
  // anchor); an anchor that leaves the DOM (card re-render, route change)
  // closes the popover. Under 640px the content becomes a bottom sheet and
  // skips anchoring entirely.
  useLayoutEffect(() => {
    const update = () => {
      const small = window.matchMedia("(max-width: 639px)").matches;
      setSheet(small);
      if (small) return;
      const el = pin.el;
      if (!el.isConnected) {
        provInspector.unpin();
        return;
      }
      const r = el.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 240;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.min(Math.max(8, r.left), Math.max(8, vw - POP_WIDTH - 8));
      const below = r.bottom + 8;
      const top = below + h > vh - 8 ? Math.max(8, r.top - 8 - h) : below;
      setPos({ top, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [pin]);

  // Click-away closes the popover, not the mode — pointerdown, so a click on
  // the NEXT value first closes this popover, then pins the new one. A modal
  // opened from the popover (the ladder, compact notation) portals outside it
  // and is not away.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      if ((e.target as Element | null)?.closest?.('[aria-modal="true"]')) return;
      provInspector.unpin();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      className={`prov-inspect-pop${sheet ? " prov-inspect-sheet" : ""}`}
      style={sheet ? undefined : pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
      role="dialog"
      aria-label={`Provenance: ${receiptLabel(pin.entry.info)}`}
      data-prov-chrome=""
    >
      <ReceiptCard entry={pin.entry} onClose={() => provInspector.unpin()} />
    </div>,
    document.body,
  );
}

/** The popover's content: the receipt head (class dots, label, value, close)
 *  over the embedded receipt. Exported for /about/provenance, which draws a
 *  receipt from fixed example data in a static `.prov-inspect-pop` frame; there
 *  it has no close (`onClose` absent). */
export function ReceiptCard({
  entry: e,
  onClose,
}: {
  entry: Pick<ProvReceiptEntry, "info" | "value" | "display" | "symbol" | "source">;
  onClose?: () => void;
}) {
  // The class modal (LadderModal), opened from the head's class dots.
  const [ladderOpen, setLadderOpen] = useState(false);
  const { vcls, isComputed, leaves } = classifyValue(e.info);
  // The panel rows' bullet grammar: one dot per distinct class involved,
  // nearest the chain first.
  const involved = (() => {
    if (!isComputed) return [vcls];
    const cls = involvedClasses(leaves);
    return cls.length > 0 ? cls : [vcls];
  })();
  const involvedTitle =
    involved.length > 1
      ? `Computed from: ${involved.map((c) => CLASS_META[c]).join(" + ")}`
      : isComputed
        ? `Computed · ${CLASS_META[involved[0]]}`
        : CLASS_META[involved[0]];

  return (
    <>
      <div className="prov-inspect-head">
        <button
          type="button"
          className="prov-rrow-dots"
          title={`${involvedTitle}. ${LADDER_TITLE}`}
          aria-label={`${involvedTitle}. ${LADDER_TITLE}`}
          aria-haspopup="dialog"
          onClick={() => setLadderOpen(true)}
        >
          {involved.map((c) => (
            <span key={c} className={`prov-row-dot ${CLASS_CSS[c]}`} />
          ))}
        </button>
        <span className="prov-inspect-label">{receiptLabel(e.info)}</span>
        <span className="prov-inspect-value">
          {e.display}
          {/* a value that renders its own ticker (ExactSpan) already reads "… UNI" */}
          {e.symbol && !e.display.endsWith(` ${e.symbol}`) ? ` ${e.symbol}` : ""}
        </span>
        {onClose && (
          <button type="button" className="prov-inspect-close" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </button>
        )}
      </div>
      {/* The whole receipt, no second click: summary prose, via, formula,
          operand rows, coordinates — the embedded receipt (its trim already
          sheds the head's name clause). One card holds all the information,
          so the popover renders at its final height and never re-anchors. */}
      <div className="prov-inspect-body">
        <ProvReceipt embedded info={e.info} value={e.value} display={e.display} symbol={e.symbol} source={e.source} />
      </div>
      {ladderOpen && <LadderModal onClose={() => setLadderOpen(false)} />}
    </>
  );
}

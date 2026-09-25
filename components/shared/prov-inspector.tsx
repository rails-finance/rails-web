"use client";

// The provenance inspector tool — the page-level target mode.
// ----------------------------------------------------------------------------
// Two pieces, both talking to the `provInspector` store (provenance.tsx):
//
// - <ProvInspectorToggle> — the crosshair control that arms the tool. Arming
//   turns every scoped <Prov> on the page into a click target (dotted
//   underline = the coverage map). Two dresses: `dock`, the icon button in the
//   PriceStrip's leading slot, which is what the Market-type pages still
//   mount; and `menu`, a row of the Tools dropdown, which is where a position
//   or detail view now carries it.
// - <ProvInspectorLayer> — the armed halo + the popover. A pick anchors the
//   figure's WHOLE receipt at the clicked value: name + figure + class dots
//   (a button that opens the distance ladder) in the head, then the summary, via, formula, operand rows, and source
//   coordinates — one card, no second click, so it renders at its final
//   height and never re-anchors. Sticky mode: the popover moves pick to
//   pick; click-away closes the popover but keeps the tool armed; Escape
//   closes the popover first, then the mode. Under 640px the same content
//   renders as a bottom sheet instead of an anchored popover.
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
  CLASS_RANK,
  classifyValue,
  entryKey,
  LadderModal,
  locateEntries,
  provInspector,
  ProvReceipt,
  receiptLabel,
  resolveClass,
  type ProvInspectorPin,
} from "./provenance";
import { usePriceStripActive } from "@/components/shared/price-strip";

export function ProvInspectorToggle({
  variant = "dock",
  onPick,
}: {
  /** `dock` — the icon button in the PriceStrip's leading slot. `menu` — a row
   *  of the Tools dropdown, wearing that panel's title/subtitle shape. Same
   *  button, same class, so anything that reaches for the toggle finds one
   *  control on either surface. */
  variant?: "dock" | "menu";
  /** Called after the click, so the menu that holds the row can close. */
  onPick?: () => void;
}) {
  const armed = useSyncExternalStore(provInspector.subscribe, provInspector.getArmed, () => false);
  const label = armed ? "Exit the provenance inspector" : "Provenance inspector — click any value to trace it";
  const onClick = () => {
    provInspector.setArmed(!armed);
    onPick?.();
  };
  if (variant === "menu") {
    return (
      <button
        type="button"
        className="prov-inspect-toggle prov-inspect-toggle-menu"
        role="menuitem"
        aria-pressed={armed}
        aria-label={label}
        onClick={onClick}
      >
        <Crosshair aria-hidden />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">
            {armed ? "Stop inspecting" : "Inspect provenance"}
          </span>
          <span className="block text-xs text-rb-500">
            {armed ? "Click any value to trace it · esc exits" : "Click any value to trace where it came from"}
          </span>
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="prov-inspect-toggle"
      aria-pressed={armed}
      aria-label={label}
      title={armed ? "Exit the provenance inspector (Esc)" : "Provenance inspector — click any value to trace it"}
      onClick={onClick}
    >
      <Crosshair aria-hidden />
      {armed && <span className="prov-inspect-hint">click any value · esc exits</span>}
    </button>
  );
}

/** Mount once per page (beside the timeline, outside any card). Renders
 *  nothing at rest; owns the armed halo, its close control, the Escape ladder,
 *  and the pinned popover. */
export function ProvInspectorLayer() {
  const armed = useSyncExternalStore(provInspector.subscribe, provInspector.getArmed, () => false);
  const pin = useSyncExternalStore(provInspector.subscribe, provInspector.getPin, () => null);
  // Where the way out lives. A page with the dock still has the toggle in
  // sight, so the halo adds nothing; a page whose toggle is a row of a menu
  // that has since closed has no visible control at all, so the halo carries
  // its own.
  const dock = usePriceStripActive();
  // Escape, in rungs: an open popover closes first; a second press disarms.
  useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (provInspector.getPin()) provInspector.unpin();
      else provInspector.setArmed(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [armed]);
  // Leaving the page puts the tool down.
  useEffect(() => () => provInspector.setArmed(false), []);
  if (typeof document === "undefined" || !armed) return null;
  return (
    <>
      {/* The armed halo: the whole viewport wears the tool's teal while the
          inspector is on (the browser-extension "operating" treatment) —
          the mode state is unmistakable at any scroll position. Pointer-
          transparent chrome; sits under the popover. */}
      {createPortal(<div className="prov-inspect-halo" aria-hidden data-prov-chrome="" />, document.body)}
      {/* The halo's own way out, where nothing else on the page offers one. */}
      {!dock &&
        createPortal(
          <button
            type="button"
            className="prov-inspect-exit"
            data-prov-chrome=""
            onClick={() => provInspector.setArmed(false)}
          >
            <X aria-hidden />
            <span>Exit inspector</span>
          </button>,
          document.body,
        )}
      {/* Keyed per pick: a fresh mount per figure resets expansion + position. */}
      {pin && <InspectorPopover key={`${pin.key}:${pin.tick}`} pin={pin} />}
    </>
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

  // The distance ladder, opened from the head's class dots.
  const [ladderOpen, setLadderOpen] = useState(false);

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

  const e = pin.entry;
  const { vcls, isComputed, leaves } = classifyValue(e.info);
  // The panel rows' bullet grammar: one dot per distinct class involved,
  // nearest the chain first.
  const involved = (() => {
    if (!isComputed) return [vcls];
    const cls = [...new Set(leaves.map((l) => resolveClass(l.kind, l.pclass)))];
    cls.sort((a, b) => CLASS_RANK[a] - CLASS_RANK[b]);
    return cls.length > 0 ? cls : [vcls];
  })();
  const involvedTitle =
    involved.length > 1
      ? `Computed from: ${involved.map((c) => CLASS_META[c]).join(" + ")}`
      : isComputed
        ? `Computed · ${CLASS_META[involved[0]]}`
        : CLASS_META[involved[0]];

  return createPortal(
    <div
      ref={ref}
      className={`prov-inspect-pop${sheet ? " prov-inspect-sheet" : ""}`}
      style={sheet ? undefined : pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
      role="dialog"
      aria-label={`Provenance: ${receiptLabel(e.info)}`}
      data-prov-chrome=""
    >
      <div className="prov-inspect-head">
        <button
          type="button"
          className="prov-rrow-dots"
          title={`${involvedTitle} — what the colours mean`}
          aria-label={`${involvedTitle}. What the colours mean`}
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
          {e.symbol ? ` ${e.symbol}` : ""}
        </span>
        <button type="button" className="prov-inspect-close" onClick={() => provInspector.unpin()} aria-label="Close">
          <X aria-hidden />
        </button>
      </div>
      {/* The whole receipt, no second click: summary prose, via, formula,
          operand rows, coordinates — the embedded receipt (its trim already
          sheds the head's name clause). One card holds all the information,
          so the popover renders at its final height and never re-anchors. */}
      <div className="prov-inspect-body">
        <ProvReceipt embedded info={e.info} value={e.value} display={e.display} symbol={e.symbol} source={e.source} />
      </div>
      {ladderOpen && <LadderModal onClose={() => setLadderOpen(false)} />}
    </div>,
    document.body,
  );
}

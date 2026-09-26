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

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, ChevronDown, Wrench } from "lucide-react";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON } from "@/lib/shared/ui-grammar";
import { provInspector } from "@/components/shared/provenance";
import { ProvInspectorToggle } from "@/components/shared/prov-inspector";

/** One row of the Tools menu: icon, title, one line of subtitle. */
export function ToolsMenuItem({
  icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className="flex items-start gap-3 mx-1 my-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-[rgba(196,205,217,0.08)]"
    >
      <span className="mt-0.5 shrink-0 text-rb-500">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block text-xs text-rb-500">{subtitle}</span>
      </span>
    </button>
  );
}

export function ToolsMenu({
  ariaLabel,
  copied = false,
  children,
}: {
  /** What the caller's shapes act on, folded into the trigger's accessible
   *  name ("Tools: Export this position"). Absent on a menu that carries only
   *  the inspector. */
  ariaLabel?: string;
  /** Flash the trigger as the confirmation for a copy taken from the menu —
   *  the menu closes on action, so the trigger is where the answer lands. */
  copied?: boolean;
  /** The caller's rows, under the inspector. Handed the menu's close so a row
   *  can shut the panel when it acts. */
  children?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const armed = useSyncExternalStore(provInspector.subscribe, provInspector.getArmed, () => false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — mirrors the listing sort dropdown. While
  // the inspector is armed Escape belongs to the inspector's own ladder, which
  // is mounted on document too; closing this panel as well is harmless because
  // the panel is shut by the time a pick can be made.
  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    // `data-export-menu` stays on the wrapper: it is what the export verifiers
    // reach for, and this is still the element they mean.
    <div ref={ref} className="relative" data-export-menu data-tools-menu>
      <button
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
          <ChevronDown
            className={`h-3.5 w-3.5 text-rb-500 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          className="overlay-panel absolute right-0 top-full z-50 mt-2 min-w-[260px] overflow-hidden py-1"
          role="menu"
        >
          <ProvInspectorToggle variant="menu" onPick={() => setOpen(false)} />
          {children && (
            <>
              <div className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />
              {children(() => setOpen(false))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

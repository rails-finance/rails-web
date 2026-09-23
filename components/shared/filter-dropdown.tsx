"use client";

import { useState, useRef, useEffect } from "react";
import { Check } from "lucide-react";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON, COUNT_BADGE, RESET_LINK, OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { MobileSheet, MobileSheetFilterHeader } from "@/components/shared/mobile-sheet";
import {
  isOptionSearchable,
  narrowOptions,
  optionCapNote,
  OptionSearchInput,
  OptionSearchNote,
} from "@/components/shared/filter-bar/option-search";

// Lucide list-filter icon
function ListFilterIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

// Eye-with-cog "display settings" trigger glyph. Shared by every FilterDropdown
// used as a Display menu (timeline rows, Aave economics chart, etc.) so the
// header affordance reads identically across surfaces.
export function DisplaySettingsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M 14.831 13.09 C 14.831 14.112 14.334 15.226 13.672 15.886 C 13.011 16.548 11.896 17.045 10.876 17.045 C 9.855 17.045 8.741 16.548 8.08 15.886 C 7.419 15.225 6.921 14.111 6.921 13.09 C 6.921 12.069 7.419 10.955 8.08 10.294 C 8.742 9.633 9.856 9.136 10.876 9.136 C 11.897 9.136 13.012 9.633 13.672 10.294 C 14.334 10.956 14.831 12.07 14.831 13.09 Z M 12.274 11.692 C 11.862 11.28 11.493 11.113 10.876 11.113 C 10.259 11.113 9.89 11.28 9.478 11.692 C 9.066 12.105 8.899 12.473 8.899 13.09 C 8.899 13.707 9.066 14.076 9.478 14.488 C 9.89 14.901 10.259 15.068 10.876 15.068 C 11.493 15.068 11.862 14.901 12.274 14.488 C 12.686 14.076 12.853 13.707 12.853 13.09 C 12.853 12.473 12.686 12.105 12.274 11.692 Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M 23.709 6.05 C 23.918 6.554 23.679 7.133 23.173 7.341 L 23.034 7.398 C 23.061 7.573 23.075 7.747 23.075 7.918 C 23.075 8.098 23.059 8.282 23.029 8.466 L 23.153 8.518 C 23.657 8.726 23.896 9.306 23.688 9.81 C 23.479 10.314 22.9 10.553 22.395 10.345 L 22.272 10.293 C 22.161 10.448 22.041 10.588 21.916 10.714 C 21.793 10.836 21.656 10.953 21.506 11.062 L 21.57 11.216 C 21.778 11.72 21.539 12.298 21.035 12.508 C 20.531 12.717 19.952 12.477 19.743 11.973 L 19.681 11.825 C 19.494 11.856 19.305 11.872 19.12 11.872 C 18.949 11.872 18.775 11.858 18.601 11.832 L 18.542 11.973 C 18.334 12.477 17.754 12.717 17.25 12.508 C 16.746 12.299 16.507 11.72 16.715 11.216 L 16.769 11.087 C 16.606 10.971 16.455 10.846 16.324 10.714 C 16.198 10.588 16.08 10.447 15.968 10.292 L 15.844 10.344 C 15.34 10.552 14.762 10.313 14.553 9.808 C 14.344 9.304 14.584 8.725 15.089 8.517 L 15.211 8.466 C 15.181 8.282 15.165 8.098 15.165 7.918 C 15.165 7.741 15.18 7.561 15.209 7.381 L 15.11 7.34 C 14.605 7.132 14.366 6.552 14.575 6.048 C 14.783 5.544 15.363 5.304 15.867 5.513 L 15.961 5.552 C 16.075 5.393 16.196 5.249 16.324 5.122 C 16.449 4.996 16.59 4.877 16.744 4.766 L 16.693 4.642 C 16.484 4.138 16.723 3.559 17.227 3.35 C 17.732 3.141 18.31 3.38 18.52 3.885 L 18.571 4.008 C 18.755 3.979 18.939 3.963 19.12 3.963 C 19.301 3.963 19.485 3.979 19.669 4.008 L 19.72 3.885 C 19.929 3.38 20.508 3.141 21.012 3.35 C 21.516 3.558 21.756 4.138 21.547 4.642 L 21.496 4.766 C 21.65 4.876 21.79 4.996 21.916 5.122 C 22.047 5.253 22.173 5.403 22.29 5.567 L 22.418 5.514 C 22.922 5.305 23.501 5.545 23.709 6.05 Z M 19.132 5.911 C 18.017 5.911 17.114 6.814 17.114 7.928 C 17.114 9.043 18.017 9.946 19.132 9.946 C 20.246 9.946 21.15 9.043 21.15 7.928 C 21.15 6.814 20.246 5.911 19.132 5.911 Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M 17.185 19.145 C 16.481 19.597 15.713 19.97 14.912 20.258 C 14.094 20.573 13.253 20.79 12.408 20.903 C 8.642 21.404 4.395 19.882 1.666 16.474 C 1.066 15.686 0.284 14.085 0.263 14.044 C 0.248 14.023 0.233 14.002 0.218 13.98 C 0.216 13.981 0.213 13.982 0.211 13.983 C 0.203 13.964 0.194 13.946 0.186 13.927 C 0.161 13.881 0.138 13.833 0.12 13.782 C 0.067 13.597 0.042 13.359 0.042 13.12 C 0.042 12.849 0.074 12.574 0.134 12.364 C 0.216 12.174 0.303 11.988 0.394 11.805 C 1.378 9.786 2.877 8.116 4.562 7.036 C 5.266 6.584 6.034 6.211 6.835 5.922 C 7.653 5.608 8.494 5.39 9.34 5.278 C 10.365 5.141 11.427 5.155 12.483 5.315 L 12.483 5.322 C 12.971 5.362 13.356 5.77 13.356 6.269 C 13.356 6.769 12.971 7.177 12.483 7.217 L 12.483 7.24 C 11.988 7.169 11.486 7.136 10.98 7.139 C 10.942 7.154 10.904 7.162 10.864 7.162 C 10.448 7.16 10.039 7.183 9.637 7.231 C 9.625 7.233 9.613 7.234 9.601 7.236 C 9.311 7.275 9.024 7.324 8.742 7.385 C 7.653 7.627 6.618 8.065 5.632 8.699 C 4.021 9.733 2.774 11.113 1.978 13.093 C 1.993 13.13 2.008 13.166 2.023 13.202 C 2.16 13.493 2.382 13.959 2.526 14.208 C 2.744 14.585 2.968 14.921 3.234 15.269 C 5.183 17.918 7.918 19.06 10.767 19.04 C 10.805 19.026 10.843 19.018 10.883 19.018 C 11.299 19.02 11.709 18.997 12.11 18.948 C 12.122 18.946 12.135 18.945 12.147 18.943 C 12.436 18.905 12.723 18.855 13.006 18.795 C 14.094 18.553 15.129 18.115 16.115 17.481 C 17.36 16.682 18.387 15.677 19.157 14.348 C 19.164 14.357 19.172 14.366 19.179 14.374 C 19.264 13.924 19.66 13.585 20.134 13.585 C 20.671 13.585 21.106 14.02 21.106 14.557 C 21.106 14.698 21.075 14.832 21.021 14.954 C 21.029 14.957 21.038 14.961 21.047 14.964 C 20.071 16.719 18.705 18.171 17.185 19.145 Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export interface FilterOption {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** Rendered inline after the label (e.g. mechanic glyph) */
  suffix?: React.ReactNode;
  count?: number;
  /** Dimmed style for demoted/noisy actions */
  demoted?: boolean;
  /** Position status indicator dot */
  status?: "active" | "closed" | "liquidated";
  /** Greyed + non-interactive (the option has no effect in the current context). */
  disabled?: boolean;
  /** Tooltip shown on hover — used to explain why a disabled option is greyed. */
  title?: string;
}

interface FilterDropdownProps {
  label: string;
  options: FilterOption[];
  /** Selected key(s). For single-select: string | undefined. For multi-select: Set<string>. */
  selected: string | undefined | Set<string>;
  onSelect: (key: string | undefined) => void;
  /** Multi-select mode: toggles items individually. Single-select (default): picks one or clears. */
  multi?: boolean;
  /** For multi-select: callback to toggle a single key */
  onToggle?: (key: string) => void;
  /** Minimal mode: icon-only trigger, no "All" label, no × clear button. For opt-in toggles like Visibility. */
  minimal?: boolean;
  /** Hide the clear/× button and prevent deselecting the current value */
  noClear?: boolean;
  /** Custom trigger content — replaces the default button. Receives open state. */
  trigger?: (isOpen: boolean) => React.ReactNode;
  /** Panel alignment relative to trigger. Default "left" (opens right). Use "right" when trigger sits at the right edge. */
  align?: "left" | "right";
  /** Override the default list-filter icon shown in minimal/multi mode. */
  triggerIcon?: React.ReactNode;
  /** Visual variant. `'ghost'` (default) is the compact text-only trigger. `'button'` is a larger trigger with a dark surface — for top-of-section toolbars. */
  variant?: "ghost" | "button";
  /** Render option labels exactly as given, skipping the per-word title-casing
   *  below. For a menu whose labels are TOKEN SYMBOLS: the casing rule keeps a
   *  fully-capitalised word (USDC, DAI) but rewrites every mixed-case one, and
   *  a token symbol's mixed case is its NAME — wstETH would read "Wsteth",
   *  cbBTC "Cbbtc", weETH "Weeth". */
  verbatimLabels?: boolean;
  /** A one-line readout pinned under the heading of the PHONE sheet only —
   *  the toolbar's own count line, say, which the sheet covers. The sheet is
   *  a live filter (every tap re-settles the list behind it), so the figure
   *  that answers each tap belongs inside the sheet where the thumb is.
   *  Desktop ignores it: there the dropdown floats beside the count. */
  sheetStatus?: React.ReactNode;
}

export function FilterDropdown({
  label,
  options,
  selected,
  onSelect,
  multi = false,
  onToggle,
  minimal = false,
  noClear = false,
  trigger,
  align = "left",
  triggerIcon,
  variant = "ghost",
  verbatimLabels = false,
  sheetStatus,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  // Type-to-filter text for a long option list (see filter-bar/option-search).
  // Menu-local, cleared on every open/close so the menu always opens whole.
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const isPhone = useMediaQuery(PHONE_QUERY);

  useEffect(() => {
    setQuery("");
  }, [open]);

  // Close on click outside. Skipped in sheet mode: the sheet's portal content
  // renders under document.body, outside `ref` entirely, so this effect would
  // read every tap inside the sheet as an outside click and close it on
  // contact — the backdrop is the sheet's own "click away to close".
  useEffect(() => {
    if (!open || isPhone) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [open, isPhone]);

  // Normalize selected into a set for rendering
  const selectedSet = selected instanceof Set ? selected : selected ? new Set([selected]) : new Set<string>();
  const allKeys = options.map((o) => o.key);
  // Multi-select callers pass `selected` as the explicit set of *shown* keys, so
  // "all" means every key is present — NOT the empty set. Treating size 0 as
  // "all" (the old shortcut) painted every row checked + an "All" label + no
  // Reset when the user had actually filtered *everything* out, stranding them
  // with 0 events and no way back. Empty now reads correctly as "none shown".
  const isAll = multi ? selectedSet.size === allKeys.length : selectedSet.size === 0;

  // Build trigger label: "All", or "X, Y, and N more" when many selected
  const selectedLabels = (() => {
    if (isAll) return "All";
    const labels = options.filter((o) => selectedSet.has(o.key)).map((o) => o.label);
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")}, and ${labels.length - 2} more`;
  })();

  // Type-to-filter, past the shared threshold. `isSelected` deliberately reads
  // false while every option is selected (a multi menu at rest): nothing is
  // being hidden then, so pinning the whole list would make the input inert.
  const searchable = isOptionSearchable(options.length);
  const narrowed = searchable ? narrowOptions(options, query, (o) => !isAll && selectedSet.has(o.key)) : null;
  const shownOptions = narrowed ? [...narrowed.matched, ...narrowed.alsoSelected] : options;

  function handleItemClick(key: string) {
    if (multi && onToggle) {
      onToggle(key);
    } else {
      // Single-select: toggle (select or deselect if already selected)
      if (noClear && selectedSet.has(key)) {
        setOpen(false);
        return;
      }
      onSelect(selectedSet.has(key) ? undefined : key);
      setOpen(false);
    }
  }

  function handleClear() {
    onSelect(undefined);
  }

  return (
    <div ref={ref} className={`relative ${trigger ? "flex items-center" : "inline-flex items-center"}`}>
      {trigger ? (
        <div onClick={() => setOpen(!open)} className="cursor-pointer hover:opacity-80 transition-opacity">
          {trigger(open)}
        </div>
      ) : (
        <>
          <button
            onClick={() => setOpen(!open)}
            // The trigger is icon-only in `minimal` and `multi` modes, so the
            // label is its ONLY accessible name — without it a screen reader
            // announces "button" for both the event-type and asset controls,
            // and nothing on the page distinguishes them. It doubles as the
            // durable hook a verifier can select on, which a presentational
            // class never is.
            aria-label={label}
            aria-expanded={open}
            aria-haspopup="listbox"
            className={`${CTRL_GHOST} ${open || (!isAll && !minimal) ? CTRL_ON : CTRL_OFF} ${
              variant === "button" ? "h-7 gap-2 px-2.5 rounded-md text-xs" : "gap-1.5 px-2 py-1 rounded text-xs"
            }`}
          >
            {(minimal || multi) && (triggerIcon ?? <ListFilterIcon size={12} />)}
            {!minimal &&
              !isAll &&
              !multi &&
              (() => {
                const sel = options.find((o) => selectedSet.has(o.key));
                return sel?.icon ? <span className="shrink-0">{sel.icon}</span> : null;
              })()}
            {!minimal &&
              (multi && !isAll ? (
                <span className={COUNT_BADGE}>{selectedSet.size}</span>
              ) : (
                <span className="max-w-[240px] truncate">{selectedLabels}</span>
              ))}
            {!minimal &&
              !isAll &&
              !multi &&
              (() => {
                const sel = options.find((o) => selectedSet.has(o.key));
                return sel?.suffix ? <span className="shrink-0">{sel.suffix}</span> : null;
              })()}
            {!minimal && (
              <svg
                width={10}
                height={10}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            )}
          </button>
        </>
      )}

      {open &&
        (isPhone ? (
          // A live sheet, not a modal one: the list behind re-settles on every
          // tap and must stay legible, so no blur, a faint scrim, half the
          // viewport at most. The shared sheet heading (label, Reset, the
          // caller's count line) pins above the scrolling rows so a long menu
          // never scrolls it away.
          <MobileSheet
            label={label}
            mode="live"
            onClose={() => setOpen(false)}
            header={
              <MobileSheetFilterHeader
                label={label}
                status={sheetStatus}
                onReset={!isAll && !minimal && !noClear ? handleClear : undefined}
              />
            }
          >
            {renderList()}
          </MobileSheet>
        ) : (
          renderPanel()
        ))}
    </div>
  );

  // The desktop dropdown's heading row (label + Reset). The phone sheet's is
  // `MobileSheetFilterHeader`, shared with the date-range sheet; the Reset
  // condition here and there must stay the same.
  function renderHeading() {
    return (
      <div className="flex items-center justify-between px-4 py-3">
        {label && <span className={OVERLAY_HEADING}>{label}</span>}
        {!isAll && !minimal && !noClear && (
          <button onClick={() => handleClear()} className={RESET_LINK}>
            Reset
          </button>
        )}
      </div>
    );
  }

  // Divider + optional search + option rows + search notes — the scrolling
  // half of the panel, shared byte-for-byte by the dropdown and the sheet.
  function renderList() {
    return (
      <>
        <div className="my-1 mx-3 border-t border-rb-300 dark:border-rb-700" />
        {searchable && (
          <OptionSearchInput value={query} onChange={setQuery} autoFocus={!isPhone} onEscape={() => setOpen(false)} />
        )}
        {shownOptions.map((opt) => {
          const checked = minimal
            ? selectedSet.has(opt.key)
            : multi
              ? isAll || selectedSet.has(opt.key)
              : selectedSet.has(opt.key);
          return (
            <button
              key={opt.key}
              onClick={() => {
                if (!opt.disabled) handleItemClick(opt.key);
              }}
              aria-disabled={opt.disabled || undefined}
              title={opt.title}
              className={`overlay-item ${opt.disabled ? "opacity-50 cursor-not-allowed" : ""} ${
                !multi && checked ? "overlay-item-active text-foreground" : opt.demoted && !checked ? "" : ""
              }`}
            >
              {multi && (
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors shrink-0 ${
                    checked ? "bg-rb-500" : "border-2 border-rb-400 dark:border-rb-600"
                  }`}
                >
                  {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>
              )}
              {opt.icon && <span className="shrink-0">{opt.icon}</span>}
              <span className="flex-1 truncate">
                {verbatimLabels
                  ? opt.label
                  : opt.label
                      .split(/(\s+)/)
                      .map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
                      .join("")}
                {opt.suffix && <span className="inline-flex ml-1.5 align-middle">{opt.suffix}</span>}
              </span>
              {opt.count != null && <span className="">{opt.count}</span>}
            </button>
          );
        })}
        {narrowed && shownOptions.length === 0 && <OptionSearchNote>No options match.</OptionSearchNote>}
        {narrowed && narrowed.hiddenMatches > 0 && (
          <OptionSearchNote>{optionCapNote(narrowed.matched.length, narrowed.matchCount)}</OptionSearchNote>
        )}
      </>
    );
  }

  // Desktop/tablet: the absolutely positioned dropdown, unchanged. Below
  // `sm` the same heading + list render inside a MobileSheet instead (see the
  // `open &&` branch above) — the sheet's own bg-raised + shadow-xl is the
  // surface, so only the overlay-panel border/shadow is dropped, not the content.
  function renderPanel() {
    return (
      <div
        className={`absolute top-full ${align === "right" ? "right-0" : "left-0"} mt-1 z-50 min-w-[220px] max-h-[320px] overflow-y-auto overlay-panel`}
      >
        {renderHeading()}
        {renderList()}
      </div>
    );
  }
}

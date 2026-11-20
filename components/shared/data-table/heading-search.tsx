"use client";

// A roster's search in its name column's heading (anatomy D10; rails-ops
// decision 0070, ui-jobs 786). From sm a roster has no search row: the name
// heading ("Protocol", "Asset") carries a magnifier button; pressing it, or
// "/" anywhere outside a field, turns the heading into an input labelled with
// the column's name, which filters as the reader types. Escape, or the ×,
// clears it and gives the heading back, focus on the magnifier. Left with a
// query, the heading shows the query and a × so it stays in sight; pressing
// the query opens the input again.
//
// Below sm a stacked table (D6) draws no heading; the page draws one plain
// search in its control row instead.

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export interface HeadingSearchProps {
  /** The column's name: "Protocol". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** A hook for the verifiers: `data-heading-search=<name>`. */
  name: string;
  /** "/" opens it (one heading search per page). */
  slash?: boolean;
}

const BUTTON =
  "inline-flex items-center rounded-sm cursor-pointer text-rb-500 transition-colors hover:text-foreground focus-ring";

export function HeadingSearch({ label, value, onChange, name, slash = true }: HeadingSearchProps) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const stateId = useId();

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (!slash) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // Only where the heading is drawn (from sm).
      if (!opener.current && !input.current) return;
      if (!(opener.current ?? input.current)?.getClientRects().length) return;
      e.preventDefault();
      setEditing(true);
    };
    // In the capture phase, ahead of the site's "/" (useSlashToSearch, which
    // stands aside for a press already handled): the page's own search first.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [slash]);

  const clear = () => {
    onChange("");
    setEditing(false);
    // The magnifier is drawn again on the next paint.
    requestAnimationFrame(() => opener.current?.focus());
  };

  if (editing)
    return (
      <span ref={wrap} className="inline-flex items-center gap-1" data-heading-search={name} data-anatomy="D10">
        <Search className="size-3.5 shrink-0 text-rb-500" aria-hidden />
        <input
          ref={input}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              clear();
            }
          }}
          // Focus moving to the × keeps the input, so Tab reaches it.
          onBlur={(e) => {
            if (!wrap.current?.contains(e.relatedTarget as Node | null)) setEditing(false);
          }}
          aria-label={label}
          placeholder={label}
          className="w-36 min-w-0 rounded-sm border-b border-rb-300 bg-transparent py-0.5 text-xs font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-rb-400 focus:border-blue-500 dark:border-rb-600 [&::-webkit-search-cancel-button]:hidden"
          data-heading-search-input=""
        />
        <button
          type="button"
          aria-label={`Clear the ${label.toLowerCase()} search`}
          // Before the input's blur, so the press lands.
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
          onBlur={(e) => {
            if (!wrap.current?.contains(e.relatedTarget as Node | null)) setEditing(false);
          }}
          className={`${BUTTON} p-0.5`}
          data-heading-search-clear=""
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </span>
    );

  return (
    <span className="inline-flex items-center gap-1" data-heading-search={name} data-anatomy="D10">
      {/* One button named by the column ("Protocol"; with a query, "Protocol:
          aave"), what it does in its description. */}
      <button
        ref={opener}
        type="button"
        onClick={() => setEditing(true)}
        aria-describedby={stateId}
        aria-keyshortcuts={slash ? "/" : undefined}
        className={`${BUTTON} gap-1 ${value ? "font-semibold text-foreground" : ""}`}
        data-heading-search-open=""
      >
        {value ? (
          <>
            <Search className="size-3.5 shrink-0 text-rb-500" aria-hidden />
            <span className="sr-only">{label}: </span>
            <span className="max-w-32 truncate" data-heading-search-query="">
              {value}
            </span>
          </>
        ) : (
          <>
            {label}
            <Search className="size-3.5 shrink-0" aria-hidden />
          </>
        )}
      </button>
      <span id={stateId} className="sr-only">
        {value ? "Searched. Press to edit the search." : "Press to search this column."}
      </span>
      {value && (
        <button
          type="button"
          aria-label={`Clear the ${label.toLowerCase()} search`}
          onClick={clear}
          className={`${BUTTON} p-0.5`}
          data-heading-search-clear=""
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}

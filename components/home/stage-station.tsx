"use client";

import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** The rail's stations, one open at a time (Miles, 5 Nov 2026): opening one
 *  shuts the one that was open, and a press on the open one shuts it. */
const OpenStation = createContext<{ open: string | null; toggle: (id: string) => void; lineId: string } | null>(null);

/** The stations and the line under the rail that says what the open one does.
 *  Every line is laid in the same grid cell, the shut ones invisible, so the
 *  band stands at the tallest line's height at every width: opening a
 *  station fills space already held and moves nothing (the cards, the
 *  connectors, the closing line). With none open it says how to open one. */
export function StationGroup({ lines, children }: { lines: { id: string; line: ReactNode }[]; children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const lineId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <OpenStation.Provider value={{ open, toggle: (id) => setOpen((o) => (o === id ? null : id)), lineId }}>
      {children}
      <div id={lineId} className="mt-6 grid text-center" aria-live="polite" data-station-lines="">
        <p
          className={`body-text col-start-1 row-start-1 text-rb-500 ${open ? "invisible" : ""}`}
          aria-hidden={open != null}
        >
          Press a stage to see what it does.
        </p>
        {lines.map(({ id, line }) => (
          <p
            key={id}
            className={`body-text col-start-1 row-start-1 text-foreground ${open === id ? "" : "invisible"}`}
            aria-hidden={open !== id}
            data-station-line={id}
          >
            {line}
          </p>
        ))}
      </div>
    </OpenStation.Provider>
  );
}

/** One station of the StageRail (components/home/stage-rail.tsx): the whole
 *  card is one button (glyph, heading, chevron); a press opens its line in
 *  the band under the rail (StationGroup), so the cards keep their height and
 *  the connectors their place (Miles, 5 Nov 2026). Escape shuts it. The
 *  chevron turns without motion under reduced motion. */
export function Station({
  id,
  icon,
  eyebrow,
  className,
  accent,
}: {
  /** The key of its line in StationGroup's `lines`. */
  id: string;
  /** The station's glyph, drawn by the rail (a component can't cross from the
   *  server rail into this client card). */
  icon: ReactNode;
  eyebrow: string;
  className?: string;
  /** The station the whole rail exists to reach: a blue border + soft blue
   *  glow (the reference mock's treatment), the same hue as the track that
   *  runs into it. */
  accent?: boolean;
}) {
  const group = useContext(OpenStation);
  const open = group?.open === id;
  return (
    <li className={`relative ${className ?? ""}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={group?.lineId}
        onClick={() => group?.toggle(id)}
        className={`relative z-[1] flex h-full w-full cursor-pointer items-center gap-2 rounded-xl border bg-raised px-4 py-3 text-left transition-colors focus-ring lg:min-h-[4.25rem] ${
          accent
            ? "border-blue-400 shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_0_28px_-2px_rgba(59,130,246,0.35)] dark:border-blue-500 dark:shadow-[0_0_0_1px_rgba(59,130,246,0.4),0_0_32px_-2px_rgba(59,130,246,0.5)]"
            : `hover:border-rb-400 dark:hover:border-rb-600 ${open ? "border-rb-400 dark:border-rb-600" : "border-rb-200 dark:border-rb-800"}`
        }`}
        data-station-toggle={id}
      >
        {icon}
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-foreground lg:text-sm" data-station-eyebrow="">
          {eyebrow}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-rb-500 transition-transform duration-200 motion-reduce:transition-none ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
    </li>
  );
}

"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** One station of the StageRail (components/home/stage-rail.tsx): its heading
 *  at rest, a button that opens its line under it (Miles, 5 Nov 2026). Each
 *  station opens on its own; the rail's connectors meet the card's centre,
 *  however tall it stands. The chevron turns without motion under reduced
 *  motion; the line itself appears without animation. */
export function Station({
  icon,
  eyebrow,
  children,
  className,
  accent,
}: {
  /** The station's glyph, drawn by the rail (a component can't cross from the
   *  server rail into this client card). */
  icon: ReactNode;
  eyebrow: string;
  children: ReactNode;
  className?: string;
  /** The station the whole rail exists to reach: a blue border + soft blue
   *  glow (the reference mock's treatment), the same hue as the track that
   *  runs into it. */
  accent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <li className={`relative ${className ?? ""}`}>
      <div
        className={`relative z-[1] flex h-full flex-col justify-center rounded-xl border bg-raised ${
          // At rest every card stands one height, the chain station's
          // two-line name included (lg's 1fr column wraps it).
          open ? "" : "lg:min-h-[4.25rem]"
        } ${
          accent
            ? "border-blue-400 shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_0_28px_-2px_rgba(59,130,246,0.35)] dark:border-blue-500 dark:shadow-[0_0_0_1px_rgba(59,130,246,0.4),0_0_32px_-2px_rgba(59,130,246,0.5)]"
            : "border-rb-200 dark:border-rb-800"
        }`}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-left focus-ring"
          data-station-toggle=""
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
        <p id={bodyId} hidden={!open} className="body-text -mt-1 px-4 pb-3">
          {children}
        </p>
      </div>
    </li>
  );
}

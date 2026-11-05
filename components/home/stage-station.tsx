"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/** The rail's stations, one open at a time (Miles, 5 Nov 2026): opening one
 *  returns the open one to its heading, and a press on the open one returns
 *  it. The open station's text is read out through one polite live region. */
const OpenStation = createContext<{
  open: string | null;
  toggle: (id: string, line: string) => void;
  close: (id: string) => void;
} | null>(null);

export function StationGroup({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ id: string; line: string } | null>(null);
  return (
    <OpenStation.Provider
      value={{
        open: open?.id ?? null,
        toggle: (id, line) => setOpen((o) => (o?.id === id ? null : { id, line })),
        close: (id) => setOpen((o) => (o?.id === id ? null : o)),
      }}
    >
      {children}
      <p className="sr-only" aria-live="polite" data-station-live="">
        {open?.line ?? ""}
      </p>
    </OpenStation.Provider>
  );
}

/** How long a station's text stays: 250 ms a word, never under 6 s. */
export const snakeMs = (line: string) => Math.max(6000, line.trim().split(/\s+/).length * 250);

/** The border as one path from the middle of the left edge round the box
 *  clockwise and back, so the line withdraws into that point. Drawn in the
 *  box's pixel size with the corner radius, `pathLength` 1. */
function borderPath(w: number, h: number, r: number): string {
  const x0 = 0.5;
  const y0 = 0.5;
  const x1 = w - 0.5;
  const y1 = h - 0.5;
  const rr = Math.min(r, (w - 1) / 2, (h - 1) / 2);
  const mid = h / 2;
  return [
    `M ${x0} ${mid}`,
    `V ${y0 + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x0 + rr} ${y0}`,
    `H ${x1 - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x1} ${y0 + rr}`,
    `V ${y1 - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x1 - rr} ${y1}`,
    `H ${x0 + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x0} ${y1 - rr}`,
    `Z`,
  ].join(" ");
}

/** One station of the StageRail (components/home/stage-rail.tsx), one button.
 *  At rest its heading, centred; a press swaps in what the station does, in
 *  the same box, and a teal line runs the whole border, then withdraws round
 *  it into the middle of the left edge (one CSS animation of
 *  stroke-dashoffset over `snakeMs`); when it has gone the heading is back.
 *  Hovering or focusing the box holds the line, and the text. Under reduced
 *  motion the line stands still and the text stays until a press. The box is
 *  sized to the longer of its heading and its text, both laid in one grid
 *  cell, so the swap moves nothing. */
export function Station({
  id,
  icon,
  eyebrow,
  line,
  className,
  accent,
}: {
  id: string;
  /** The station's glyph, drawn by the rail (a component can't cross from the
   *  server rail into this client card). */
  icon: ReactNode;
  eyebrow: string;
  /** What the station does, swapped in for the heading. */
  line: string;
  className?: string;
  /** The station the whole rail exists to reach: a blue border + soft blue
   *  glow (the reference mock's treatment), the same hue as the track that
   *  runs into it. */
  accent?: boolean;
}) {
  const group = useContext(OpenStation);
  const open = group?.open === id;
  const box = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new open starts the line from full.
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (open) setRun((n) => n + 1);
  }, [open]);

  return (
    <li className={`relative ${className ?? ""}`}>
      <button
        ref={box}
        type="button"
        aria-pressed={open}
        onClick={() => group?.toggle(id, line)}
        className={`relative z-[1] grid h-full w-full cursor-pointer place-items-center rounded-xl border bg-raised px-4 py-3 transition-colors focus-ring ${
          accent
            ? "border-blue-400 shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_0_28px_-2px_rgba(59,130,246,0.35)] dark:border-blue-500 dark:shadow-[0_0_0_1px_rgba(59,130,246,0.4),0_0_32px_-2px_rgba(59,130,246,0.5)]"
            : "border-rb-200 hover:border-rb-400 dark:border-rb-800 dark:hover:border-rb-600"
        }`}
        style={{ "--snake-ms": `${snakeMs(line)}ms` } as CSSProperties}
        data-station-toggle={id}
        data-snake-ms={snakeMs(line)}
      >
        <span
          className={`col-start-1 row-start-1 flex items-center justify-center gap-2 text-center ${open ? "invisible" : ""}`}
          aria-hidden={open}
        >
          {icon}
          <span className="text-[15px] font-semibold text-foreground lg:text-sm" data-station-eyebrow="">
            {eyebrow}
          </span>
        </span>
        <span
          className={`body-text col-start-1 row-start-1 text-center ${open ? "" : "invisible"}`}
          aria-hidden={!open}
          data-station-line={id}
        >
          {line}
        </span>
        {open && size && (
          <svg
            key={run}
            aria-hidden="true"
            className="pointer-events-none absolute -inset-px overflow-visible text-teal-700 dark:text-teal-400"
            width={size.w + 2}
            height={size.h + 2}
          >
            <path
              d={borderPath(size.w + 2, size.h + 2, 13)}
              pathLength={1}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray="1 1"
              className="station-snake"
              onAnimationEnd={() => group?.close(id)}
              data-station-snake=""
            />
          </svg>
        )}
      </button>
    </li>
  );
}

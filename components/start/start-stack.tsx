"use client";

// The /start question stack (G1; rails-ops ui-jobs 478): every level from the
// top of the tree down to the current step on one page. An answered level is
// drawn small, its cards title only, the chosen one in teal with a down-arrow
// badge on its bottom edge; its siblings stay pressable and replace everything
// below. The current question is drawn full size; at a leaf the page's own
// content (results, roster, learn) sits under the last answered level.
//
// Colour (color-grammar.md §4c): teal is a press that changes this page (an
// answer), blue a link to another page. Below 640px an answered level is one
// line: the question, the answer in teal, and "Change", which opens that
// level's cards in place.
//
// Each step is a URL. The stack lives in the /start layout and reads the path,
// so the levels above stay mounted as the reader answers; the page under it
// draws only the leaf. Answers navigate without scrolling to the top, and the
// stack brings the new level into view (smoothly, or at once with reduced motion).

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDown } from "lucide-react";
import { StartCard, startGridCols } from "@/components/start/start-card";
import { LearnContent } from "@/components/start/learn-content";
import { START_HREF, leavesStart, optionHref, optionIcons, resolveStartPath, type Level } from "@/lib/start/tree";

const TEAL_TEXT = "text-teal-600 dark:text-teal-400";
const TEAL_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:focus-visible:ring-teal-400";

export function StartStack({ children }: { children: ReactNode }) {
  const path = (usePathname() ?? START_HREF).replace(/\/$/, "");
  const root = useRef<HTMLDivElement>(null);
  useScrollToCurrent(path, root);
  const r = resolveStartPath(path.split("/").slice(2).filter(Boolean));
  // A path the tree does not hold: the page answers it with a 404.
  if (!r) return <>{children}</>;
  const { levels } = r;
  const hasLeaf = r.leaf != null;
  return (
    <div ref={root} data-anatomy="G1" data-start-step={path}>
      {levels.map((level, i) =>
        !hasLeaf && i === levels.length - 1 ? (
          <CurrentLevel key={level.base} level={level} />
        ) : (
          <AnsweredLevel key={`${level.base}|${level.chosen}`} level={level} />
        ),
      )}
      {hasLeaf && <section data-start-current="">{children}</section>}
    </div>
  );
}

/** The gap left above a scrolled-to heading: a little air, plus the header
 *  bar's height where it stays on screen (fixed or sticky). */
const SCROLL_AIR = 16;

function stickyHeaderHeight(): number {
  const header = document.querySelector<HTMLElement>('header[data-anatomy~="H2"]');
  if (!header) return 0;
  const { position } = getComputedStyle(header);
  return position === "fixed" || position === "sticky" ? header.getBoundingClientRect().height : 0;
}

/** When the path changes below the top level, settle with the top of the new
 *  current step (its question heading, the learn sections or the results
 *  heading) at the top of the view. The first draw, a refresh and /start
 *  itself do not scroll: the top level shows the whole page from the top
 *  (Miles, 4 Nov 2026; ui-jobs 496). */
function useScrollToCurrent(path: string, root: RefObject<HTMLDivElement | null>) {
  // The path last settled, not a first-run flag: React's dev double effect
  // would read a flag as a path change on mount.
  const settled = useRef(path);
  useEffect(() => {
    if (settled.current === path) return;
    settled.current = path;
    const stack = root.current;
    if (!stack) return;
    // A short step cannot scroll its heading to the top; the stack takes the
    // room it lacks as bottom padding, until the next step is drawn.
    stack.style.paddingBottom = "";
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (path === START_HREF) {
      window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
      return;
    }
    const el = document.querySelector<HTMLElement>("[data-start-current]");
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - stickyHeaderHeight() - SCROLL_AIR;
    // Measured again after each step: the body's min-h-screen takes up the
    // first of the padding on a page shorter than the view (the app shell's
    // footer is short; ui-jobs 496), so one pass can leave the step short.
    let padding = 0;
    for (let pass = 0; pass < 4; pass++) {
      const lacking = top - (document.documentElement.scrollHeight - window.innerHeight);
      if (lacking <= 0) break;
      padding += Math.ceil(lacking);
      stack.style.paddingBottom = `${padding}px`;
    }
    window.scrollTo({ top: Math.max(0, top), behavior: still ? "auto" : "smooth" });
  }, [path, root]);
}

/** The top of the tree ("Not sure where to start?"), drawn without its question. */
const isTop = (level: Level) => level.base === START_HREF;

function CurrentLevel({ level }: { level: Level }) {
  const { intro } = level;
  return (
    <>
      {/* An intro takes the scroll target, so the reader lands on it first. */}
      {intro === "learn" && (
        <div className="mb-14" data-start-current="">
          <LearnContent />
        </div>
      )}
      <CurrentQuestion level={level} target={!intro} />
    </>
  );
}

function CurrentQuestion({ level, target }: { level: Level; target: boolean }) {
  const { node } = level;
  return (
    <section data-start-current={target ? "" : undefined} data-start-level={level.base}>
      {/* The top level draws no question: its cards sit under the page's
          intro (G7), and the home link carries the phrase. */}
      <h2
        className={
          isTop(level)
            ? "sr-only"
            : "mb-8 font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,44px)]"
        }
      >
        {node.question}
      </h2>
      <div className={`grid grid-cols-1 gap-3 ${startGridCols(node.options.length)}`}>
        {node.options.map((o) => (
          <StartCard
            key={o.slug}
            href={optionHref(level.base, o)}
            title={o.label}
            line={o.line}
            tone={leavesStart(o) ? "page" : "answer"}
            icons={optionIcons(o)}
          />
        ))}
      </div>
    </section>
  );
}

function AnsweredLevel({ level }: { level: Level }) {
  const { node, chosen } = level;
  const [open, setOpen] = useState(false);
  const picked = node.options.find((o) => o.slug === chosen);
  const listId = `start-level-${level.base.replace(/\//g, "-")}`;
  return (
    <section aria-label={node.question} data-start-answered={level.base}>
      {/* From 640px: the muted question over title-only cards. */}
      <div className="mb-10 hidden sm:block">
        {!isTop(level) && <h3 className="mb-3 text-lg font-normal text-rb-500">{node.question}</h3>}
        <div className={`grid grid-cols-1 gap-3 ${startGridCols(node.options.length)}`}>
          {node.options.map((o) => (
            <AnswerCard key={o.slug} href={optionHref(level.base, o)} label={o.label} chosen={o.slug === chosen} />
          ))}
        </div>
      </div>
      {/* Below 640px: one line, the answer in teal and "Change". */}
      <div className="mb-3 flex flex-col items-center sm:hidden">
        <div className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          {!isTop(level) && <span className="text-rb-500">{node.question}</span>}
          <span className={`font-medium ${TEAL_TEXT}`} aria-current="step">
            {picked?.label}
          </span>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            className={`ml-auto rounded text-xs font-semibold ${TEAL_TEXT} hover:text-teal-500 cursor-pointer ${TEAL_RING}`}
            data-start-change=""
          >
            Change
          </button>
        </div>
        {open && (
          <div id={listId} className="mt-2 grid w-full grid-cols-1 gap-2">
            {node.options.map((o) => (
              <AnswerCard
                key={o.slug}
                href={optionHref(level.base, o)}
                label={o.label}
                chosen={o.slug === chosen}
                compact
              />
            ))}
          </div>
        )}
        <ArrowDown className={`mt-1 h-4 w-4 ${TEAL_TEXT}`} strokeWidth={2.5} aria-hidden="true" />
      </div>
    </section>
  );
}

/** An answered level's card: the title alone. The chosen one is teal with the
 *  down-arrow badge on its bottom edge, joining it to the level below; a
 *  sibling rests muted, with no arrow, and lifts on hover. */
function AnswerCard({
  href,
  label,
  chosen,
  compact = false,
}: {
  href: string;
  label: string;
  chosen: boolean;
  compact?: boolean;
}) {
  const state = chosen
    ? `border-teal-600 dark:border-teal-400 bg-teal-500/15 ${TEAL_TEXT}`
    : "border-rb-200 dark:border-rb-600 bg-raised text-rb-500 hover:text-foreground hover:border-teal-600 dark:hover:border-teal-400";
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={chosen ? "step" : undefined}
      data-start-answer={chosen ? "chosen" : ""}
      className={`relative block rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors duration-150 ${state} ${TEAL_RING}`}
    >
      {label}
      {chosen && !compact && (
        <span
          className="absolute left-1/2 -bottom-3 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full bg-teal-600 text-white ring-4 ring-background dark:bg-teal-500"
          aria-hidden="true"
        >
          <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      )}
    </Link>
  );
}

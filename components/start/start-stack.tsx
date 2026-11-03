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

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDown } from "lucide-react";
import { StartCard, startGridCols } from "@/components/start/start-card";
import { LearnContent } from "@/components/start/learn-content";
import { START_HREF, leavesStart, optionHref, resolveStartPath, type Level } from "@/lib/start/tree";

const TEAL_TEXT = "text-teal-600 dark:text-teal-400";
const TEAL_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:focus-visible:ring-teal-400";

export function StartStack({ children }: { children: ReactNode }) {
  const path = (usePathname() ?? START_HREF).replace(/\/$/, "");
  useScrollToCurrent(path);
  const r = resolveStartPath(path.split("/").slice(2).filter(Boolean));
  // A path the tree does not hold: the page answers it with a 404.
  if (!r) return <>{children}</>;
  const { levels } = r;
  const hasLeaf = r.leaf != null;
  return (
    <div data-anatomy="G1" data-start-step={path}>
      {levels.map((level, i) =>
        !hasLeaf && i === levels.length - 1 ? (
          <CurrentLevel key={level.base} level={level} />
        ) : (
          <AnsweredLevel key={`${level.base}|${level.chosen}`} level={level} />
        ),
      )}
      {hasLeaf && (
        <section className="scroll-mt-24" data-start-current="">
          {children}
        </section>
      )}
    </div>
  );
}

/** Bring the current level into view when the path changes (not on the first draw). */
function useScrollToCurrent(path: string) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = document.querySelector<HTMLElement>("[data-start-current]");
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }, [path]);
}

function CurrentLevel({ level }: { level: Level }) {
  const { intro } = level;
  return (
    <>
      {/* An intro takes the scroll target, so the reader lands on it first. */}
      {intro === "learn" && (
        <div className="mb-14 scroll-mt-24" data-start-current="">
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
    <section className="scroll-mt-24" data-start-current={target ? "" : undefined} data-start-level={level.base}>
      <h2 className="mb-8 font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,44px)]">
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
        <h3 className="mb-3 text-lg font-normal text-rb-500">{node.question}</h3>
        <div className={`grid grid-cols-1 gap-3 ${startGridCols(node.options.length)}`}>
          {node.options.map((o) => (
            <AnswerCard key={o.slug} href={optionHref(level.base, o)} label={o.label} chosen={o.slug === chosen} />
          ))}
        </div>
      </div>
      {/* Below 640px: one line, the answer in teal and "Change". */}
      <div className="mb-3 flex flex-col items-center sm:hidden">
        <div className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span className="text-rb-500">{node.question}</span>
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

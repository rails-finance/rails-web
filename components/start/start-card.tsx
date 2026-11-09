// The question card of the guided way in (rails-ops ui-jobs 478): a title, one
// plain line and an arrow, the whole card one link, on the current question
// of the /start stack (G1).
//
// Its hover and arrow follow what a press does (color-grammar.md §4c): on
// /start an answer that opens the next question in the stack is teal with a
// down arrow centred at its foot (`answer`), one that lands on another page
// takes NAV_BUTTON's blue border and a blue right arrow (`page`).

import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";

const START_CARD_FRAME =
  "rounded-xl border border-rb-200 bg-raised text-left dark:border-rb-600 transition-colors duration-150";

type StartCardTone = "answer" | "page";

const TONE: Record<StartCardTone, { card: string; arrow: string }> = {
  answer: {
    card: "hover:border-teal-600 dark:hover:border-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:focus-visible:ring-teal-400",
    arrow:
      "self-center text-rb-500 group-hover:translate-y-0.5 group-hover:text-teal-600 group-focus-visible:text-teal-600 dark:group-hover:text-teal-400 dark:group-focus-visible:text-teal-400",
  },
  page: {
    card: "hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
    arrow: "self-end text-blue-600 dark:text-[var(--text-link)] group-hover:translate-x-0.5",
  },
};

export function StartCard({
  href,
  title,
  line,
  tone,
  icons = [],
}: {
  href: string;
  title: string;
  line: string;
  tone: StartCardTone;
  /** Tokens drawn under the line, overlapping (ui-jobs 525). */
  icons?: string[];
}) {
  const t = TONE[tone];
  return (
    <Link
      href={href}
      // An answer opens the next question below; the stack scrolls it into view.
      scroll={tone === "answer" ? false : undefined}
      data-start-card=""
      className={`group flex min-h-[9.5rem] flex-col p-4 ${START_CARD_FRAME} ${t.card}`}
    >
      <span className="text-base font-semibold text-foreground">{title}</span>
      <span className="mt-1 text-sm text-rb-500">{line}</span>
      {icons.length > 0 && (
        <span className="mt-3 flex -space-x-1.5" aria-hidden="true" data-start-card-icons="">
          {icons.map((sym) => (
            <span key={sym} className="rounded-full ring-2 ring-[var(--surface-raised)]">
              <TokenChipIcon symbol={sym} size={24} filterable={false} untitled />
            </span>
          ))}
        </span>
      )}
      {tone === "answer" ? (
        <ArrowDown className={`mt-auto h-4 w-4 transition-transform duration-150 ${t.arrow}`} aria-hidden="true" />
      ) : (
        <ArrowRight className={`mt-auto h-4 w-4 transition-transform duration-150 ${t.arrow}`} aria-hidden="true" />
      )}
    </Link>
  );
}

/** The grid class for a row of `n` cards: one column on phones. */
export function startGridCols(n: number): string {
  if (n === 5) return "sm:grid-cols-2 lg:grid-cols-5";
  if (n >= 4) return "sm:grid-cols-2 lg:grid-cols-4";
  if (n === 2) return "sm:grid-cols-2";
  return "sm:grid-cols-3";
}

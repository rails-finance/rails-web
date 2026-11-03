// The question card of the guided way in (rails-ops ui-jobs 478): a title, one
// plain line and an arrow, the whole card one link. The home hero's first
// question (S11) and every /start step (G1) draw the same card, so the first
// question and the later ones read as one tool.

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

/** The card's frame, shared with the wallets card (S11.1). */
export const START_CARD_FRAME =
  "rounded-xl border border-rb-200 bg-raised text-left dark:border-rb-600 transition-colors duration-150";

export function StartCard({ href, title, line }: { href: string; title: string; line: string }) {
  return (
    <Link
      href={href}
      data-start-card=""
      className={`group flex min-h-[9.5rem] flex-col p-4 hover:border-[var(--marketing)] focus-visible:border-[var(--marketing)] focus-visible:outline-none ${START_CARD_FRAME}`}
    >
      <span className="text-base font-semibold text-foreground">{title}</span>
      <span className="mt-1 text-sm text-rb-500">{line}</span>
      <ArrowRight
        className="mt-auto h-4 w-4 self-end text-rb-500 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--marketing)]"
        aria-hidden="true"
      />
    </Link>
  );
}

/** The cards in a grid: one column on phones, `columns` from sm. */
export function StartCardGrid({
  children,
  columns = 3,
  className = "",
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return <div className={`grid grid-cols-1 gap-3 ${cols} ${className}`}>{children}</div>;
}

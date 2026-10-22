"use client";

// A read's freshness in H6's form (components/shared/recency-stamp.tsx): the
// age of the read behind the block-and-clock icon, or its block behind the
// cube, a press switching the two, the choice shared with H6 for the browser.
// H6 states the chain head; this states one family read on the wallet view
// (rails-ops decision 0050, point 8). With only a block, it shows the block.
// The age reads "1 min" with no "ago": the glyph carries the meaning, and the
// accessible name keeps the full words (ui-jobs 429).

import { useEffect, useState, type MouseEvent } from "react";
import { Box } from "lucide-react";
import { BlockClockIcon } from "@/components/icons/block-clock-icon";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";

const READING_KEY = "rails.recency-reading";

export function compactAge(seconds: number): string {
  if (seconds < 60) return "< 1 min";
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr`;
  return `${Math.floor(hr / 24)} d`;
}

export function ReadStamp({
  block,
  at,
  label = "Read",
  inLink = false,
}: {
  block?: number;
  at?: number;
  /** The accessible name's first word ("Updated 1 min ago"). */
  label?: string;
  /** Inside a card's link: a press toggles the reading and does not open the card. */
  inLink?: boolean;
}) {
  const [reading, setReading] = useState<"age" | "block">("age");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem(READING_KEY) === "block") setReading("block");
    } catch {}
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const showAge = at != null && (reading === "age" || block == null);
  // The age waits for the mount: the server's clock is not the reader's.
  const age = at != null && now != null ? compactAge(Math.max(0, now / 1000 - at)) : null;
  const blockText = block != null ? block.toLocaleString("en-US") : null;
  const text = showAge ? age : blockText;
  if (text == null) return null;
  const Icon = showAge ? BlockClockIcon : Box;
  const toggle = (e: MouseEvent) => {
    if (inLink) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (at == null || block == null) return;
    const next = reading === "age" ? "block" : "age";
    setReading(next);
    try {
      localStorage.setItem(READING_KEY, next);
    } catch {}
  };
  return (
    <button
      type="button"
      data-anatomy="H6"
      data-read-block={block}
      onClick={toggle}
      aria-label={`${label} ${[age ? `${age} ago` : null, blockText ? `at block ${blockText}` : null].filter(Boolean).join(", ")}`}
      className={`${CTRL_GHOST} ${CTRL_OFF} h-7 gap-1.5 rounded-md px-1.5 text-[11px] tabular-nums`}
    >
      <Icon size={12} aria-hidden />
      <span aria-hidden>{text}</span>
    </button>
  );
}

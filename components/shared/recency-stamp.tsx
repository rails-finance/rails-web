"use client";

// Recency stamp — decision 0006's freshness signal on the live/current surfaces.
// "▣ 2 min": how long ago the latest block of the ROUTE'S OWN CHAIN was
// minted, so staleness is legible and the user can judge whether a reload is
// worth it (the reload IS the refresh — no button). The age ticks client-side
// off the block timestamp; the head only re-pulls on focus / reload.
// Fail-soft: renders nothing when the chain head is unavailable.
//
// Two readings, switched by a press on the stamp: the age ("3 min", behind
// the block-and-clock icon) or the block number ("11,932,361", behind the
// cube). The choice holds across pages for this browser. The copy-for-LLM exports carry the block
// number from the page's own data (lib/<proto>/position-to-markdown.ts).
// The age carries no "ago": the block-and-clock glyph says it, and the
// accessible name keeps the full words (ui-jobs 429).

import { useEffect, useState } from "react";
import { Box } from "lucide-react";
import { BlockClockIcon } from "@/components/icons/block-clock-icon";
import { useChainHead } from "@/hooks/useChainHead";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";

// Compact age for the 11px stamp: "< 1 min" / "5 min" / "3 hr" / "2 d".
// Deliberately NOT lib/date's formatDuration — that is shared by 35 call sites
// (event cards, timelines) at a fuller register ("less than a minute", "N hrs");
// rewording it to suit this stamp would silently rewrite all of them.
function formatCompactAge(elapsedMs: number): string {
  const s = Math.floor(elapsedMs / 1000);
  if (s < 60) return "< 1 min";
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr`;
  return `${Math.floor(hr / 24)} d`;
}

type Reading = "age" | "block";
const READING_KEY = "rails.recency-reading";

function storedReading(): Reading {
  try {
    return localStorage.getItem(READING_KEY) === "block" ? "block" : "age";
  } catch {
    return "age";
  }
}

/** `compact` drops the cube below sm, for the detail pages' top row, which
 *  carries back, this stamp, the labelled prices trigger and Tools across
 *  390px. */
export function RecencyStamp({ className, compact = false }: { className?: string; compact?: boolean }) {
  const head = useChainHead();
  // Re-render every 30s so the age stays current without re-fetching.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  // "age" on the server render; the stored choice lands after mount.
  const [reading, setReading] = useState<Reading>("age");
  useEffect(() => setReading(storedReading()), []);
  const toggle = () => {
    const next = reading === "age" ? "block" : "age";
    setReading(next);
    try {
      localStorage.setItem(READING_KEY, next);
    } catch {}
  };

  if (!head) return null;
  const age = formatCompactAge(Date.now() - head.blockTimestamp * 1000);
  const block = head.blockNumber.toLocaleString("en-US");

  const showAge = reading === "age";
  const Icon = showAge ? BlockClockIcon : Box;

  return (
    <button
      type="button"
      data-anatomy="H6"
      onClick={toggle}
      aria-label={`Chain head minted ${age} ago, block ${block}. Press to show the ${showAge ? "block number" : "age"}.`}
      // The control grammar: the stamp reads as pressable. Same height and
      // radius as the price trigger beside it, one type size down.
      className={className ?? `${CTRL_GHOST} ${CTRL_OFF} h-7 gap-1.5 rounded-md px-1.5 text-[11px] tabular-nums`}
    >
      <Icon size={12} aria-hidden className={compact ? "hidden sm:block" : undefined} />
      <span aria-hidden>{showAge ? age : block}</span>
    </button>
  );
}

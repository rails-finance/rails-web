"use client";

// A card heading that explains itself on hover or tap: the shared RevealTip
// around the heading's text, with a dotted underline to show there is more.
// Without a tip it is the plain text, so a card that passes none is unchanged.

import type { ReactNode } from "react";
import { RevealTip } from "@/components/shared/reveal-tip";

export function TipLabel({ text, tip }: { text: string; tip?: string }) {
  if (!tip) return <>{text}</>;
  return (
    <RevealTip tip={tip} label={`${text}: ${tip}`} focusable wrap className="focus-ring rounded-sm">
      <span className="underline decoration-dotted decoration-rb-400 underline-offset-2">{text}</span>
    </RevealTip>
  );
}

/** A heading or row label that opens its read-more (Miles, 14 Oct 2026: the
 *  term is explained in place, on a press; the learn-more modal keeps the
 *  in-depth reading). A faint dotted underline in the label's colour cues it.
 *  Without a tip it is the plain label. `name` is its accessible name where
 *  the label is not text. */
export function HeadingTip({ text, tip, name }: { text: ReactNode; tip?: ReactNode; name?: string }) {
  if (!tip) return <>{text}</>;
  const called = name ?? (typeof text === "string" ? text : "");
  return (
    <RevealTip
      tip={<span className="block w-64 max-w-[calc(100vw-48px)] whitespace-normal leading-snug">{tip}</span>}
      label={`${called}, explain`}
      focusable
      className="focus-ring rounded-sm"
    >
      <span
        className="underline decoration-current/40 decoration-dotted decoration-1 underline-offset-[3px]"
        data-heading-tip=""
      >
        {text}
      </span>
    </RevealTip>
  );
}

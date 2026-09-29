"use client";

// A card heading that explains itself on hover or tap: the shared RevealTip
// around the heading's text, with a dotted underline to show there is more.
// Without a tip it is the plain text, so a card that passes none is unchanged.

import { RevealTip } from "@/components/shared/reveal-tip";

export function TipLabel({ text, tip }: { text: string; tip?: string }) {
  if (!tip) return <>{text}</>;
  return (
    <RevealTip tip={tip} label={`${text}: ${tip}`} focusable className="focus-ring rounded-sm">
      <span className="underline decoration-dotted decoration-rb-400 underline-offset-2">{text}</span>
    </RevealTip>
  );
}

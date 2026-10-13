"use client";

// A label row's "?": opens its read-more on a click or a tap, inside the label
// cell so the value columns keep their place. The "?" is drawn by CSS, so a
// row's text reads as its label alone. The event sheet's rows and the
// position card's panel rows draw it.

import { RevealTip } from "@/components/shared/reveal-tip";

export function RowHelp({ tip, name }: { tip: string; name: string }) {
  return (
    <RevealTip
      className="ml-1 align-baseline"
      tip={<span className="block w-64 max-w-[calc(100vw-48px)] whitespace-normal leading-snug">{tip}</span>}
    >
      <button
        type="button"
        data-sheet-help=""
        aria-label={`About ${name}`}
        className="inline-flex size-4 items-center justify-center rounded-full border border-rb-300 text-[10px] font-semibold leading-none text-rb-500 before:content-['?'] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-rb-600"
      />
    </RevealTip>
  );
}

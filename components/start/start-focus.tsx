"use client";

// /start under Focus (ui-jobs 557): the coin chips, the pairs and a coin's or
// a pair's cards show only where their symbols are in focus
// (components/shared/in-focus-symbol.tsx); a step outside it says so.

import { openFocusPanel, useAssetScope } from "@/lib/shared/asset-scope";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";

export { InFocusSymbol } from "@/components/shared/in-focus-symbol";

export function StartOutOfFocus({ what }: { what: string }) {
  const scope = useAssetScope();
  return (
    <p className="text-sm text-rb-500" data-start-out-of-focus="">
      {what} is outside your focus ·{" "}
      <button
        type="button"
        onClick={() => openFocusPanel("edit")}
        className={`font-semibold ${INPLACE_TEXT}`}
        disabled={!scope.ready}
      >
        Change focus
      </button>
    </p>
  );
}

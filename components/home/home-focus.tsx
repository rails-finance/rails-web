"use client";

// The home page under Focus (ui-jobs 557): the live example shows only where
// its trove's assets are in focus, and the covered figures, which count all
// of Rails, say so.

import type { ReactNode } from "react";
import { InFocusSymbol } from "@/components/shared/in-focus-symbol";
import { useAssetScope } from "@/lib/shared/asset-scope";

export function HomeFocusExample({ symbols, children }: { symbols: string[]; children: ReactNode }) {
  return <InFocusSymbol symbols={symbols}>{children}</InFocusSymbol>;
}

export function HomeFocusFiguresNote() {
  const scope = useAssetScope();
  if (!scope.on) return null;
  return (
    <p className="mx-auto mb-3 max-w-7xl px-4 text-center text-xs text-rb-500 md:px-6" data-home-figures-unfiltered="">
      These figures are for all of Rails.
    </p>
  );
}

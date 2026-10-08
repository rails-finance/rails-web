// A USD figure for a dollar stablecoin off par: the figure, in the caution
// orange where the price sits beyond DEPEG_BAND, and the price after it
// ("$1,049,500 at $0.987"). The rule is `offPar` (lib/shared/usd-display.ts).

import type { ReactNode } from "react";
import type { OffPar } from "@/lib/shared/usd-display";

export const OFF_PAR_BAND = "text-tone-caution";

export function OffParFigure({ off, children }: { off: OffPar | null | undefined; children: ReactNode }) {
  if (!off) return <>{children}</>;
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className={off.band ? OFF_PAR_BAND : undefined} data-usd-off-par={off.band ? "band" : "price"}>
        {children}
      </span>
      <span className="font-normal text-rb-500" data-usd-off-par-price="">
        {off.text}
      </span>
    </span>
  );
}

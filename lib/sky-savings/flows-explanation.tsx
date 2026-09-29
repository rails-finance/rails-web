// T3 for Sky Savings Lifetime flows: the bar's figures in plain words, in USDS.

import type { ReactNode } from "react";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatCompact } from "@/lib/utils/format";
import { units } from "@/lib/sky-savings/math";
import type { SkyLifetimeTotals } from "@/lib/sky-savings/flows";
import type { SkyPosition } from "@/lib/sky-savings/types";

export function skyFlowsExplanation(p: SkyPosition, totals: SkyLifetimeTotals | null): ReactNode {
  const f = (raw: bigint | string) => formatCompact(units(raw));
  const inRaw = BigInt(p.usdsIn.raw);
  const outRaw = BigInt(p.usdsOut.raw);
  const items: ReactNode[] = [
    <>
      <H>{f(inRaw)} USDS</H> came in
      {totals && totals.received > BigInt(0) ? ", counting shares received at their worth on arrival," : ""} and{" "}
      <H>{f(outRaw)} USDS</H> left.
    </>,
  ];
  if (p.value)
    items.push(
      <>
        <H>{f(p.value.raw)} USDS</H> is still held.
      </>,
    );
  if (p.earned)
    items.push(
      <>
        The difference, <H>{f(p.earned.raw)} USDS</H>, is the interest earned. It grew inside the shares, and no
        transaction moved it, so the bar draws it dashed.
      </>,
    );
  items.push(<>On the dollar axis one USDS is valued at the PSM rate, one USDC for the whole life of sUSDS.</>);
  return <ProseExplainer items={items} />;
}

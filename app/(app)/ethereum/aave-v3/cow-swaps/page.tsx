// focus: the swaps behind the info page's CoW figures, family-wide as the figures are; the shell's gate stands over the explorer
// The swaps behind the CoW figures on the Aave V3 info page (components/protocol/cow/cow-aave-swaps-view.tsx).

import { Suspense } from "react";
import type { Metadata } from "next";
import { CowAaveSwapsView } from "@/components/protocol/cow/cow-aave-swaps-view";

export const metadata: Metadata = {
  title: "Aave V3 swaps via CoW Protocol",
  alternates: { canonical: "/ethereum/aave-v3/cow-swaps" },
};

export default function CowSwapsPage() {
  return (
    <Suspense>
      <CowAaveSwapsView family="aave-v3" />
    </Suspense>
  );
}

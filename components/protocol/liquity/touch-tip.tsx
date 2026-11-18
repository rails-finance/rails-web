"use client";

// The word "touch" with its read-more (lib/liquity-v2/touch-words.ts), in the
// house tooltip: a dotted underline, opened on a press.

import { HeadingTip } from "@/components/shared/tip-label";
import { DEPOSIT_TOUCH_TIP } from "@/lib/liquity-v2/touch-words";

export function DepositTouchTip({ word = "touch" }: { word?: string }) {
  return <HeadingTip text={word} tip={DEPOSIT_TOUCH_TIP} />;
}

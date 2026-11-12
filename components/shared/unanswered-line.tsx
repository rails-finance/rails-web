// A page's failed-read line, or the daily read ceiling's line in its place when the
// route refused at the ceiling (lib/shared/read-ceiling.ts; rails-ops decisions/0061).
// The ceiling's line carries `data-read-ceiling`; the caller's data hooks stay on both.

import type { ReactNode } from "react";
import { READ_CEILING_LINE } from "@/lib/shared/read-ceiling";

type DataHooks = { [k: `data-${string}`]: string | undefined };

export function UnansweredLine({
  ceiling,
  className = "text-sm text-rb-500",
  children,
  ...hooks
}: { ceiling: boolean; className?: string; children: ReactNode } & DataHooks) {
  return (
    <p className={className} data-read-ceiling={ceiling ? "" : undefined} {...hooks}>
      {ceiling ? READ_CEILING_LINE : children}
    </p>
  );
}

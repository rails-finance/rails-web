"use client";

// Drop-in shell-mount probe for the §3.4 settle waterfall (lib/perf/
// settle-marks.ts). Mount it from a route layout: its first effect firing
// means the bundle streamed, hydration ran, and the RSC payload applied —
// the point where "skeleton" ends and the mount fetches can begin.

import { useEffect } from "react";
import { settleMark } from "@/lib/perf/settle-marks";

export function SettleShellMark() {
  useEffect(() => {
    settleMark("shell-mounted");
  }, []);
  return null;
}

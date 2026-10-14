"use client";

// A duration from a past moment to now, stated after the browser mounts. The
// server and the first browser render both draw the same invisible placeholder
// (same width, so nothing moves), because a cached page's server time can be
// hours old by hydration. See hooks/useMountedNow.

import { useMountedNow } from "@/hooks/useMountedNow";
import { formatAgeShort, formatDuration } from "@/lib/date";

export function MountedAge({
  from,
  prefix = "",
  suffix = "",
  short = false,
}: {
  /** Unix seconds. */
  from: number;
  prefix?: string;
  suffix?: string;
  /** The short scale ("41 mins", `formatAgeShort`). */
  short?: boolean;
}) {
  const now = useMountedNow();
  if (now == null)
    return (
      <span className="invisible">
        {prefix}00 days{suffix}
      </span>
    );
  return (
    <>
      {prefix}
      {short ? formatAgeShort(from, now) : formatDuration(from, now)}
      {suffix}
    </>
  );
}

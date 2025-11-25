"use client";

import type { TimelineEvent } from "@/types/pulse";
import { Avatar } from "../shared/Avatar";

export function Handle({
  handle,
  className = "",
  platform,
  avatarSize,
}: {
  handle: string;
  className?: string;
  platform?: TimelineEvent["platform"];
  avatarSize?: number;
}) {
  return (
    <span className={`font-medium text-xs text-slate-500 dark:text-slate-500 transition-colors inline-flex items-center gap-1 ${className}`}>
      {platform && avatarSize && <Avatar handle={handle} platform={platform} size={avatarSize} />}
      {handle}
    </span>
  );
}

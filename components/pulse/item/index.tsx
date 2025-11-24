"use client";

import type { TimelineEvent } from "@/types/pulse";
import { PulseIcon } from "./PulseIcon";
import { PulseContent } from "./PulseContent";

interface TimelineItemProps {
  event: TimelineEvent;
  isFirst?: boolean;
  isLast?: boolean;
}

export function PulseTimelineItem({
  event,
  isFirst = false,
  isLast = false,
}: TimelineItemProps) {
  return (
    <li className="flex w-full gap-3 flex-row items-stretch">
      <div className="flex flex-1 items-stretch gap-3 ">
        <PulseIcon event={event} isFirst={isFirst} isLast={isLast} className="" />
        <div className="flex-1">
          <PulseContent event={event} />
        </div>
      </div>
    </li>
  );
}

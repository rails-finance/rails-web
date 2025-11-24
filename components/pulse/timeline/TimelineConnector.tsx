"use client";

import type { TimelineEvent } from "@/types/pulse";

// Core Rails handles - anything else is third-party and gets a dotted line
const RAILS_HANDLES = ["rails_finance", "rails.finance", "slvdev", "milodonid"];

function isThirdParty(author?: string): boolean {
  if (!author) return false;
  const normalized = author.toLowerCase().replace(/^@/, "");
  return !RAILS_HANDLES.includes(normalized);
}

export function isDashedConnector(event: TimelineEvent): boolean {
  return isThirdParty(event.author);
}

const CONNECTOR_COLOR_CLASS = "text-slate-300 dark:text-[#30343F]";

export function TimelineConnector({
  event,
  isFirst,
  isLast,
}: {
  event: TimelineEvent;
  isFirst: boolean;
  isLast: boolean;
}) {
  const dashed = isDashedConnector(event);
  const showTopConnection = !isFirst;
  const showBottomConnection = !isLast;

  if (!showTopConnection && !showBottomConnection) {
    return (
      <div className={`relative h-full ${CONNECTOR_COLOR_CLASS}`}>
        <svg width="4" height="32" className="timeline-line">
          <line x1="2" y1="0" x2="2" y2="32" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (dashed) {
    const dotSpacing = 8.2;
    const dotRadius = 2;

    return (
      <svg width="4" height="100%" className={`timeline-line ${CONNECTOR_COLOR_CLASS}`} style={{ overflow: "visible" }}>
        <defs>
          <pattern
            id={`dots-${event.id}`}
            x="0"
            y={dotRadius}
            width="4"
            height={dotSpacing}
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy={dotSpacing / 2} r={dotRadius} fill="currentColor" />
          </pattern>
        </defs>
        <line
          x1="2"
          y1={showTopConnection ? "0%" : "0"}
          x2="2"
          y2={showBottomConnection ? "100%" : "20"}
          stroke={`url(#dots-${event.id})`}
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <div className={`relative h-full ${CONNECTOR_COLOR_CLASS}`}>
      <svg width="4" height="100%" viewBox="0 0 4 100" preserveAspectRatio="none" className="timeline-line">
        <line
          x1="2"
          y1={showTopConnection ? "0%" : "0"}
          x2="2"
          y2={showBottomConnection ? "100%" : "20"}
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

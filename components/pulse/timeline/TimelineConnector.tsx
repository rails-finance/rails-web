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

// A hairline at the width of the position timeline spine (spine-column.tsx,
// w-px): rb-400 light / rb-500 at 70% dark. (Was a one-off dark hex,
// off-grammar; then rb-700, which read too close to the rb-800 dark canvas to
// be visible, TO-DO-ui-jobs #44.)
const CONNECTOR_COLOR_CLASS = "text-rb-400 dark:text-rb-500/70";

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
        <svg width="1" height="32" className="timeline-line">
          <line x1="0.5" y1="0" x2="0.5" y2="32" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>
    );
  }

  if (dashed) {
    const dotSpacing = 6;
    const dotRadius = 0.5;

    return (
      <svg width="1" height="100%" className={`timeline-line ${CONNECTOR_COLOR_CLASS}`} style={{ overflow: "visible" }}>
        <defs>
          <pattern
            id={`dots-${event.id}`}
            x="0"
            y={dotRadius}
            width="1"
            height={dotSpacing}
            patternUnits="userSpaceOnUse"
          >
            <circle cx="0.5" cy={dotSpacing / 2} r={dotRadius} fill="currentColor" />
          </pattern>
        </defs>
        <line
          x1="0.5"
          y1={showTopConnection ? "0%" : "0"}
          x2="0.5"
          y2={showBottomConnection ? "100%" : "20"}
          stroke={`url(#dots-${event.id})`}
          strokeWidth="1"
        />
      </svg>
    );
  }

  return (
    <div className={`relative h-full ${CONNECTOR_COLOR_CLASS}`}>
      <svg width="1" height="100%" viewBox="0 0 1 100" preserveAspectRatio="none" className="timeline-line">
        <line
          x1="0.5"
          y1={showTopConnection ? "0%" : "0"}
          x2="0.5"
          y2={showBottomConnection ? "100%" : "20"}
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

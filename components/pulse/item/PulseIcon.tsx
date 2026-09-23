"use client";

import type { TimelineEvent } from "@/types/pulse";
import { TimelineConnector } from "../timeline/TimelineConnector";

const XIcon = ({ className = "size-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <path d="M21.742 21.75l-7.563-11.179 7.056-8.321h-2.456l-5.691 6.714-4.54-6.714H2.359l7.29 10.776L2.25 21.75h2.456l6.035-7.118 4.818 7.118h6.191-.008zM7.739 3.818L18.81 20.182h-2.447L5.29 3.818h2.447z" />
  </svg>
);

const GitHubIcon = ({ className = "size-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

/** Rails wordmark glyph — the abstract linear "R", neutral, inherits currentColor.
 *  Mirrors the mark in `components/nav/header-bar.tsx`. */
const RailsMark = ({ className = "size-6" }: { className?: string }) => (
  <svg viewBox="0 0 200 200" fill="currentColor" aria-hidden="true" className={className}>
    <path
      style={{ opacity: 0.85 }}
      d="M 79.763 159.671 L 111.637 159.671 L 52.168 41.625 L 20.295 41.625 L 79.763 159.671 Z"
    />
    <path
      style={{ opacity: 0.85 }}
      d="M 98.578 97.056 L 130.451 97.056 L 105.044 47.853 L 73.171 47.853 L 98.578 97.056 Z"
    />
    <path d="M 148.892 142.388 L 180.766 142.388 L 155.359 93.185 L 123.486 93.185 L 148.892 142.388 Z" />
  </svg>
);

/** The single spine glyph an entry refers to: an explicit icon (protocol logo)
 *  if provided, otherwise the source application's mark. Author identity lives
 *  in the post content (the Handle avatar), so the spine stays a clean badge. */
function SpineGlyph({ event }: { event: TimelineEvent }) {
  if (event.iconUrl) {
    return <img src={event.iconUrl} alt="" className="h-full w-full object-cover" loading="lazy" />;
  }
  switch (event.platform) {
    case "x":
      return <XIcon className="size-5 text-foreground" />;
    case "github":
      return <GitHubIcon className="size-5 text-foreground" />;
    default:
      return <RailsMark className="size-6 text-foreground dark:text-white" />;
  }
}

export function PulseIcon({
  event,
  isFirst,
  isLast,
}: {
  event: TimelineEvent;
  isFirst: boolean;
  isLast: boolean;
  className?: string;
}) {
  const connectorStyle = isLast ? { display: "none" } : { height: "calc(100% + 3.5rem)" };

  return (
    <div className="relative flex h-full mr-2 sm:mr-4 md:mr-6 shrink-0 flex-col items-center">
      <div
        className="absolute left-1/2 top-0 -z-10 flex h-full w-1 -translate-x-1/2 justify-center text-rb-300 dark:text-rb-700"
        style={connectorStyle}
      >
        <TimelineConnector event={event} isFirst={isFirst} isLast={isLast} />
      </div>

      <div className="relative z-20 flex size-10 items-center justify-center overflow-hidden rounded-full border border-rb-200 bg-white dark:border-rb-700 dark:bg-rb-900">
        <SpineGlyph event={event} />
      </div>
    </div>
  );
}

"use client";

import { AppWindow, Globe, Share2, UsersRound, File } from "lucide-react";
import type { TimelineEvent } from "@/types/pulse";
import { Avatar } from "../shared/Avatar";
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

const platformIcons = {
  x: XIcon,
  farcaster: Share2,
  medium: File,
  blog: File,
  app: AppWindow,
  internal: UsersRound,
  github: GitHubIcon,
  other: Globe,
};

export function PulseIcon({
  event,
  isFirst,
  isLast,
  className = "",
}: {
  event: TimelineEvent;
  isFirst: boolean;
  isLast: boolean;
  className?: string;
}) {
  const PlatformIcon = platformIcons[event.platform] ?? Globe;
  const connectorStyle = isLast ? { display: "none" } : { height: "calc(100% + 3.5rem)" };

  return (
    <div className={`relative flex h-full mr-2 sm:mr-4 md:mr-6 shrink-0 flex-col items-center `}>
      <div
        className="absolute left-1/2 top-0 -z-10 flex h-full w-1 -translate-x-1/2 justify-center text-slate-300 dark:text-[#30343F]"
        style={connectorStyle}
      >
        <TimelineConnector event={event} isFirst={isFirst} isLast={isLast} />
      </div>

      {event.postUrl ? (
        <a href={event.postUrl} target="_blank" rel="noreferrer" className="relative z-20">
          <div className="relative flex size-full justify-center">
            <div className="relative flex items-center justify-center">
              <Avatar
                handle={event.author}
                platform={event.platform}
                size={40}
                className="border border-slate-200 dark:border-slate-500"
              />
            </div>
            <div className="absolute bottom-0 -right-4 flex size-6 items-center justify-center rounded-full border-2 border-white bg-white text-slate-700 dark:border-slate-900 dark:bg-slate-900 dark:text-white">
              <PlatformIcon className="size-3.5" />
              <span className="sr-only">{event.platform}</span>
            </div>
          </div>
        </a>
      ) : (
        <div className="relative z-20">
          <div className="relative flex size-full justify-center">
            <div className="relative flex items-center justify-center">
              <Avatar
                handle={event.author}
                platform={event.platform}
                size={40}
                className="border border-slate-200 dark:border-slate-500"
              />
            </div>
            <div className="absolute bottom-0 -right-4 flex size-6 items-center justify-center rounded-full border-2 border-white bg-white text-slate-700 dark:border-slate-900 dark:bg-slate-900 dark:text-white">
              <PlatformIcon className="size-3.5" />
              <span className="sr-only">{event.platform}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

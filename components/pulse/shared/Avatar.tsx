"use client";

import { useState } from "react";
import type { TimelineEvent } from "@/types/pulse";

/** The avatars held in public/avatars, by platform and lower-cased handle
 *  (ATTRIBUTION.md): the team's own and one stored copy of each other X account
 *  the timeline names. The browser talks to this origin only. */
const LOCAL_AVATARS: Partial<Record<TimelineEvent["platform"], Record<string, string>>> = {
  x: {
    milesessex: "/avatars/x/milesessex.png",
    rails_finance: "/avatars/x/rails_finance.svg",
    castle_labs: "/avatars/x/castle_labs.jpg",
    ceazor7: "/avatars/x/ceazor7.jpg",
    defiscan_info: "/avatars/x/defiscan_info.jpg",
    duckdegen: "/avatars/x/duckdegen.jpg",
    gutomartino: "/avatars/x/gutomartino.jpg",
    justincbram: "/avatars/x/justincbram.jpg",
    liquityprotocol: "/avatars/x/liquityprotocol.jpg",
    stanikulechov: "/avatars/x/stanikulechov.jpg",
    tokenbrice: "/avatars/x/tokenbrice.jpg",
  },
  github: {
    milodonid: "/avatars/github/milodonid.png",
    slvdev: "/avatars/github/slvdev.jpg",
  },
};

function normalizeHandle(handle?: string): string | null {
  const normalized = handle?.replace(/^@/, "").trim().toLowerCase();
  return normalized || null;
}

/** Where a handle's picture comes from: its local file, the local placeholder
 *  for an X handle with none, and nothing for the rest (the initial shows
 *  instead). */
function getAvatarSrc(handle?: string, platform?: TimelineEvent["platform"]): string | null {
  const normalized = normalizeHandle(handle);
  if (!normalized || !platform) return null;
  const local = LOCAL_AVATARS[platform]?.[normalized];
  if (local) return local;
  if (platform === "x") return "/avatars/x/_fallback.svg";
  return null;
}

export function Avatar({
  handle,
  platform,
  size = 18,
  className = "",
  overrideSrc,
}: {
  handle?: string;
  platform?: TimelineEvent["platform"];
  size?: number;
  className?: string;
  /** Explicit image path that bypasses the local-file lookup. */
  overrideSrc?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = handle?.replace(/^@/, "").charAt(0)?.toUpperCase() ?? "?";

  const src = failed ? null : (overrideSrc ?? getAvatarSrc(handle, platform));

  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-full bg-white dark:bg-rb-900 ${className}`}
      style={{ width: size, height: size }}
    >
      {src && (
        <img
          src={src}
          alt={`Avatar for ${handle}`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <span
        className={`absolute inset-0 flex items-center justify-center text-[0.6rem] font-semibold text-rb-500 transition-opacity dark:text-rb-200 bg-rb-200 dark:bg-rb-700 ${
          src ? "opacity-0" : "opacity-100"
        }`}
      >
        {initial}
      </span>
    </span>
  );
}

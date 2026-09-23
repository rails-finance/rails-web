"use client";

import { useState } from "react";
import type { TimelineEvent } from "@/types/pulse";

/** The avatars held in public/avatars — the team's own, by platform and
 *  lower-cased handle (ATTRIBUTION.md). Everyone else's X picture is read
 *  through /api/avatar/x at request time and never stored in the repo. */
const LOCAL_AVATARS: Partial<Record<TimelineEvent["platform"], Record<string, string>>> = {
  x: {
    milesessex: "/avatars/x/milesessex.png",
    rails_finance: "/avatars/x/rails_finance.svg",
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

/** Where a handle's picture comes from: a local file for the team's own,
 *  the request-time route for any other X handle, and nothing for the
 *  rest (the initial shows instead). */
function getAvatarSrc(handle?: string, platform?: TimelineEvent["platform"]): string | null {
  const normalized = normalizeHandle(handle);
  if (!normalized || !platform) return null;
  const local = LOCAL_AVATARS[platform]?.[normalized];
  if (local) return local;
  if (platform === "x") return `/api/avatar/x/${normalized}`;
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
  /** Explicit image path that bypasses the local-file / /api/avatar lookup. */
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

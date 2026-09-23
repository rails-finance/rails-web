"use client";

import { useState } from "react";
import type { TimelineEvent } from "@/types/pulse";

function getAvatarBasePath(handle?: string, platform?: TimelineEvent["platform"]) {
  if (!handle || !platform) return null;
  const normalizedHandle = handle.replace(/^@/, "").trim().toLowerCase();
  if (!normalizedHandle) return null;
  const platformDir = platform.toLowerCase();
  return `/avatars/${platformDir}/${normalizedHandle}`;
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
  /** Explicit image path that bypasses the /avatars/{platform}/{handle} lookup. */
  overrideSrc?: string;
}) {
  const basePath = getAvatarBasePath(handle, platform);
  const [extension, setExtension] = useState<"png" | "jpg" | "svg" | null>("png");
  const initial = handle?.replace(/^@/, "").charAt(0)?.toUpperCase() ?? "?";

  const src = overrideSrc ?? (basePath && extension ? `${basePath}.${extension}` : null);

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
          onError={(event) => {
            if (extension === "png") {
              setExtension("jpg");
            } else if (extension === "jpg") {
              setExtension("svg");
            } else {
              event.currentTarget.style.display = "none";
              setExtension(null);
            }
          }}
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

import type { TimelinePlatform } from "@/types/pulse";

/** Platforms whose links stay inside Rails (rails.finance) — these read as
 *  internal links (blue, color-grammar.md §4a). Blog posts count as internal
 *  here. Every other platform leaves Rails → external link color (pink, §4b). */
const INTERNAL_PLATFORMS = new Set<TimelinePlatform>(["app", "internal", "blog"]);

export function isInternalPlatform(platform?: TimelinePlatform): boolean {
  return !!platform && INTERNAL_PLATFORMS.has(platform);
}

export function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(value));
}

export function formatFullDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

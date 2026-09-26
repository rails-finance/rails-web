import type { TimelinePlatform } from "@/types/pulse";
import { formatMonthDay } from "@/lib/date";

/** Platforms whose links stay inside Rails (rails.finance) — these read as
 *  internal links (blue, color-grammar.md §4a). Blog posts count as internal
 *  here. Every other platform leaves Rails → external link color (pink, §4b). */
const INTERNAL_PLATFORMS = new Set<TimelinePlatform>(["app", "internal", "blog"]);

export function isInternalPlatform(platform?: TimelinePlatform): boolean {
  return !!platform && INTERNAL_PLATFORMS.has(platform);
}

export function formatDisplayDate(value: string) {
  return formatMonthDay(new Date(value));
}

export function formatFullDateTime(value: string) {
  const date = new Date(value);
  const time = date.toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
  return `${formatMonthDay(date)}, ${date.getUTCFullYear()}, ${time}`;
}

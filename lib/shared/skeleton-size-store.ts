// The skeleton memory layer: what the browser actually measured for each real
// page section (skeleton-size-recorder), remembered per route shape × viewport
// bucket, so the NEXT visit's loading blocks reserve the observed heights
// instead of the measured-once defaults. Same localStorage posture as
// card-open-store: reads tolerate SSR (no `window`) and malformed JSON by
// returning nothing; writes are best-effort; a soft cap prunes the oldest
// entries so the map never accumulates indefinitely.

import type { SkeletonSection } from "@/lib/shared/skeleton-sizes";

const STORAGE_KEY = "rails-skel-sizes-v1";
const MAX_ENTRIES = 150;

// Sanity bounds for a recorded height: a hidden or collapsed element measures
// ~0 and a runaway container can measure thousands — either would poison the
// remembered size, so values outside this band are ignored.
const MIN_PX = 16;
const MAX_PX = 900;

// Writes are skipped when every value is within this many px of what's stored
// — sub-pixel reflow churn isn't worth a localStorage write per page view.
const CHURN_PX = 2;

type SizeMap = Partial<Record<SkeletonSection, number>>;
type Store = Record<string, SizeMap>;

function entryKey(routeKey: string, bucket: string): string {
  return `${routeKey}|${bucket}`;
}

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

/** The remembered sizes for one route shape × viewport bucket (may be empty). */
export function readSkeletonSizes(routeKey: string, bucket: string): SizeMap {
  const map = readStore()[entryKey(routeKey, bucket)];
  return map && typeof map === "object" ? map : {};
}

/** Merge freshly observed sizes into the store: whole px, out-of-band values
 *  dropped, and no write at all when nothing moved beyond the churn band. */
export function recordSkeletonSizes(routeKey: string, bucket: string, sizes: SizeMap): void {
  const cleaned: SizeMap = {};
  for (const [section, value] of Object.entries(sizes)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const px = Math.round(value);
    if (px < MIN_PX || px > MAX_PX) continue;
    cleaned[section as SkeletonSection] = px;
  }
  if (Object.keys(cleaned).length === 0) return;

  const store = readStore();
  const key = entryKey(routeKey, bucket);
  const existing = store[key] ?? {};
  const unchanged = Object.entries(cleaned).every(([section, px]) => {
    const prev = existing[section as SkeletonSection];
    return typeof prev === "number" && Math.abs(prev - px) <= CHURN_PX;
  });
  if (unchanged) return;

  // Delete-then-set so the entry moves to the end of insertion order — the cap
  // below then prunes the LEAST RECENTLY UPDATED entries, not merely the first
  // ever written.
  delete store[key];
  store[key] = { ...existing, ...cleaned };
  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete store[k];
  }
  writeStore(store);
}

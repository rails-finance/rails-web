// Persists which event cards the user has expanded, so the open/closed state
// survives reloads and back-navigation. Keyed by each event's stable id
// (protocol-prefixed by the caller to stay globally unique). Only OPEN cards
// are stored — absence means closed — so the map only grows with cards the
// user has actually opened. A soft cap prunes the oldest entries to keep
// localStorage from accumulating indefinitely.
//
// Reads tolerate SSR (no `window`) and malformed JSON by returning an empty
// map; the EventCard restores from this in a post-mount effect, matching the
// rest of the app's localStorage pattern (no hydration mismatch).

const STORAGE_KEY = "rails-open-cards-v1";
const MAX_ENTRIES = 800;

function readMap(): Record<string, true> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, true>) : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, true>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function isCardOpen(key: string): boolean {
  return readMap()[key] === true;
}

export function setCardOpen(key: string, open: boolean): void {
  const map = readMap();
  if (open) {
    map[key] = true;
    // Object keys preserve insertion order — drop the oldest beyond the cap.
    const keys = Object.keys(map);
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[k];
    }
  } else {
    delete map[key];
  }
  writeMap(map);
}

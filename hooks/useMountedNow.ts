"use client";

import { useEffect, useState } from "react";

/**
 * The clock in unix seconds, or null on the server and through the client's
 * first render; the browser's time arrives in the effect that follows.
 *
 * Pages are cached and served to every visitor, so a time read during the
 * server render can be minutes or hours old by the time a browser hydrates it,
 * and a label computed from it would be stale and disagree with the client's
 * first render (a hydration mismatch). A component that states an age renders
 * a clock-free placeholder while this is null, then the age once it is set.
 */
export function useMountedNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Math.floor(Date.now() / 1000)), []);
  return now;
}

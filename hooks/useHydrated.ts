"use client";

import { useEffect, useState } from "react";

/**
 * False on the server and through the client's first render, true from the
 * effect that follows — i.e. the moment this component's handlers are attached
 * and a click on it will actually be answered.
 *
 * Every SSR'd page ships its controls as finished HTML long before the bundle
 * has downloaded, parsed and run, and a click in that gap is not queued against
 * the page — it reaches a picture of a button and is gone. Measured on a
 * production build (scripts/verify/measure-hydration-window.mjs): ~50ms on a
 * fast machine over localhost, 286–561ms at 4× CPU on fast 4G, and
 * 1,165–1,829ms at 4× CPU on slow 4G, with the click LOST rather than replayed
 * on every page under both throttled profiles.
 *
 * Returning false on the first client render is deliberate, not a rounding
 * error: it has to match what the server sent or React reports a hydration
 * mismatch and discards the markup. So the "not ready" state is the SSR state,
 * and readiness arrives as an update.
 *
 * Pair with `ctrlWaking()` from lib/shared/ui-grammar to mark a control strip.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

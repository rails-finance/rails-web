// DEV ONLY. Until rails-server's mig 481 is applied and its fill has run, the
// Aave timelines answer `?swaps=1` with no `cow` figures. With
// NEXT_PUBLIC_COW_SURPLUS_FIXTURES=1 on a dev server, the figures for ten swaps
// read from the chain on 17 Nov 2026 (dev-surplus-fixture.json, keyed by order
// UID, computed by the server's decoder and services/cow-surplus.ts from its
// test fixtures) are set on those swaps where the answer has none. The callers
// import this module only when NODE_ENV is not production, so a production
// build drops it.

import type { CowSwapFigures } from "@/lib/cow/surplus";
import rows from "./dev-surplus-fixture.json";

const BY_UID = rows as unknown as Record<string, { cow: CowSwapFigures }>;

/** The fixture's figures for an order, or undefined. */
export const devCowFigures = (orderUid: string | null | undefined): CowSwapFigures | undefined =>
  orderUid ? BY_UID[orderUid.toLowerCase()]?.cow : undefined;

/** Aave V3: set `cow` on the rows' CoW swap legs that carry none. */
export function applyDevCowToV3Rows<
  R extends { swap?: { route: string; order_uid: string | null; cow?: CowSwapFigures | null } | null },
>(rows: R[]): R[] {
  for (const r of rows) {
    const leg = r.swap;
    if (!leg || leg.route === "paraswap" || leg.cow) continue;
    const f = devCowFigures(leg.order_uid);
    if (f) leg.cow = f;
  }
  return rows;
}

/** Aave V4: set `cow` on the merged swaps that carry none. */
export function applyDevCowToV4<T extends { events: { context?: { data?: unknown } }[] }>(answer: T): T {
  for (const e of answer.events) {
    const swap = (e.context?.data as { swap?: { orderUid: string; cow?: CowSwapFigures | null } } | undefined)?.swap;
    if (!swap || swap.cow) continue;
    const f = devCowFigures(swap.orderUid);
    if (f) swap.cow = f;
  }
  return answer;
}

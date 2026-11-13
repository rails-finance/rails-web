// The count of open Fluid positions, read from Rails's index for the vaults
// head (rails-ops ui-jobs 633). SERVER-ONLY — imported only from the vaults
// page's server component.
//
// One request per load: the positions listing's own read with `status=open`
// and `limit=1`, whose total is the count the listing's Status: Open shows.
// The index has no per-vault count, so a vault's open count waits on a
// backend aggregate.

import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerEnvelope } from "@/lib/shared/proxy-answer";
import { readFluidPositions } from "@/lib/fluid/proxy-reads";

export interface FluidOpenCount {
  total: number;
  /** When Rails asked the index, ISO. */
  readAt: string;
}

/** Null where the box is not configured or the read fails; the head then says
 *  the index gave no answer. */
export async function loadFluidOpenCount(): Promise<FluidOpenCount | null> {
  try {
    const hop = await boxOnlyHop();
    if (!hop) return null;
    const readAt = new Date().toISOString();
    const answer = await readFluidPositions(new URLSearchParams({ status: "open", limit: "1" }), hop);
    const { pagination } = answerEnvelope(answer, "readFluidPositions", 1);
    return Number.isFinite(pagination.total) ? { total: pagination.total, readAt } : null;
  } catch (e) {
    console.error("Fluid open-position count failed:", e);
    return null;
  }
}

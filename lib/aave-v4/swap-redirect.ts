// A received leg's event page under `?swaps=1`: the leg now rides inside its
// swap's event (lib/aave-v4/swaps.ts), so a link to the leg's id lands on the
// swap. Server only: the event routes call it before they render.

import { redirect } from "next/navigation";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { spokeFromSlug } from "@/lib/aave-v4/spoke-meta";
import { loadAaveV4SpokeTail } from "@/lib/aave-v4/spoke-position-page-data";
import { aaveV4SwapByReceivedId } from "@/lib/aave-v4/swaps";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/** Redirects to the swap's event page when `eventId` is a swap's received leg. */
export async function redirectReceivedLeg(
  basePath: string,
  params: { spoke: string; wallet: string; eventId: string },
  apiRoot?: string,
): Promise<void> {
  if (!ADDRESS.test(params.wallet)) return;
  const decoded = decodeEventId(params.eventId);
  const spokeName = spokeFromSlug(params.spoke) ?? decodeURIComponent(params.spoke);
  const tail = await loadAaveV4SpokeTail(params.wallet.toLowerCase(), spokeName, apiRoot);
  const events = tail?.events;
  if (!events || events.some((e) => e.id === decoded)) return;
  const swap = aaveV4SwapByReceivedId(events, decoded);
  if (swap) redirect(`${basePath}/spoke/${params.spoke}/${params.wallet}/event/${encodeURIComponent(swap.id)}`);
}

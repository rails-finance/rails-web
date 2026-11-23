// Sky Savings (sUSDS on Ethereum), for the wallet view (decision 0071;
// SERVER-ONLY). One row per holder (mig 519): the card is the listing's row,
// its `value` and `earned` left out by the store, since both move with chi.
// A closed holder's worth is nothing, so its interest earned is every USDS
// amount that left it less every amount that came in, which stands from its
// last event. The head read is the listing's read of the holder
// (/api/sky-savings/positions with the owner, one call to rails-server): the
// row with what its shares redeem for at chi at the sealed block, and that
// block; a holder it no longer lists is closed since the sweep. The listing
// states no figure unless its check against the contract passed, so neither
// does the head read. A deposit owes nothing; the listing
// states no dollars (decision 0041).

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { SkyPosition, SkyPositionsPage } from "@/lib/sky-savings/types";
import type { WalletPosition } from "@/lib/wallet/types";
import { historyBase, storeStamp } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

/** A raw USDS amount as the listing carries it. */
const amount = (raw: bigint) => ({ raw: raw.toString(), formatted: Number(raw) / 1e18 });

/** The holder's open row as the listing answers it, with the sealed block's envelope. */
async function readHolder(
  holder: string,
  signal: AbortSignal,
  readerIp?: string,
): Promise<Pick<SkyPositionsPage, "data" | "asOf" | "gate">> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("RAILS_API_URL is not set");
  const qs = new URLSearchParams({ status: "open", owner: holder.toLowerCase(), limit: "1" });
  const res = await fetch(`${base}/api/sky-savings/positions?${qs}`, {
    ...createAuthFetchOptions({ signal }, readerIp),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`/api/sky-savings/positions answered ${res.status}`);
  return (await res.json()) as Pick<SkyPositionsPage, "data" | "asOf" | "gate">;
}

export const skySavings: FamilyModule = {
  id: "sky-savings",
  name: "Sky Savings",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "sky-savings",
  async shape(rows) {
    return rows.map((r): WalletPosition => {
      const stored = r.card as SkyPosition;
      const open = r.status === "open";
      const row: SkyPosition = open
        ? stored
        : {
            ...stored,
            status: "closed",
            value: amount(BigInt(0)),
            earned: amount(BigInt(stored.usdsOut.raw) - BigInt(stored.usdsIn.raw)),
          };
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "sky-savings",
        familyName: "Sky Savings",
        positionId: r.positionId,
        href: r.href,
        status: open ? "open" : "closed",
        card: { kind: "sky-savings", row, asOf: null },
        headRead: "none",
        ...storeStamp(r),
      };
      // The store records no peak, and a deposit is never liquidated.
      return open ? base : { ...base, history: historyBase(r) };
    });
  },
  async head(open, address, signal, _apiMs, { readerIp }): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    const page = await readHolder(address, signal, readerIp);
    // A check that has not passed: the card keeps the stored shares and
    // states no worth.
    if (page.gate?.ok !== true || !page.asOf)
      return { reads: 1, positions: open.map((p) => ({ ...p, headRead: "failed" })) };
    const asOf = page.asOf;
    const got = page.data?.find((d) => d.holder.toLowerCase() === address.toLowerCase());
    // A holder the listing no longer finds open holds no sUSDS at the sealed block.
    if (!got)
      return {
        reads: 1,
        positions: open.map((p) => ({ ...p, closedSince: { block: asOf.block }, headRead: "stored" })),
      };
    return {
      reads: 1,
      positions: open.map(
        (p): WalletPosition => ({
          ...p,
          card: { kind: "sky-savings", row: got, asOf },
          headRead: "read",
          readAtBlock: asOf.block,
          readAt: asOf.timestamp ?? undefined,
        }),
      ),
    };
  },
};

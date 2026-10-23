"use client";

// A position token's transfer out to a registry router or settlement contract,
// read as a sale where the receipt shows one leg back to the wallet in another
// token (rails-ops TO-DO-ui-jobs 438; the rulings in lib/shared/tx-legs.ts).
// Any other row makes no read. Until the answer lands, and when it reads no
// sale, the hook returns undefined and the row reads "Transferred".

import { useEffect, useState } from "react";
import type { ChainId } from "@/lib/shared/chains";
import { fetchTxLegs } from "@/lib/api/fetch-tx-legs";
import { saleReading, saleVenue, type RouterSale } from "@/lib/shared/tx-legs";

export function useRouterSale(args: {
  /** False for every row that is not a plain transfer out. */
  enabled: boolean;
  chainId: ChainId;
  txHash?: string;
  wallet?: string;
  counterparty?: string | null;
}): RouterSale | undefined {
  const { enabled, chainId, txHash, wallet, counterparty } = args;
  const venue = enabled ? saleVenue(counterparty, chainId) : undefined;
  const asks = !!venue && !!txHash && !!wallet && !!counterparty;
  const [sale, setSale] = useState<{ key: string; sale: RouterSale } | null>(null);
  const key = `${chainId}:${txHash}:${wallet}`;
  useEffect(() => {
    if (!asks || !txHash || !wallet || !counterparty) return;
    let live = true;
    fetchTxLegs(chainId, txHash, wallet, counterparty).then((legs) => {
      if (!live || !legs) return;
      const r = saleReading(legs);
      if (r.sold) setSale({ key, sale: { via: counterparty.toLowerCase(), leg: r.leg } });
    });
    return () => {
      live = false;
    };
  }, [asks, chainId, txHash, wallet, counterparty, key]);
  return asks && sale?.key === key ? sale.sale : undefined;
}

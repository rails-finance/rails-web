"use client";

// BOLD's price on its asset page (ui-jobs 746b): the Curve BOLD/USDC pool's
// last_price(0) at the block the page read it, with the Prices chip's receipt
// (lib/liquity-v2/bold-price.ts) and offPar's caution orange beyond
// DEPEG_BAND. It stands in the no-price line's place (A1.3); a failed read
// states that in the same place. The page mounts the inspector here, so the
// figure's receipt opens.

import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { BlockRef } from "@/components/shared/block-ref";
import { OFF_PAR_BAND } from "@/components/shared/usd-figure";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { offPar } from "@/lib/shared/usd-display";
import { priceText } from "@/lib/shared/shown-usd";
import {
  BOLD_PRICE_UNAVAILABLE,
  boldPriceProv,
  boldUsdFromCurve,
  type BoldPriceRead,
} from "@/lib/liquity-v2/bold-price";

export function BoldLivePrice({ read }: { read: BoldPriceRead | null }) {
  const registry = useReceiptRegistry();
  const price = read ? boldUsdFromCurve(read.lastPriceRaw) : null;
  const info = read ? boldPriceProv(read) : undefined;
  if (!read || price == null || !info) {
    return (
      <p className="mt-1 text-sm text-rb-500" data-asset-bold-price="failed" data-anatomy="A1.7">
        {BOLD_PRICE_UNAVAILABLE}
      </p>
    );
  }
  const band = offPar(price, "BOLD")?.band === true;
  return (
    <ProvReceiptsScope registry={registry}>
      <div data-asset-bold-price={read.blockNumber} data-anatomy="A1.7">
        <p className="flex items-baseline gap-1.5 text-sm tabular-nums">
          <span className="text-xs text-rb-500">Price</span>
          <Prov info={info} value={String(price)} symbol="BOLD">
            <span
              className={`text-lg font-semibold ${band ? OFF_PAR_BAND : "text-foreground"}`}
              data-usd-off-par={band ? "band" : undefined}
            >
              {priceText(price)}
            </span>
          </Prov>
        </p>
        <p className="mt-0.5 text-xs text-rb-500">
          Curve BOLD/USDC last trade, USDC at $1 · <BlockRef block={read.blockNumber} chainId={MAINNET_CHAIN_ID} />
        </p>
      </div>
      <ProvInspectorLayer />
    </ProvReceiptsScope>
  );
}

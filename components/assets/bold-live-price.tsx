"use client";

// BOLD's price on its asset page (ui-jobs 746b): the Curve BOLD/USDC pool's
// last_price(0) at the block the page read it, with the Prices chip's receipt
// (lib/liquity-v2/bold-price.ts) and offPar's caution orange beyond
// DEPEG_BAND. It stands in the no-price line's place (A1.3); a failed read
// states that in the same place. The page mounts the inspector here, so the
// figure's receipt opens. The asset explorer's BOLD row (A5.12) and the
// asset popover draw the same read.

import { createContext } from "react";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { FigureRow } from "@/components/assets/asset-explorer";
import type { CardFigure } from "@/lib/shared/asset-explorer";
import { asOfMark } from "@/components/assets/asset-price-row";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import type { BoldPriceState } from "@/lib/liquity-v2/use-bold-price";
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

/** The card's figure on BOLD's page (A5.11, its Trove debt) with a receipt,
 *  since the page arms the inspector: the figure's own sentence and where it
 *  is read. */
function figureProv(f: CardFigure): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `${f.unit} ${f.label.toLowerCase()} — ${f.title.charAt(0).toLowerCase()}${f.title.slice(1)}: each open Trove's current debt summed, at the index's latest read, which names no block.`,
    formula: "Σ current debt over the open Troves",
  };
}

export function BoldLivePrice({ read, figure }: { read: BoldPriceRead | null; figure: CardFigure | null }) {
  const registry = useReceiptRegistry();
  const price = read ? boldUsdFromCurve(read.lastPriceRaw) : null;
  const info = read ? boldPriceProv(read) : undefined;
  if (!read || price == null || !info) {
    return (
      <>
        {figure && <FigureRow figure={figure} />}
        <p className="mt-1 text-sm text-rb-500" data-asset-bold-price="failed" data-anatomy="A1.7">
          {BOLD_PRICE_UNAVAILABLE}
        </p>
      </>
    );
  }
  const band = offPar(price, "BOLD")?.band === true;
  return (
    <ProvReceiptsScope registry={registry}>
      {figure && <FigureRow figure={figure} info={figureProv(figure)} />}
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

/** The asset explorer's BOLD row (A5.12): BOLD's read, from the page's server
 *  half, for the Price cell. Undefined where the explorer read none. */
export const BoldReadContext = createContext<BoldPriceRead | null | undefined>(undefined);

/** Whether a card's chains hold BOLD on Ethereum. */
export const holdsBold = (chains: readonly { chain: number; token: string }[]) =>
  chains.some((x) => x.chain === MAINNET_CHAIN_ID && x.token.toLowerCase() === TOKEN_ADDRESSES.BOLD);

/** The Price cell's figure for BOLD: the price with the pool's block, its
 *  receipt and the off-par band; "Unavailable" where the read failed. */
export function BoldCardPrice({ read }: { read: BoldPriceRead | null }) {
  const registry = useReceiptRegistry();
  const price = read ? boldUsdFromCurve(read.lastPriceRaw) : null;
  const info = read ? boldPriceProv(read) : undefined;
  if (!read || price == null || !info) {
    return (
      <span
        className="text-xs text-rb-500"
        title={BOLD_PRICE_UNAVAILABLE}
        data-asset-bold-price="failed"
        data-anatomy="A5.12"
      >
        Unavailable
      </span>
    );
  }
  const band = offPar(price, "BOLD")?.band === true;
  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <span
        className="inline-flex items-center justify-end gap-1"
        data-asset-bold-price={read.blockNumber}
        data-anatomy="A5.12"
      >
        <Prov info={info} value={String(price)} symbol="BOLD">
          <span
            className={`font-semibold ${band ? OFF_PAR_BAND : "text-foreground"}`}
            data-usd-off-par={band ? "band" : undefined}
          >
            {priceText(price)}
          </span>
        </Prov>
        <span
          className="ml-1 text-[11px] text-rb-500"
          title={`Curve BOLD/USDC last trade, block ${read.blockNumber.toLocaleString("en-US")}, USDC at $1`}
        >
          {asOfMark({ ts: read.blockTimestamp })}
        </span>
      </span>
    </ProvReceiptsScope>
  );
}

/** The asset popover's line for BOLD: the price at head (useBoldPrice), the
 *  pool and the block; the unavailable line where the read failed. */
export function BoldPopoverPrice({ s }: { s: BoldPriceState }) {
  const registry = useReceiptRegistry();
  if (s.state === "loading") return null;
  const info = s.state === "ok" ? boldPriceProv(s.read) : undefined;
  if (s.state !== "ok" || !info) {
    return (
      <p className="text-[11px] text-rb-500" data-asset-popover-bold-price="failed">
        {BOLD_PRICE_UNAVAILABLE}
      </p>
    );
  }
  const band = offPar(s.price, "BOLD")?.band === true;
  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <p className="text-[11px] text-rb-500" data-asset-popover-bold-price={s.read.blockNumber}>
        <Prov info={info} value={String(s.price)} symbol="BOLD">
          <span
            className={`text-xs font-semibold ${band ? OFF_PAR_BAND : "text-foreground"}`}
            data-usd-off-par={band ? "band" : undefined}
          >
            {priceText(s.price)}
          </span>
        </Prov>{" "}
        Curve BOLD/USDC last trade, USDC at $1, block {s.read.blockNumber.toLocaleString("en-US")}
      </p>
    </ProvReceiptsScope>
  );
}

"use client";

// CoW Swap's front door: the mark and name, the shared search (H15) landing on
// a wallet's trades, and one line on what the page reads. The layout is the
// position-first explorers' (components/shared/protocol-front-door.tsx).

import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { FrontDoorSearch } from "@/components/shared/front-door-search";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { TitleRowChooser } from "@/components/shared/rail-header";

export function CowFrontDoor() {
  return (
    <>
      <div className="hidden min-h-[4.5rem] items-center justify-end pt-8 md:flex">
        <TitleRowChooser />
      </div>
      <div
        className="flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center py-12 md:min-h-[calc(100svh-19rem)]"
        data-anatomy="N5"
        data-front-door="cow"
      >
        <h1 className="mb-8 flex items-center gap-3">
          <ProtocolIcon id="cow" className="h-11 w-11 shrink-0 text-foreground" />
          <span className="text-3xl font-semibold leading-none text-foreground">CoW Swap</span>
        </h1>
        <div className="w-full max-w-xl">
          <FrontDoorSearch href={(wallet) => `/ethereum/cow/${wallet}`} />
        </div>
        <p className="mt-6 max-w-xl text-center text-sm text-rb-500">
          A wallet&rsquo;s trades through CoW Protocol on Ethereum, each read from the settlement contract&rsquo;s Trade
          log.
        </p>
      </div>
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}

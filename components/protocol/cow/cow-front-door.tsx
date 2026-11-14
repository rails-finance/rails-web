"use client";

// CoW Protocol's front door: the mark and name and the shared search (H15)
// landing on a wallet's trades. No sentence (rails-ops reading-contract rule 1):
// the wallet page's account explanation says what each trade is read from.
// The layout is the position-first explorers'
// (components/shared/protocol-front-door.tsx).

import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { FrontDoorSearch } from "@/components/shared/front-door-search";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { COW_TERMS } from "@/lib/cow/terms";

export function CowFrontDoor() {
  return (
    <>
      <div
        className="flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center py-12"
        data-anatomy="N5"
        data-front-door="cow"
      >
        <h1 className="mb-8 flex items-center gap-3">
          <ProtocolIcon id="cow" className="h-11 w-11 shrink-0 text-foreground" />
          <span className="text-3xl font-semibold leading-none text-foreground">{COW_TERMS.name}</span>
        </h1>
        <div className="w-full max-w-xl">
          <FrontDoorSearch href={(wallet) => `/ethereum/cow/${wallet}`} />
        </div>
      </div>
      <ProvInspectorLayer />
    </>
  );
}

"use client";

// Uniswap's front door (N5; rails-ops ui-jobs 556): the mark and name, the
// shared search (H15) landing on a wallet's positions, and one line on what
// the pages read. The layout is CoW's (components/protocol/cow/cow-front-door.tsx).

import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { FrontDoorSearch } from "@/components/shared/front-door-search";
import type { UniswapVersion } from "@/lib/uniswap/types";
import { FRONT_DOOR, versionLabel } from "@/lib/uniswap/words";

export function UniswapFrontDoor({ version }: { version: UniswapVersion }) {
  const id = `uniswap-${version}`;
  return (
    <div
      className="flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center py-12"
      data-anatomy="N5"
      data-front-door={id}
    >
      <h1 className="mb-8 flex items-center gap-3">
        <ProtocolIcon id={id} className="h-11 w-11 shrink-0 text-foreground" />
        <span className="text-3xl font-semibold leading-none text-foreground">{versionLabel(version)}</span>
      </h1>
      <div className="w-full max-w-xl">
        <FrontDoorSearch href={(wallet) => `/ethereum/${id}/${wallet}`} />
      </div>
      <p className="mt-6 max-w-xl text-center text-sm text-rb-500">{FRONT_DOOR.line(version)}</p>
    </div>
  );
}

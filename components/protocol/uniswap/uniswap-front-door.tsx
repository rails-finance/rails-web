"use client";

// Uniswap's front door (N5; rails-ops ui-jobs 556): the mark and name, the
// shared search (H15) landing on a wallet's positions, and one line on what
// the pages read. The layout is CoW's (components/protocol/cow/cow-front-door.tsx).
// Aerodrome's door (ui-jobs 566) is the same, through `PoolFrontDoor`.

import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { FrontDoorSearch } from "@/components/shared/front-door-search";
import type { UniswapVersion } from "@/lib/uniswap/types";
import { FRONT_DOOR, versionLabel } from "@/lib/uniswap/words";

/** A pool explorer's front door: `id` is the roster id (the mark and `data-front-door`), `route` the
 *  explorer's route, under which a wallet's positions live. */
export function PoolFrontDoor({ id, label, line, route }: { id: string; label: string; line: string; route: string }) {
  return (
    <div
      className="flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center py-12"
      data-anatomy="N5"
      data-front-door={id}
    >
      <h1 className="mb-8 flex items-center gap-3">
        <ProtocolIcon id={id} className="h-11 w-11 shrink-0 text-foreground" />
        <span className="text-3xl font-semibold leading-none text-foreground">{label}</span>
      </h1>
      <div className="w-full max-w-xl">
        <FrontDoorSearch href={(wallet) => `${route}/${wallet}`} />
      </div>
      <p className="mt-6 max-w-xl text-center text-sm text-rb-500">{line}</p>
    </div>
  );
}

export function UniswapFrontDoor({ version }: { version: UniswapVersion }) {
  const id = `uniswap-${version}`;
  return (
    <PoolFrontDoor id={id} label={versionLabel(version)} line={FRONT_DOOR.line(version)} route={`/ethereum/${id}`} />
  );
}

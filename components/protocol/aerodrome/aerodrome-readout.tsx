"use client";

// The readout under an Aerodrome position's card (U2; rails-ops ui-jobs 566,
// 594): Uniswap's readout section (components/protocol/uniswap/uniswap-readout.tsx
// `PoolReadout`), a then / now table, with Aerodrome's rows, words and receipts.

import { PoolReadout } from "@/components/protocol/uniswap/uniswap-readout";
import { AerodromeReadStamp } from "@/components/protocol/aerodrome/aerodrome-position-card";
import { aeroPosition } from "@/lib/aerodrome/position";
import { lineProv } from "@/lib/aerodrome/provenance";
import type { AeroPositionRead } from "@/lib/aerodrome/types";
import { readoutExplainer, readoutTable } from "@/lib/aerodrome/words";

const READOUT_SCOPE = "aerodrome-readout";

export function AerodromeReadout({ r, title }: { r: AeroPositionRead; title: string }) {
  const p = aeroPosition(r);
  const c = { p, r };
  return (
    <PoolReadout
      scope={READOUT_SCOPE}
      readoutKey={`${p.deployment}:${p.id}`}
      title={title}
      table={readoutTable(p)}
      groups={readoutExplainer(p)}
      prov={(row) => lineProv(row.key, c)}
      stamp={<AerodromeReadStamp c={c} what="Every figure in this section" />}
    />
  );
}

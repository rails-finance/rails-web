"use client";

// "How the position and its pool are doing" (U2; rails-ops ui-jobs 566):
// Uniswap's readout section (components/protocol/uniswap/uniswap-readout.tsx
// `PoolReadout`) with Aerodrome's lines, words and receipts.

import { PoolReadout } from "@/components/protocol/uniswap/uniswap-readout";
import { AerodromeReadStamp } from "@/components/protocol/aerodrome/aerodrome-position-card";
import { aeroPosition } from "@/lib/aerodrome/position";
import { lineProv } from "@/lib/aerodrome/provenance";
import type { AeroPositionRead } from "@/lib/aerodrome/types";
import { readoutExplainer, readoutLines } from "@/lib/aerodrome/words";

const READOUT_SCOPE = "aerodrome-readout";

export function AerodromeReadout({ r, title }: { r: AeroPositionRead; title: string }) {
  const p = aeroPosition(r);
  const c = { p, r };
  const lines = readoutLines(p);
  return (
    <PoolReadout
      scope={READOUT_SCOPE}
      readoutKey={`${p.deployment}:${p.id}`}
      title={title}
      lines={lines}
      groups={readoutExplainer(
        p,
        lines.map((l) => l.key),
      )}
      prov={(key, part) => lineProv(key, part, c)}
      stamp={<AerodromeReadStamp c={c} what="Every figure in this section" />}
    />
  );
}

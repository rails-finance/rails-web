"use client";

// The roster's read stamp (ui-jobs 485): the age of the read the page shows,
// in H6's form (components/wallet/read-stamp.tsx), a press switching to the
// block. On the index it states the oldest roster's read, and its receipt
// lists every roster's block and time.

import type { ReactNode } from "react";
import { Prov } from "@/components/shared/provenance";
import { ReadStamp } from "@/components/wallet/read-stamp";
import { rosterReadProv, type RosterRead } from "@/lib/vaults/roster-provenance";

export function RosterReadStamp({ reads, children }: { reads: RosterRead[]; children?: ReactNode }) {
  const read = reads.filter((r) => r.block > 0);
  if (read.length === 0) return null;
  // The oldest read: the earliest block time, else the first roster with none.
  const oldest = read.reduce((a, b) => (a.at == null ? a : b.at == null || b.at < a.at ? b : a));
  return (
    <span
      className="inline-flex items-center"
      data-roster-read-block={oldest.block}
      data-roster-read-at={oldest.at ?? ""}
    >
      <Prov info={rosterReadProv(read)}>
        <ReadStamp block={oldest.block} at={oldest.at ?? undefined} />
      </Prov>
      {children}
    </span>
  );
}

/** An ISO time as seconds; null where absent or unparsable. */
export const isoSeconds = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};

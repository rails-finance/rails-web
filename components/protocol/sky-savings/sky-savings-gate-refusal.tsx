// What a Sky Savings page shows when the latest check has not passed: the
// statement, and no figure. The check compares the replayed ledger with the
// sUSDS contract for every holder (rails-ops reference/sky-savings-pipeline.md).

import { RailHeader } from "@/components/shared/rail-header";
import { BlockRef } from "@/components/shared/block-ref";
import type { SkyGate } from "@/lib/sky-savings/types";
import { SKY_CHAIN_ID } from "@/lib/sky-savings/constants";

export function SkyGateStatement({ reason, gate }: { reason: "failed" | "missing"; gate: SkyGate | null }) {
  return (
    <div
      className="rounded-2xl border border-rb-300/40 dark:border-rb-700/40 bg-raised px-5 py-4 text-sm text-rb-500"
      data-sky-gate={reason}
    >
      {reason === "missing" ? (
        <p>
          The check that compares these figures with the sUSDS contract has not run on the current ledger yet, so no
          figure is shown. It runs within minutes of a rebuild and every six hours after.
        </p>
      ) : (
        <p>
          The latest check against the sUSDS contract did not pass
          {gate ? (
            <>
              {" "}
              (at <BlockRef block={gate.block} chainId={SKY_CHAIN_ID} />)
            </>
          ) : null}
          , so no figure is shown. The page returns once a check passes.
        </p>
      )}
    </div>
  );
}

export function SkyGateRefusal({
  reason,
  gate,
  holder,
}: {
  reason: "failed" | "missing";
  gate: SkyGate | null;
  holder?: string;
}) {
  return (
    <div className="py-8 space-y-6">
      <RailHeader session="sky-savings" venue={holder ? "position" : "listing"} />
      {holder && <p className="font-mono text-sm text-rb-500">{holder}</p>}
      <SkyGateStatement reason={reason} gate={gate} />
    </div>
  );
}

"use client";

// Per-interval socialized drift — the archive decomposition of the position
// card's reconciliation lines. Each row is one quiet stretch between the
// position's own events: drift = getPosition(end) − getPosition(start), both
// reads at named blocks, so every number is a pair of chain facts and their
// difference — funding (collateral), socialized rebalances and bad debt, with
// no own-event delta inside by construction.
//
// The reads live behind rails-server now (/api/fx/position/:pool/:id/drift):
// a closed boundary is read once and cached forever, the head end is the
// settled sweep row the card already shows, and a cold position fills newest
// interval first over a few requests. So the page loads the intervals on
// mount (the parent owns the fetch and shares the result with the card and
// the rebalance cards); this panel renders them and offers the next batch.
//
// The panel is its own receipts scope (the tower mold): every figure —
// interval boundaries and both drift cells — carries a receipt the
// page-level provenance inspector can open, and the dev prov-coverage
// tripwire sweeps the panel like any other receipted surface.

import { formatNumber } from "@/lib/utils/format";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { driftIntervalProv, driftValueProv } from "@/lib/fx/event-provenance";
import type { FxDriftInterval, FxDriftResult } from "@/lib/sources/api/fx-drift";

const DUST = 1e-9;

function DriftCell({ value, symbol, prov }: { value: number; symbol: string; prov: Provenance }) {
  if (Math.abs(value) <= DUST) return <span className="text-rb-500">—</span>;
  return (
    <Prov info={prov} value={`${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value))} ${symbol}`}>
      <span className="tabular-nums text-foreground/80">
        {value > 0 ? "+" : "−"}
        {formatNumber(Math.abs(value))} {symbol}
      </span>
    </Prov>
  );
}

export function FxDriftPanel({
  drift,
  state,
  reason,
  onLoad,
  normalizedSymbol,
}: {
  /** The intervals in hand (the newest suffix), or null before the first
   *  answer. */
  drift: FxDriftResult | null;
  state: "idle" | "loading" | "error";
  /** The route's stated reason for a failure ("the archive RPC did not
   *  answer"), so the panel says WHAT failed rather than only that it did. */
  reason: string | null;
  /** Fetch (again): the first read, a retry, or the next batch of older
   *  intervals. */
  onLoad: () => void;
  normalizedSymbol: string;
}) {
  const registry = useReceiptRegistry();
  const loading = state === "loading";

  return (
    <ProvReceiptsScope registry={registry}>
      <div className="rounded-xl bg-raised px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">Socialized drift · by interval</span>
          {!drift && loading && <span className="text-xs text-rb-500">Reading boundary states…</span>}
        </div>
        <p className="mt-1 text-xs text-rb-500">
          Funding, socialized rebalances and bad debt move this position between its own events with no per-position log
          — funding on the collateral side, rebalances on both, bad debt on the debt side. Each row below is one quiet
          stretch: the pool&rsquo;s <code>getPosition</code> read at its start and end blocks, and their difference —
          the drift that stretch contributed to the position card&rsquo;s reconciliation lines.
        </p>
        {state === "error" && (
          <p className="mt-2 text-xs text-rb-500">
            Boundary reads failed{reason ? ` — ${reason}` : ""}.{" "}
            <button onClick={onLoad} className="underline decoration-dotted underline-offset-2 hover:text-foreground">
              Try again
            </button>
          </p>
        )}
        {drift && (
          <div className="mt-3 overflow-x-auto">
            {drift.intervals.length === 0 ? (
              <p className="text-xs text-rb-500">
                {drift.headPending
                  ? "The position was touched after the last settled sweep — its stretches are stated once the next sweep lands."
                  : drift.headBlock == null
                    ? "No settled sweep for this position yet — the stretches are stated once it lands."
                    : "No quiet stretches — every block gap between events is empty."}
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-rb-500">
                    <th className="py-1 pr-4 font-semibold">Interval · blocks</th>
                    <th className="py-1 pr-4 font-semibold">Collateral drift</th>
                    <th className="py-1 pr-4 font-semibold">Debt drift</th>
                  </tr>
                </thead>
                <tbody>
                  {drift.intervals.map((iv: FxDriftInterval) => (
                    <tr
                      key={`${iv.fromBlock}-${iv.toBlock}`}
                      className="border-t border-rb-300/40 dark:border-rb-700/40"
                    >
                      <td className="py-1.5 pr-4 tabular-nums text-rb-500">
                        <Prov
                          info={driftIntervalProv(iv.fromBlock, iv.toBlock, iv.toHead)}
                          value={`${iv.fromBlock} → ${iv.toBlock}`}
                        >
                          <span>
                            {iv.fromBlock} → {iv.toHead ? `settled (${iv.toBlock})` : iv.toBlock}
                          </span>
                        </Prov>
                      </td>
                      <td className="py-1.5 pr-4">
                        <DriftCell
                          value={iv.collsDrift}
                          symbol={normalizedSymbol}
                          prov={driftValueProv("colls", normalizedSymbol, iv.fromBlock, iv.toBlock, iv.toHead)}
                        />
                      </td>
                      <td className="py-1.5 pr-4">
                        <DriftCell
                          value={iv.debtsDrift}
                          symbol="fxUSD"
                          prov={driftValueProv("debts", "fxUSD", iv.fromBlock, iv.toBlock, iv.toHead)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {drift.intervals.length > 0 && drift.headPending && (
              <p className="mt-2 text-xs text-rb-500">
                The latest stretch is not shown yet: the position was touched after the last settled sweep, and it is
                stated once the next sweep lands.
              </p>
            )}
            {drift.unread > 0 && (
              <p className="mt-2 text-xs text-rb-500">
                {drift.unread} older stretch{drift.unread === 1 ? "" : "es"} not read yet
                {drift.stalled ? ` (${drift.stalled})` : ""} — the card&rsquo;s debt-side socialized figure covers the
                whole history regardless; its collateral line says how much it covers.{" "}
                <button
                  onClick={onLoad}
                  disabled={loading}
                  className="rounded-md border border-rb-300 px-2 py-0.5 text-xs text-foreground/80 transition-colors hover:border-blue-500 hover:text-foreground disabled:opacity-60 dark:border-rb-700"
                >
                  {loading ? "Reading…" : "Read older stretches"}
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </ProvReceiptsScope>
  );
}

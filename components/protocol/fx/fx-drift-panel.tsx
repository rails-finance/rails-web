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

import { formatDate } from "@/lib/date";
import { formatNumber } from "@/lib/utils/format";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import {
  driftIntervalProv,
  driftValueProv,
  lifetimeInTxFundingProv,
  lifetimeCollateralMovedProv,
  driftTotalProv,
} from "@/lib/fx/event-provenance";
import { fxFundingText, type FxInTxFunding } from "@/lib/fx/in-tx-funding";
import type { FxDriftInterval, FxDriftResult } from "@/lib/sources/api/fx-drift";
import { AmountText } from "@/components/shared/amount-text";

const DUST = 1e-9;

function DriftCell({ value, symbol, prov }: { value: number; symbol: string; prov: Provenance }) {
  if (Math.abs(value) <= DUST) return <span className="text-rb-500">—</span>;
  return (
    <Prov info={prov} value={`${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value))} ${symbol}`}>
      <span className="tabular-nums text-foreground/80">
        {value > 0 ? "+" : "−"}
        {symbol === "fxUSD" ? <AmountText value={Math.abs(value)} /> : fxFundingText(value)} {symbol}
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
  blockDates,
  inTx,
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
  /** Block → unix time for the position's event blocks (the stretches'
   *  bounds), so each row carries its dates. */
  blockDates?: Map<number, number>;
  /** Funding the pool booked inside the position's own transactions. */
  inTx?: FxInTxFunding | null;
}) {
  const dateOf = (b: number): string | null => {
    const t = blockDates?.get(b);
    return t != null ? formatDate(t) : null;
  };
  const registry = useReceiptRegistry();
  const loading = state === "loading";
  // Stretches with no change are one line under the table.
  const moved = drift
    ? drift.intervals.filter((iv) => Math.abs(iv.collsDrift) > DUST || Math.abs(iv.debtsDrift) > DUST)
    : [];
  const quiet = drift ? drift.intervals.length - moved.length : 0;
  const complete = drift != null && drift.unread === 0 && !drift.headPending && drift.headBlock != null;
  const inside = complete && inTx && inTx.total > DUST ? inTx : null;
  const sumColls = drift ? drift.intervals.reduce((t, iv) => t + iv.collsDrift, 0) : 0;
  const sumDebts = drift ? drift.intervals.reduce((t, iv) => t + iv.debtsDrift, 0) : 0;

  return (
    <ProvReceiptsScope registry={registry}>
      <div className="rounded-xl bg-raised px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">Moved by the pool · by stretch</span>
          {!drift && loading && <span className="text-xs text-rb-500">Reading boundary states…</span>}
        </div>
        <p className="mt-1 text-xs text-rb-500">
          Between this position&rsquo;s transactions, funding takes collateral, rebalances and redemptions take
          collateral and debt, a pool-wide liquidation can write debt off, and other positions&rsquo; bad debt adds
          debt. Each row is one stretch between two transactions: the pool&rsquo;s reading of the position at its start
          and end, and the difference.
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
            ) : moved.length === 0 ? null : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-rb-500">
                    <th className="py-1 pr-4 font-semibold">Stretch · dates and blocks</th>
                    <th className="py-1 pr-4 font-semibold">Collateral drift</th>
                    <th className="py-1 pr-4 font-semibold">Debt drift</th>
                  </tr>
                </thead>
                <tbody>
                  {moved.map((iv: FxDriftInterval) => (
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
                            {dateOf(iv.fromBlock) ?? iv.fromBlock} →{" "}
                            {iv.toHead ? "now" : (dateOf(iv.toBlock) ?? dateOf(iv.toBlock + 1) ?? iv.toBlock)}
                            <span className="block text-[10px] text-rb-400">
                              {iv.fromBlock} → {iv.toHead ? `settled (${iv.toBlock})` : iv.toBlock}
                            </span>
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
                  {moved.length > 1 && complete ? (
                    <tr className="border-t border-rb-300/40 dark:border-rb-700/40">
                      <td className="py-1.5 pr-4 text-rb-500">Total between the transactions</td>
                      <td className="py-1.5 pr-4">
                        <DriftCell
                          value={sumColls}
                          symbol={normalizedSymbol}
                          prov={driftTotalProv("colls", normalizedSymbol, drift.intervals.length)}
                        />
                      </td>
                      <td className="py-1.5 pr-4">
                        <DriftCell
                          value={sumDebts}
                          symbol="fxUSD"
                          prov={driftTotalProv("debts", "fxUSD", drift.intervals.length)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
            {quiet > 0 ? (
              <p className="mt-2 text-xs text-rb-500">
                {quiet} stretch{quiet === 1 ? "" : "es"} with no change.
              </p>
            ) : null}
            {inside ? (
              <p className="mt-2 text-xs text-rb-500">
                The pool also books funding at the start of each transaction that reaches it, and that lands in the
                transaction&rsquo;s own row:{" "}
                {inside.rows.map((r, i) => (
                  <span key={r.block}>
                    {i > 0 ? (i === inside.rows.length - 1 ? " and " : ", ") : ""}
                    <Prov info={lifetimeInTxFundingProv(normalizedSymbol, inside.reads)} value={String(r.taken)}>
                      {fxFundingText(r.taken)} {normalizedSymbol}
                    </Prov>{" "}
                    on {formatDate(r.ts)}
                  </span>
                ))}
                . With the table, funding and rebalances took{" "}
                <Prov info={lifetimeCollateralMovedProv(normalizedSymbol, drift.headBlock)}>
                  {fxFundingText(-sumColls + inside.total)} {normalizedSymbol}
                </Prov>{" "}
                in all.
              </p>
            ) : null}
            {drift.intervals.length > 0 && drift.headPending && (
              <p className="mt-2 text-xs text-rb-500">
                The latest stretch is not shown yet: the position was touched after the last settled sweep, and it is
                stated once the next sweep lands.
              </p>
            )}
            {drift.unread > 0 && (
              <p className="mt-2 text-xs text-rb-500">
                {drift.unread} older stretch{drift.unread === 1 ? "" : "es"} not read yet
                {drift.stalled ? ` (${drift.stalled})` : ""} — the card&rsquo;s debt line covers the whole history
                regardless; its collateral line says how much it covers.{" "}
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

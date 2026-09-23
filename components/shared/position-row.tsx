"use client";

// One reserve's line in a position snapshot card: before → after where the event
// moved it, the after alone (muted) where it did not, the ticker, and the
// after-balance's USD chip. Lifted from the Aave V4 event detail so the Aave V3
// Ethereum card's position block reads the same way (rails-ops TO-DO-ui-jobs
// §19). The receipts are the caller's: each protocol traces its own balances.

import type { ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { DeltaToggle } from "@/components/shared/state-transition";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";

/** A token amount on a position line: whole units from 1,000, four decimals from
 *  1, and below 1 enough decimals that a BTC-family or wei-fractional amount
 *  never reads "0". */
export function fmtPositionAmount(v: string | number | undefined): string {
  if (!v) return "0";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!isFinite(n)) return "0";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const decimals = Math.min(8, Math.ceil(-Math.log10(abs)) + 2);
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/** USD on a position line, Liquity V2's detail-row style: `< $0.01` for
 *  sub-cent, `$0.XX` for sub-dollar, whole dollars otherwise. */
export function fmtPositionUsd(value: number | undefined | null): string {
  if (value == null || isNaN(value) || value < 0.01) return "< $0.01";
  if (value < 1) return `$${value.toFixed(2)}`;
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function PositionRow({
  symbol,
  address,
  ticker,
  amount,
  before,
  isChanged,
  afterProv,
  beforeProv,
  deltaProv,
  deltaText,
  exact,
  usd,
  trailing,
}: {
  symbol: string;
  /** The token's address, where the caller has it: the chip resolves its mark
   *  from it. */
  address?: string;
  /** What the line calls the token when ticker labels are on. */
  ticker: string;
  amount: string;
  before?: string;
  isChanged: boolean;
  afterProv: Provenance;
  beforeProv: Provenance;
  deltaProv: Provenance;
  /** The signed change as shown; after − before in floats when absent. */
  deltaText?: string;
  /** Exact receipt values where the line shows a rounded figure. */
  exact?: { after?: string; before?: string; delta?: string };
  /** The after-balance in USD, when the caller can price it. */
  usd?: { value: number; prov: Provenance; exact?: string };
  /** Beside the line, after the USD chip. */
  trailing?: ReactNode;
}) {
  const { showTickerLabels, showUsdValues } = useTimelineDisplay();
  const afterN = parseFloat(amount) || 0;
  // The arrow doubles as a toggle: clicking `before →` swaps it for the change
  // `+delta =`, this asset's balance change in token units.
  const beforeN = before != null ? parseFloat(before) || 0 : 0;
  const delta = afterN - beforeN;
  const deltaStr = deltaText ?? `${delta >= 0 ? "+" : "−"}${fmtPositionAmount(Math.abs(delta))}`;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      {isChanged && before != null ? (
        <>
          <DeltaToggle
            before={
              <Prov info={beforeProv} value={exact?.before}>
                {fmtPositionAmount(before)}
              </Prov>
            }
            delta={
              <Prov info={deltaProv} value={exact?.delta}>
                {deltaStr}
              </Prov>
            }
            size="sm"
          />
          <span className="font-semibold">
            <Prov
              info={afterProv}
              value={exact?.after}
              icon={<TokenChipIcon symbol={symbol} address={address} size={16} />}
            >
              {fmtPositionAmount(amount)}
            </Prov>
          </span>
        </>
      ) : (
        <span className="font-semibold text-rb-500">
          <Prov
            info={afterProv}
            value={exact?.after}
            icon={<TokenChipIcon symbol={symbol} address={address} size={16} />}
          >
            {fmtPositionAmount(amount)}
          </Prov>
        </span>
      )}
      {showTickerLabels && <span className="text-xs">{ticker}</span>}
      {showUsdValues && usd != null && (
        <span className="text-xs flex font-bold items-center text-rb-500 border-l-2 border-r-2 ml-0.5 border-rb-500 rounded-sm px-1 py-0">
          <Prov info={usd.prov} value={usd.exact}>
            {fmtPositionUsd(usd.value)}
          </Prov>
        </span>
      )}
      {trailing}
    </span>
  );
}

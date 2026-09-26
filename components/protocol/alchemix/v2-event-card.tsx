"use client";

// One event of an Alchemix V2 account, in the universal EventCard shell.
//
// UNITS ARE THE TOKEN'S. Every amount is scaled by the decimals of the token it
// is in, from the row itself: the synthetic's 18, the yield token's own (6 on
// yvUSDC and yvUSDT), the underlying's (6 on USDC and USDT). `Withdraw` and
// `Liquidate` state SHARES of a yield token, which are the Alchemist's own
// accounting and no token anybody holds, so a share count is never drawn as
// if it were one: wherever it stands it says "shares".
//
// SPINE GRAMMAR, as on the V3 card: the holder's own moves draw token rows on a
// solid spine with the amount beside them at ≥sm and the header carrying the
// verbs (detail-page-anatomy §4); a liquidation draws the critical triangle.
//
// THE VERSION IS NAMED ON THE ROW where the timeline carries both versions (a
// V3 position showing its holder's V2 account), and not on the V2 page, where
// every row is V2 and the page name already says so.

import { EventCard } from "@/components/shared/event-card";
import { SpineColumn, type SpineTokenRow } from "@/components/shared/spine-column";
import {
  ChainTruthDetail,
  ChainTruthRow,
  type ChainTruthDelta,
  type ChainTruthRowSpec,
  type ChainTruthStat,
} from "@/components/shared/chain-truth-event";
import { formatExact, formatUnitsExact } from "@/lib/utils/format";
import { formatCompact } from "@/lib/shared/format-event";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import type { AlchemixV2Context, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { ChainId } from "@/lib/shared/chains";
import { v2EmittedProv, type AlchemixV2Coords } from "@/lib/alchemix/v2-provenance";

export type AlchemixV2Event = BaseActivityEvent & { context: { protocol: "alchemix-v2"; data: AlchemixV2Context } };

/** alUSD and alETH, the two V2 synthetics: 18 decimals each, read from the
 *  tokens. The same two V3 mints. */
const SYNTHETIC_DECIMALS = 18;

const VERB: Record<AlchemixV2Context["eventType"], string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  mint: "Mint",
  burn: "Burn",
  repay: "Repay",
  liquidate: "Liquidated",
};

interface Amount {
  field: string;
  raw: string;
  decimals: number;
  symbol: string;
  address?: string;
  value: number;
  shares: boolean;
}

function coordsOf(e: AlchemixV2Event): AlchemixV2Coords {
  const d = e.context.data;
  return {
    chainId: d.chainId as ChainId,
    lineKey: d.lineKey,
    account: d.account,
    emitter: d.emitter,
    txHash: e.txHash,
    blockNumber: e.blockNumber,
  };
}

function amount(raw: string | null | undefined, decimals: number | null | undefined): number | null {
  if (raw == null || decimals == null) return null;
  const n = Number(raw.split(".")[0]);
  return Number.isFinite(n) ? n / 10 ** decimals : null;
}

/** The one amount the log moved, in the unit the log states it in. */
function movedAmount(d: AlchemixV2Context): Amount | null {
  const r = d.raw;
  const yieldSym = d.yieldToken?.symbol ?? "yield token";
  const underSym = d.underlyingToken?.symbol ?? "underlying";
  const pick = (
    field: string,
    decimals: number | null | undefined,
    symbol: string,
    shares: boolean,
    address?: string,
  ) => {
    const raw = r[field];
    const value = amount(raw, decimals);
    return raw != null && value != null && decimals != null
      ? { field, raw, decimals, symbol, address, value, shares }
      : null;
  };
  switch (d.eventType) {
    case "deposit":
      return pick("amount", d.yieldToken?.decimals, yieldSym, false, d.yieldToken?.address);
    case "withdraw":
    case "liquidate":
      return pick("shares", d.yieldToken?.decimals, yieldSym, true, d.yieldToken?.address);
    case "mint":
    case "burn":
      return pick("amount", SYNTHETIC_DECIMALS, d.syntheticSymbol, false);
    case "repay":
      return pick("amount", d.underlyingToken?.decimals, underSym, false, d.underlyingToken?.address);
    default:
      return null;
  }
}

/** The debt a Repay or Liquidate cancelled, where the log carries it. */
function credit(d: AlchemixV2Context): { raw: string; value: number } | null {
  const raw = d.raw.credit;
  const value = amount(raw, SYNTHETIC_DECIMALS);
  return raw != null && value != null ? { raw, value } : null;
}

function spine(d: AlchemixV2Context, a: Amount | null): SpineTokenRow[] {
  if (!a) return [];
  const toward: "left" | "right" =
    d.eventType === "deposit" || d.eventType === "burn" || d.eventType === "repay" ? "right" : "left";
  // A share count carries its unit beside it, so it cannot read as tokens.
  return [
    {
      symbol: a.symbol,
      address: a.address,
      direction: toward,
      value: a.shares ? `${formatCompact(a.value).display} shares` : a.value,
    },
  ];
}

function rowSpec(e: AlchemixV2Event, a: Amount | null, showVersion: boolean): ChainTruthRowSpec {
  const d = e.context.data;
  const coords = coordsOf(e);
  const deltas: ChainTruthDelta[] = [];
  if (a) {
    deltas.push({
      value: a.value,
      symbol: a.symbol,
      address: a.address,
      suffix: a.shares ? " shares" : undefined,
      label: VERB[d.eventType],
      // The number hands off to the spine at ≥sm (a liquidation's warning
      // spine carries none, and `critical` keeps it here).
      axisVerb: true,
      prov: v2EmittedProv(a.field, a.symbol, a.raw, a.decimals, coords),
    });
  }
  const c = credit(d);
  if (c && (d.eventType === "repay" || d.eventType === "liquidate")) {
    deltas.push({
      value: c.value,
      symbol: d.syntheticSymbol,
      label: "Cleared",
      prov: v2EmittedProv("credit", d.syntheticSymbol, c.raw, SYNTHETIC_DECIMALS, coords),
    });
  }
  return {
    label: showVersion ? "V2" : "",
    critical: d.eventType === "liquidate",
    deltas,
  };
}

function detailStats(e: AlchemixV2Event, a: Amount | null): ChainTruthStat[] {
  const d = e.context.data;
  const coords = coordsOf(e);
  const stats: ChainTruthStat[] = [];
  if (a) {
    const exact = formatUnitsExact(a.raw, a.decimals);
    stats.push({
      label: a.shares ? `${VERB[d.eventType]} (shares)` : VERB[d.eventType],
      value: exact,
      display: formatExact(Number(exact)),
      symbol: a.symbol,
      address: a.address,
      prov: v2EmittedProv(a.field, a.symbol, a.raw, a.decimals, coords),
    });
  }
  const c = credit(d);
  if (c) {
    const exact = formatUnitsExact(c.raw, SYNTHETIC_DECIMALS);
    stats.push({
      label: "Debt cleared",
      value: exact,
      display: formatExact(Number(exact)),
      symbol: d.syntheticSymbol,
      prov: v2EmittedProv("credit", d.syntheticSymbol, c.raw, SYNTHETIC_DECIMALS, coords),
    });
  }
  return stats;
}

function explainer(e: AlchemixV2Event, a: Amount | null): string | null {
  const d = e.context.data;
  const amt = a ? `${formatUnitsExact(a.raw, a.decimals)} ${a.symbol}` : null;
  const c = credit(d);
  const cleared = c ? `${formatUnitsExact(c.raw, SYNTHETIC_DECIMALS)} ${d.syntheticSymbol}` : null;
  switch (d.eventType) {
    case "deposit":
      return amt ? `${amt} went into the V2 Alchemist as collateral.` : null;
    case "withdraw":
      return amt ? `${amt} shares of collateral came out of the V2 Alchemist.` : null;
    case "mint":
      return amt ? `The account minted ${amt} against its collateral.` : null;
    case "burn":
      return amt ? `${amt} was burned to pay down the account's debt.` : null;
    case "repay":
      return amt
        ? cleared
          ? `${amt} repaid ${cleared} of debt.`
          : `${amt} was repaid. The log from before 11 May 2022 does not state how much debt that cleared.`
        : null;
    case "liquidate":
      return amt
        ? cleared
          ? `${amt} shares were sold to clear ${cleared} of debt.`
          : `${amt} shares were sold against the debt. The log from before 11 May 2022 does not state how much it cleared.`
        : null;
    default:
      return null;
  }
}

export function AlchemixV2EventCard({
  event,
  showVersion = false,
  isFirst,
  isLast,
  eventNumber,
}: {
  event: AlchemixV2Event;
  /** Name the version on the row: set where the timeline carries both. */
  showVersion?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
}) {
  const d = event.context.data;
  const a = movedAmount(d);
  const iconSlot =
    d.eventType === "liquidate" ? (
      <SpineColumn
        icon="warning"
        warningTone="critical"
        warningLabel="Liquidation"
        spine="dotted"
        isFirst={isFirst}
        isLast={!!isLast}
      />
    ) : (
      <SpineColumn tokens={spine(d, a)} isFirst={isFirst} isLast={!!isLast} />
    );
  const stats = detailStats(event, a);
  const line = explainer(event, a);
  return (
    <EventCard
      avatar={null}
      iconColumn={iconSlot}
      header={
        <ChainTruthRow spec={rowSpec(event, a, showVersion)} timestamp={event.timestamp} eventNumber={eventNumber} />
      }
      detail={
        stats.length > 0 ? (
          <>
            <h4 className={`${OVERLAY_HEADING} px-5 pt-2 text-rb-500`}>What the log states</h4>
            <ChainTruthDetail stats={stats} />
          </>
        ) : undefined
      }
      detailLabel="What the log states"
      explainer={line ? <p className="px-5 py-2 text-xs leading-relaxed text-rb-500">{line}</p> : undefined}
      explainerLabel="Plain English"
      explainerTeaser={line ?? undefined}
      txHash={event.txHash}
      persistKey={`alchemix-v2:${event.id}`}
    />
  );
}

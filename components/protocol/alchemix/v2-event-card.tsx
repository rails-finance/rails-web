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
// solid spine with the amount beside them, the head in words (rails-ops
// decision 0045). V2's `Liquidate` is one of those holder
// moves, not an adverse one: it is the account holder repaying their own debt
// by selling their own collateral shares, with no third party and no seizure
// (rails-ops reference/alchemix-v2-frozen-record.md). It draws the dead-end
// arrow on the same solid, agency spine, never the warning triangle.
//
// THE VERSION IS NAMED ON THE ROW where the timeline carries both versions (a
// V3 position showing its holder's V2 account), and not on the V2 page, where
// every row is V2 and the page name already says so.

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { gasPrice } from "@/components/shared/event-price-row";
import { EventLedgerContext, ROW_CELLS } from "@/components/shared/event-ledger-context";
import type { SpineColumnProps, SpineTokenRow } from "@/components/shared/spine-column";
import type { ChainTruthRowSpec, ChainTruthStat } from "@/components/shared/chain-truth-event";
import { useStatCells } from "@/components/shared/chain-truth-cells";
import { formatExact, formatUnitsExact } from "@/lib/utils/format";
import type { GasCost } from "@/lib/shared/types/event-shape";
import type { AlchemixV2Context } from "@/lib/shared/types/event-shape";
import type { ChainId } from "@/lib/shared/chains";
import { v2EmittedProv, type AlchemixV2Coords } from "@/lib/alchemix/v2-provenance";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { ALCHEMIX_V2 } from "@/lib/alchemix/learn-more";
import { formatCompactTitled } from "@/lib/shared/format-compact";
import {
  credit,
  movedAmount,
  v2Sentence,
  SYNTHETIC_DECIMALS,
  type AlchemixV2Event,
  type Amount,
} from "@/lib/alchemix/v2-lines";
import { ALCHEMIX_HEAD_WORDS, alchemixV2Kind } from "@/lib/alchemix/head-words";

const VERB: Record<AlchemixV2Context["eventType"], string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  mint: "Mint",
  burn: "Burn",
  repay: "Repay",
  // Alchemix V2's Liquidate is the account holder repaying their own debt by
  // selling their own collateral shares — nobody else is involved, so the
  // card reads as a repayment, not a liquidation (rails-ops
  // reference/alchemix-v2-frozen-record.md).
  liquidate: "Repay from collateral",
};

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
      value: a.shares ? `${formatCompactTitled(a.value).display} shares` : a.value,
    },
  ];
}

/** The row's head (decision 0045): the kind in words, "V2" beside it where
 *  the timeline carries both versions. The amount is on the spine's flank, a
 *  repayment from collateral's and the debt cleared in the cells. */
function rowSpec(e: AlchemixV2Event, showVersion: boolean): ChainTruthRowSpec {
  return {
    label: alchemixV2Kind(e.context.data),
    deltas: [],
    note: showVersion ? <span data-alchemix-version="">{ALCHEMIX_HEAD_WORDS.v2}</span> : undefined,
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

/** The gas, where the account acted on Ethereum: the index's figure is
 *  the transaction's, and on an L2 it leaves out the L1 data fee. */
function ownerGas(e: AlchemixV2Event): GasCost | undefined {
  const d = e.context.data;
  return d.chainId === 1 && e.wallet?.toLowerCase() === d.account.toLowerCase() ? e.gas : undefined;
}

export type { AlchemixV2Event };

export function AlchemixV2EventCard({
  event,
  showVersion = false,
  isLast,
  eventNumber,
}: {
  event: AlchemixV2Event;
  /** Name the version on the row: set where the timeline carries both. */
  showVersion?: boolean;
  isLast?: boolean;
  eventNumber?: number;
}) {
  const d = event.context.data;
  const a = movedAmount(d);
  const toCells = useStatCells();
  const spineProps: SpineColumnProps =
    // Repayment styling, no warning: the holder's own action closes with the
    // dead-end arrow on a solid (agency) spine, the same register as V3's
    // self-liquidation `close` mark.
    d.eventType === "liquidate" ? { icon: "dead-end", isLast: !!isLast } : { tokens: spine(d, a), isLast: !!isLast };
  const stats = detailStats(event, a);
  const line = v2Sentence(event, a);
  const spec = rowSpec(event, showVersion);
  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "alchemix-v2",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine: spineProps,
    head: spec,
    caption: spec.label,
    // The log's figures are the event's cells: V2 took no reading.
    cells:
      stats.length > 0
        ? toCells(stats.map((s, i) => ({ ...s, key: `log-${i}` })))
        : { none: "the log states no amount" },
    ledgers: { none: "no flows panel on the V2 Alchemist" },
    notes:
      stats.length > 0 ? (
        <p className="px-5 pb-3 text-[11px] leading-relaxed text-rb-500">
          V2 records what each event moved{credit(d) ? " and the debt it cleared" : ""}. It took no reading of the
          account&rsquo;s debt or collateral here, so no before and after is shown.
        </p>
      ) : undefined,
    price: gasPrice(ownerGas(event)),
    // The one sentence is the teaser, which the pane draws as its lead; the
    // body adds nothing, so the sentence shows once.
    explainer: { body: line ? <ProseExplainer items={[]} /> : null, first: line ?? undefined },
    learnMore: <LearnMore inline content={ALCHEMIX_V2} />,
  };
  return (
    <EventLedgerContext.Provider value={ROW_CELLS}>
      <EventCard slots={slots} avatar={null} />
    </EventLedgerContext.Provider>
  );
}

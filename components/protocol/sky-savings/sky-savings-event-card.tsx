"use client";

// One Sky Savings event on the timeline: a Deposit, Withdrawal, Received, Sent
// or Transfer to self, from the sealed sUSDS ledger. The disclosure ladder
// (rails-ops standards/detail-page-anatomy.md):
//   T1 — the header: the verb and the amounts, each unit named in words (USDS
//        and sUSDS on a deposit or withdrawal; sUSDS and its USDS worth on a
//        transfer, with the other address), who deposited when it was another
//        address, and the referral code a deposit carried.
//   T2 — the opened card: sUSDS held and its worth before → after, the
//        interest earned to date and since the previous event, the share price and the Savings Rate at
//        the event's block, the referral code.
//   T3 — the explanation of this event's figures (sky-savings-event-explainer).
//   T4 — the lesson for the kind (lib/sky-savings/learn-more.ts).
//
// Spine: the wallet is on the left and the savings module on the right. A
// deposit sends USDS right and brings sUSDS left; a withdrawal the reverse. A
// transfer is custody (the paper plane): shares went to or came from another
// address and nothing crossed the module.

import { EventCard } from "@/components/shared/event-card";
import { SpineColumn, type SpineTokenRow } from "@/components/shared/spine-column";
import {
  ChainTruthDetail,
  ChainTruthRow,
  chainTruthDeltaValue,
  type ChainTruthDelta,
  type ChainTruthRowSpec,
  type ChainTruthStat,
} from "@/components/shared/chain-truth-event";
import { StatCard } from "@/components/shared/state-transition";
import { Prov } from "@/components/shared/provenance";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { formatCompact, withRealMinus } from "@/lib/utils/format";
import type { BaseActivityEvent, SkySavingsContext } from "@/lib/shared/types/event-shape";
import { SUSDS, USDS } from "@/lib/sky-savings/constants";
import {
  annualRate,
  exact,
  fixed6,
  pct,
  pctString,
  rayExact,
  rayNumber,
  skyTransition,
  units,
} from "@/lib/sky-savings/math";
import {
  eventChiProv,
  eventCounterpartyProv,
  eventEarnedProv,
  eventInterestSinceProv,
  eventRateProv,
  eventReferralProv,
  eventSharesAfterProv,
  eventSharesBeforeProv,
  eventSharesProv,
  eventUsdsProv,
  eventValueProv,
  type SkyEventCoords,
} from "@/lib/sky-savings/provenance";
import { skyEventContent } from "@/lib/sky-savings/learn-more";
import { skyInterestSince, type SkyPreviousEvent } from "@/lib/sky-savings/explainer-clauses";
import { SkySavingsEventExplainer } from "./sky-savings-event-explainer";

export type SkySavingsEvent = BaseActivityEvent & { context: { protocol: "sky-savings"; data: SkySavingsContext } };

const LABEL: Record<SkySavingsContext["eventType"], string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  received: "Received",
  sent: "Sent",
  self: "Transfer to self",
};

/** A signed raw difference as its exact decimal with a real minus. */
const signedExact = (v: bigint) => (v < BigInt(0) ? `−${exact(-v)}` : `+${exact(v)}`);
const signedCompact = (v: bigint) => {
  const n = units(v < BigInt(0) ? -v : v);
  return `${v < BigInt(0) ? "−" : "+"}${formatCompact(n)}`;
};

export function SkySavingsEventCard({
  event,
  isFirst,
  isLast,
  eventNumber,
  previous,
}: {
  event: SkySavingsEvent;
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
  /** The holder's event before this one: null for the first, undefined when
   *  it is older than the rows the page holds. */
  previous?: SkyPreviousEvent | null;
}) {
  const c = event.context.data;
  const coords: SkyEventCoords = { block: event.blockNumber, txHash: event.txHash, holder: c.holder };
  const kind = c.eventType;
  const t = skyTransition(c);
  const sharesMoved = units(t.sharesDelta);
  const usdsMoved = units(t.usds);
  const sharesProv = eventSharesProv(
    coords,
    kind,
    (t.sharesDelta < BigInt(0) ? -t.sharesDelta : t.sharesDelta).toString(),
  );
  const usdsProv = eventUsdsProv(
    coords,
    kind,
    c.usds,
    c.usdsSource,
    c.chi,
    (t.sharesDelta < BigInt(0) ? -t.sharesDelta : t.sharesDelta).toString(),
  );
  const rateText = pct(annualRate(c.ssr));
  const isTransfer = kind === "received" || kind === "sent";

  // ── T1 ────────────────────────────────────────────────────────────────────
  const deltas: ChainTruthDelta[] = [];
  const tokens: SpineTokenRow[] = [];
  if (kind === "deposit" || kind === "withdrawal") {
    const usdsSigned = kind === "deposit" ? usdsMoved : -usdsMoved;
    // Each amount names its unit in words beside its mark: at ≥sm the figure
    // rides the spine and the words stay in the header.
    deltas.push({
      value: usdsSigned,
      symbol: USDS.symbol,
      address: USDS.address,
      prov: usdsProv,
      label: kind === "deposit" ? "USDS in" : "USDS out",
      axisVerb: true,
    });
    tokens.push({
      symbol: USDS.symbol,
      address: USDS.address,
      direction: kind === "deposit" ? "right" : "left",
      value: usdsMoved,
      prov: { info: usdsProv, value: chainTruthDeltaValue(usdsSigned, false), symbol: USDS.symbol },
    });
    deltas.push({
      value: sharesMoved,
      symbol: SUSDS.symbol,
      address: SUSDS.address,
      prov: sharesProv,
      label: kind === "deposit" ? "sUSDS minted" : "sUSDS burned",
      axisVerb: true,
    });
    tokens.push({
      symbol: SUSDS.symbol,
      address: SUSDS.address,
      direction: sharesMoved < 0 ? "right" : "left",
      value: Math.abs(sharesMoved),
      prov: { info: sharesProv, value: chainTruthDeltaValue(sharesMoved, false), symbol: SUSDS.symbol },
    });
  } else if (isTransfer) {
    // A transfer moves sUSDS only; its worth in USDS rides beside it.
    deltas.push({
      value: sharesMoved,
      symbol: SUSDS.symbol,
      address: SUSDS.address,
      prov: sharesProv,
      suffix: SUSDS.symbol,
    });
    deltas.push({
      value: usdsMoved,
      symbol: USDS.symbol,
      address: USDS.address,
      prov: usdsProv,
      label: "worth",
      suffix: USDS.symbol,
      noSpineCounterpart: true,
    });
    tokens.push({ symbol: SUSDS.symbol, address: SUSDS.address, badge: "send" });
  }

  const holder = c.holder.toLowerCase();
  const other = c.counterparty?.toLowerCase() ?? null;
  const party: ChainTruthRowSpec["party"] =
    isTransfer && other
      ? { prefix: kind === "sent" ? "to" : "from", address: other, prov: eventCounterpartyProv(coords, kind) }
      : kind === "deposit" && other && other !== holder
        ? { prefix: "for this address by", address: other, prov: eventCounterpartyProv(coords, kind) }
        : kind === "withdrawal" && other && other !== holder
          ? { prefix: "to", address: other, prov: eventCounterpartyProv(coords, kind) }
          : undefined;
  const referralProv = c.referral != null ? eventReferralProv(coords, c.referral) : null;
  const spec: ChainTruthRowSpec = {
    label: LABEL[kind],
    custody: isTransfer,
    custodyLabel: isTransfer,
    deltas,
    party,
    // The referral code rides the header's trailing chip, as an echo of the
    // code's receipt in the opened card.
    ratioChip:
      referralProv && c.referral != null
        ? { text: `Referral ${c.referral}`, value: String(c.referral), prov: referralProv }
        : undefined,
  };

  // ── T2 ────────────────────────────────────────────────────────────────────
  const sharesChanged = t.sharesDelta !== BigInt(0);
  const since = skyInterestSince(c, previous);
  // Omitted where the balance was empty in between (nothing to earn).
  const sinceRaw = since != null && previous && since !== BigInt(0) ? since : null;
  const stats: ChainTruthStat[] = [
    {
      label: "sUSDS held",
      value: exact(t.sharesAfter),
      symbol: SUSDS.symbol,
      address: SUSDS.address,
      prov: eventSharesAfterProv(coords, c.sharesAfter),
      changed: sharesChanged,
      transition: sharesChanged
        ? {
            before: formatCompact(units(t.sharesBefore)),
            beforeExact: exact(t.sharesBefore),
            beforeProv: eventSharesBeforeProv(coords, t.sharesBefore.toString()),
            change: signedCompact(t.sharesDelta),
            changeExact: signedExact(t.sharesDelta),
            changeProv: sharesProv,
          }
        : undefined,
    },
    {
      label: "Worth in USDS",
      value: exact(t.valueAfter),
      symbol: USDS.symbol,
      address: USDS.address,
      prov: eventValueProv(coords, "after", c.valueAfter, c.sharesAfter, c.chi),
      changed: sharesChanged,
      transition: sharesChanged
        ? {
            before: formatCompact(units(t.valueBefore)),
            beforeExact: exact(t.valueBefore),
            beforeProv: eventValueProv(coords, "before", t.valueBefore.toString(), t.sharesBefore.toString(), c.chi),
            change: signedCompact(t.valueAfter - t.valueBefore),
            changeExact: signedExact(t.valueAfter - t.valueBefore),
            changeProv: eventValueProv(coords, "after", c.valueAfter, c.sharesAfter, c.chi),
          }
        : undefined,
    },
    {
      label: "Interest earned since the first event",
      value: withRealMinus(exact(t.earnedAfter)),
      // A first deposit's one wei of rounding reads 0.000 here; T3 states it.
      display: t.earnedAfter < BigInt(0) && t.earnedAfter > BigInt(-1_000_000) ? "0.000" : undefined,
      symbol: USDS.symbol,
      address: USDS.address,
      prov: eventEarnedProv(coords, "after", c.earnedAfter),
      // A deposit, withdrawal or transfer moves USDS in or out at the share
      // price of its block, so interest earned stands still across it; what
      // moved it is the time since the previous event.
      changed: false,
      interestSincePrevious:
        sinceRaw != null && previous
          ? {
              value: exact(sinceRaw),
              display: fixed6(sinceRaw),
              after: previous.rateChanges
                ? `, across ${previous.rateChanges.count} Savings Rate change${previous.rateChanges.count === 1 ? "" : "s"}, ${pctString(previous.rateChanges.from)} → ${pctString(previous.rateChanges.to)}`
                : undefined,
              prov: eventInterestSinceProv(
                coords,
                sinceRaw.toString(),
                previous.blockNumber,
                previous.ctx.valueAfter,
                t.valueBefore.toString(),
              ),
            }
          : undefined,
    },
    {
      label: "One sUSDS worth",
      value: rayExact(c.chi),
      display: rayNumber(c.chi).toFixed(6),
      symbol: USDS.symbol,
      address: USDS.address,
      prov: eventChiProv(coords, c.chi, c.usdsSource === "log"),
      changed: false,
      sub: (
        <>
          Savings Rate{" "}
          <Prov info={eventRateProv(coords, c.ssr, rateText)} value={rateText}>
            <span>{rateText}</span>
          </Prov>
        </>
      ),
    },
  ];
  const detail = (
    <>
      <ChainTruthDetail
        stats={stats}
        symbolText
        extra={
          referralProv && c.referral != null ? (
            <StatCard label="Referral code">
              <Prov info={referralProv} value={String(c.referral)}>
                <span className="text-sm font-semibold tabular-nums text-foreground">{c.referral}</span>
              </Prov>
            </StatCard>
          ) : undefined
        }
      />
    </>
  );

  // ── the spine ─────────────────────────────────────────────────────────────
  const iconColumn =
    kind === "self" || tokens.length === 0 ? (
      <SpineColumn icon="no-change" isFirst={isFirst} isLast={!!isLast} />
    ) : (
      <SpineColumn tokens={tokens} isFirst={isFirst} isLast={!!isLast} />
    );

  return (
    <EventCard
      avatar={null}
      iconColumn={iconColumn}
      header={<ChainTruthRow spec={spec} timestamp={event.timestamp} eventNumber={eventNumber} />}
      detail={detail}
      detailLabel="Position after this event"
      explainer={<SkySavingsEventExplainer ctx={c} previous={previous} />}
      explainerLabel="Plain English"
      txHash={event.txHash}
      learnMore={<LearnMore inline content={skyEventContent(kind)} />}
      persistKey={`sky-savings:${event.id}`}
    />
  );
}

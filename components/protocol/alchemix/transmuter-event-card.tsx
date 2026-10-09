"use client";

// One transaction of a Transmuter position, in the universal EventCard shell.
//
// ONE TRANSACTION IS ONE CARD, as on the Alchemist timeline. A stake emits the
// Transmuter NFT's mint and `PositionCreated` together; a claim emits
// `PositionClaimed` beside the burn of the NFT, often after a hop through a
// routing contract. They arrive here together and read as one row.
//
// SPINE GRAMMAR. The stake draws the synthetic moving right, into the
// Transmuter. The claim draws two rows moving left, toward the wallet: the
// vault shares the converted part paid out, and the synthetic handed back.
// Each moved amount shows once: the numbers ride the spine at ≥sm and the
// header carries the verbs (detail-page-anatomy §4). A custody move draws the
// send mark and no direction. A poke moves nothing and draws nothing.
//
// NO READING. These rows carry no `stateAtBlockFromReading`, and the card
// states none: a Transmuter position has no getCDP.

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { gasPrice } from "@/components/shared/event-price-row";
import { EventLedgerContext, ROW_CELLS } from "@/components/shared/event-ledger-context";
import { LearnMore } from "@/components/shared/learn-more-modal";
import type { SpineColumnProps, SpineTokenRow } from "@/components/shared/spine-column";
import {
  type ChainTruthDelta,
  type ChainTruthRowSpec,
  type ChainTruthStat,
  chainTruthCaption,
} from "@/components/shared/chain-truth-event";
import { statCell } from "@/components/shared/chain-truth-cells";
import { ALCHEMIX_TRANSMUTER } from "@/lib/alchemix/learn-more";
import { formatExact, formatUnitsExact } from "@/lib/utils/format";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import type { AlchemixV3Context, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AlchemixCoords } from "@/lib/alchemix/event-provenance";
import { transmuterEarlyClaimProv, transmuterEmittedProv } from "@/lib/alchemix/transmuter-provenance";
import type { TransmuterEarlyClaim } from "@/lib/alchemix/transmuter-early-claim";

export type TransmuterEvent = BaseActivityEvent & { context: { protocol: "alchemix-v3"; data: AlchemixV3Context } };

const scaled = (raw: string | null | undefined): number => {
  if (raw == null) return 0;
  const n = Number(raw.split(".")[0]);
  return Number.isFinite(n) ? n / 1e18 : 0;
};

const positive = (raw: string | null | undefined): boolean =>
  raw != null && /^\d+$/.test(raw) && BigInt(raw) > BigInt(0);

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const isZero = (a: string | undefined) => !a || /^0x0{40}$/i.test(a);

export function coordsForTransmuterLeg(leg: TransmuterEvent): AlchemixCoords {
  const ctx = leg.context.data;
  return {
    chainId: ctx.chainId as AlchemixCoords["chainId"],
    lineKey: ctx.lineKey,
    tokenId: ctx.tokenId ?? "",
    emitter: ctx.emitter,
    txHash: leg.txHash,
    blockNumber: leg.blockNumber,
  };
}

const find = (legs: TransmuterEvent[], type: string) => legs.find((l) => l.context.data.eventType === type);

/** The vault share a claim paid out in. The claim's own flow names it; the
 *  position's row is the fallback. */
function claimShareSymbol(claim: TransmuterEvent, mytSymbol: string): string {
  const syn = claim.context.data.syntheticSymbol;
  return claim.flows.find((f) => f.tokenSymbol !== syn)?.tokenSymbol ?? mytSymbol;
}

function spineTokens(legs: TransmuterEvent[], mytSymbol: string): SpineTokenRow[] {
  const created = find(legs, "transmuter_position_created");
  const claimed = find(legs, "transmuter_position_claimed");
  const rows: SpineTokenRow[] = [];
  if (created) {
    const d = created.context.data;
    rows.push({ symbol: d.syntheticSymbol, direction: "right", value: scaled(d.raw.amount_staked) });
  }
  if (claimed) {
    const d = claimed.context.data;
    if (positive(d.raw.amount_claimed)) {
      rows.push({
        symbol: claimShareSymbol(claimed, mytSymbol),
        direction: "left",
        value: scaled(d.raw.amount_claimed),
      });
    }
    if (positive(d.raw.amount_unclaimed)) {
      rows.push({ symbol: d.syntheticSymbol, direction: "left", value: scaled(d.raw.amount_unclaimed) });
    }
  }
  return rows;
}

function rowSpec(legs: TransmuterEvent[], mytSymbol: string): ChainTruthRowSpec {
  const created = find(legs, "transmuter_position_created");
  const claimed = find(legs, "transmuter_position_claimed");
  const poked = find(legs, "transmuter_position_poked");
  const transfers = legs.filter((l) => l.context.data.eventType === "transfer");
  const mint = transfers.find((l) => l.context.data.transfer?.transferType === "mint");
  const deltas: ChainTruthDelta[] = [];

  if (created) {
    const d = created.context.data;
    const coords = coordsForTransmuterLeg(created);
    deltas.push({
      value: scaled(d.raw.amount_staked),
      symbol: d.syntheticSymbol,
      label: "Stake",
      axisVerb: true,
      prov: transmuterEmittedProv("amount_staked", d.syntheticSymbol, d.raw.amount_staked ?? null, coords),
    });
    // Where the new position landed, once: the mint's recipient.
    const to = mint?.context.data.transfer?.toAddress;
    return {
      label: "Open",
      status: "open",
      deltas,
      party: to
        ? {
            prefix: "to",
            address: to,
            ens: true,
            prov: transmuterEmittedProv("to_addr", d.syntheticSymbol, null, coordsForTransmuterLeg(mint!)),
          }
        : undefined,
    };
  }

  if (claimed) {
    const d = claimed.context.data;
    const coords = coordsForTransmuterLeg(claimed);
    const share = claimShareSymbol(claimed, mytSymbol);
    if (positive(d.raw.amount_claimed)) {
      deltas.push({
        value: scaled(d.raw.amount_claimed),
        symbol: share,
        label: "Paid out",
        axisVerb: true,
        prov: transmuterEmittedProv("amount_claimed", share, d.raw.amount_claimed ?? null, coords),
      });
    }
    if (positive(d.raw.amount_unclaimed)) {
      deltas.push({
        value: scaled(d.raw.amount_unclaimed),
        symbol: d.syntheticSymbol,
        label: "Handed back",
        axisVerb: true,
        prov: transmuterEmittedProv("amount_unclaimed", d.syntheticSymbol, d.raw.amount_unclaimed ?? null, coords),
      });
    }
    return {
      label: "Claim",
      deltas,
      party: d.raw.claimer
        ? {
            prefix: "by",
            address: d.raw.claimer,
            ens: true,
            prov: transmuterEmittedProv("claimer", d.syntheticSymbol, null, coords),
          }
        : undefined,
    };
  }

  if (poked) {
    return { label: poked.actionLabel, deltas };
  }

  // Custody alone: where the position ended the transaction.
  const last = transfers[transfers.length - 1];
  const t = last?.context.data.transfer;
  const burned = t?.transferType === "burn";
  const counterparty = burned ? t?.fromAddress : t?.toAddress;
  return {
    label: last?.actionLabel ?? "Transfer",
    deltas,
    custody: true,
    party:
      counterparty && !isZero(counterparty)
        ? {
            prefix: burned ? "from" : "to",
            address: counterparty,
            ens: true,
            prov: transmuterEmittedProv(
              burned ? "from_addr" : "to_addr",
              last.context.data.syntheticSymbol,
              null,
              coordsForTransmuterLeg(last),
            ),
          }
        : undefined,
  };
}

const plain = (raw: string) => (Number(raw) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (share: number) => `${(share * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

/** The sentence a claim before maturity owes its reader: what converted, what
 *  came back, what the fee took, and why only part converted. */
export function earlyClaimSentence(
  e: TransmuterEarlyClaim,
  syn: string,
  share: string,
  paidOutRaw: string,
  withWhy = true,
): string {
  return (
    `This claim came ${e.blocksEarly.toLocaleString("en-US")} blocks before maturity, when ${pct(e.termPassed)} of the blocks from the stake to its maturity had passed. ` +
    `${withWhy ? "A stake converts a little every block until it matures, so " : "So "}${plain(e.convertedRaw)} ${syn} had converted and was paid out as ${plain(paidOutRaw)} ${share}. ` +
    `Of the ${plain(e.unconvertedRaw)} ${syn} still to convert, ${plain(e.returnedRaw)} came back as ${syn} and the Transmuter kept ${plain(e.exitFeeRaw)} ${syn}, ${pct(e.exitFeeShare)}, as its early exit fee.`
  );
}

function detailStats(legs: TransmuterEvent[], mytSymbol: string, early: TransmuterEarlyClaim | null): ChainTruthStat[] {
  const stats: ChainTruthStat[] = [];
  for (const leg of legs) {
    const d = leg.context.data;
    const coords = coordsForTransmuterLeg(leg);
    const stat = (label: string, field: string, symbol: string) => {
      const raw = d.raw[field];
      if (raw == null) return;
      const exact = formatUnitsExact(raw, 18);
      stats.push({
        label,
        value: exact,
        display: formatExact(Number(exact)),
        symbol,
        prov: transmuterEmittedProv(field, symbol, raw, coords),
      });
    };
    if (d.eventType === "transmuter_position_created") stat("Staked", "amount_staked", d.syntheticSymbol);
    if (d.eventType === "transmuter_position_claimed") {
      stat("Paid out", "amount_claimed", claimShareSymbol(leg, mytSymbol));
      stat("Handed back", "amount_unclaimed", d.syntheticSymbol);
      if (early) {
        const computed = (label: string, part: "converted" | "unconverted" | "exit-fee", raw: string) => {
          const exact = formatUnitsExact(raw, 18);
          stats.push({
            label,
            value: exact,
            display: formatExact(Number(exact)),
            symbol: d.syntheticSymbol,
            prov: transmuterEarlyClaimProv(part, d.syntheticSymbol, early, coords),
          });
        };
        computed("Converted, by the blocks passed", "converted", early.convertedRaw);
        computed("Not yet converted", "unconverted", early.unconvertedRaw);
        computed("Early exit fee", "exit-fee", early.exitFeeRaw);
      }
    }
    if (d.eventType === "transmuter_position_poked")
      stat("Removed from the cap", "amount_removed_from_cap", d.syntheticSymbol);
  }
  return stats;
}

/** The transaction in plain words, one sentence a leg. The stake or the claim
 *  leads, since it is what the card is about; the NFT's moves follow in log
 *  order. */
function explainerLines(legs: TransmuterEvent[], mytSymbol: string, early: TransmuterEarlyClaim | null): string[] {
  const out: string[] = [];
  const ordered = [
    ...legs.filter((l) => l.context.data.eventType !== "transfer"),
    ...legs.filter((l) => l.context.data.eventType === "transfer"),
  ];
  for (const leg of ordered) {
    const d = leg.context.data;
    const amount = (field: string) => formatUnitsExact(d.raw[field] ?? "0", 18);
    switch (d.eventType) {
      case "transmuter_position_created":
        out.push(
          `${amount("amount_staked")} ${d.syntheticSymbol} went into the Transmuter to be converted at maturity, opening this position.`,
        );
        break;
      case "transmuter_position_claimed":
        if (early) {
          out.push(
            earlyClaimSentence(early, d.syntheticSymbol, claimShareSymbol(leg, mytSymbol), d.raw.amount_claimed ?? "0"),
          );
          break;
        }
        out.push(
          `The claim paid out ${amount("amount_claimed")} ${claimShareSymbol(leg, mytSymbol)} for the part of the stake that had converted, and handed back ${amount("amount_unclaimed")} ${d.syntheticSymbol} that had not.`,
        );
        break;
      case "transmuter_position_poked":
        out.push("The position was poked. A poke updates the Transmuter's accounting and moves no tokens.");
        break;
      case "transfer": {
        const t = d.transfer;
        if (t?.transferType === "mint") out.push(`The Transmuter minted the position's NFT to ${short(t.toAddress)}.`);
        else if (t?.transferType === "burn") out.push("The claim burned the position's NFT, which ends the position.");
        else if (t) out.push(`The position's NFT moved from ${short(t.fromAddress)} to ${short(t.toAddress)}.`);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export function TransmuterEventCard({
  legs,
  mytSymbol,
  holders = [],
  isLast,
  eventNumber,
  early = null,
}: {
  /** The legs of ONE transaction, in log order. */
  legs: TransmuterEvent[];
  mytSymbol: string;
  /** The addresses that held the position (creator, owner, claimer), lower
   *  case: a transaction one of them sent paid the gas. */
  holders?: string[];
  /** The position's claim split into its parts, where it came before
   *  maturity; the claim's own log does not carry the stake or its term. */
  early?: TransmuterEarlyClaim | null;
  isLast?: boolean;
  eventNumber?: number;
}) {
  const lead = legs[0];
  const custodyOnly = legs.every((l) => l.context.data.eventType === "transfer");
  const tokens = spineTokens(legs, mytSymbol);
  const spine: SpineColumnProps = custodyOnly
    ? { tokens: [{ symbol: lead.context.data.syntheticSymbol, badge: "send" }], isLast: !!isLast }
    : { tokens, isLast: !!isLast };
  const claimLeg = find(legs, "transmuter_position_claimed");
  const earlyHere = claimLeg ? early : null;
  const stats = detailStats(legs, mytSymbol, earlyHere);
  const lines = explainerLines(legs, mytSymbol, earlyHere);
  const spec = rowSpec(legs, mytSymbol);
  // The gas, where a holder sent every leg on Ethereum: the index's figure is
  // the transaction's, and on Base it leaves out the L1 data fee.
  const ownerPaid =
    lead.context.data.chainId === 1 && legs.every((l) => holders.includes(l.wallet?.toLowerCase() ?? ""));
  const gas = ownerPaid ? legs.find((l) => l.gas && l.gas.gasCostEth > 0)?.gas : undefined;

  const slots: EventCardSlots = {
    event: {
      id: lead.id,
      family: "alchemix-v3",
      txHash: lead.txHash,
      blockNumber: lead.blockNumber,
      timestamp: lead.timestamp,
      number: eventNumber,
    },
    spine,
    head: spec,
    caption: chainTruthCaption(spec) ?? "",
    // The logs' figures are the event's cells: a Transmuter position has no
    // reading.
    cells: stats.length > 0 ? stats.map((s, i) => statCell(s, `log-${i}`)) : { none: "the logs state no amount" },
    ledgers: { none: "no flows panel on the Transmuter" },
    price: gasPrice(gas),
    // The first sentence is the teaser, which the pane draws as its lead
    // bullet; the pane lists the rest, so no sentence shows twice.
    explainer: { body: lines.length > 0 ? <ProseExplainer items={lines.slice(1)} /> : null, first: lines[0] },
    learnMore: <LearnMore inline content={ALCHEMIX_TRANSMUTER} />,
  };
  return (
    <EventLedgerContext.Provider value={ROW_CELLS}>
      <EventCard slots={slots} avatar={null} />
    </EventLedgerContext.Provider>
  );
}

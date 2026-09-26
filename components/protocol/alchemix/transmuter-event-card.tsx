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
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import type { AlchemixV3Context, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AlchemixCoords } from "@/lib/alchemix/event-provenance";
import { transmuterEmittedProv } from "@/lib/alchemix/transmuter-provenance";

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

function detailStats(legs: TransmuterEvent[], mytSymbol: string): ChainTruthStat[] {
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
    }
    if (d.eventType === "transmuter_position_poked")
      stat("Removed from the cap", "amount_removed_from_cap", d.syntheticSymbol);
  }
  return stats;
}

/** The transaction in plain words, one sentence a leg. */
function explainerLines(legs: TransmuterEvent[], mytSymbol: string): string[] {
  const out: string[] = [];
  for (const leg of legs) {
    const d = leg.context.data;
    const amount = (field: string) => formatUnitsExact(d.raw[field] ?? "0", 18);
    switch (d.eventType) {
      case "transmuter_position_created":
        out.push(
          `${amount("amount_staked")} ${d.syntheticSymbol} went into the Transmuter to be converted at maturity, opening this position.`,
        );
        break;
      case "transmuter_position_claimed":
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
  isFirst,
  isLast,
  eventNumber,
}: {
  /** The legs of ONE transaction, in log order. */
  legs: TransmuterEvent[];
  mytSymbol: string;
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
}) {
  const lead = legs[0];
  const custodyOnly = legs.every((l) => l.context.data.eventType === "transfer");
  const tokens = spineTokens(legs, mytSymbol);
  const iconSlot = custodyOnly ? (
    <SpineColumn
      tokens={[{ symbol: lead.context.data.syntheticSymbol, badge: "send" }]}
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : (
    <SpineColumn tokens={tokens} isFirst={isFirst} isLast={!!isLast} />
  );
  const stats = detailStats(legs, mytSymbol);
  const lines = explainerLines(legs, mytSymbol);

  return (
    <EventCard
      avatar={null}
      iconColumn={iconSlot}
      header={<ChainTruthRow spec={rowSpec(legs, mytSymbol)} timestamp={lead.timestamp} eventNumber={eventNumber} />}
      detail={
        stats.length > 0 ? (
          <>
            <h4 className={`${OVERLAY_HEADING} px-5 pt-2 text-rb-500`}>
              {legs.length > 1 ? "What the logs state" : "What the log states"}
            </h4>
            <ChainTruthDetail stats={stats} />
          </>
        ) : undefined
      }
      detailLabel="What the logs state"
      explainer={
        lines.length > 0 ? (
          <ul className="list-disc space-y-1 px-5 py-2 pl-9 text-xs leading-relaxed text-rb-500">
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : undefined
      }
      explainerLabel="Plain English"
      explainerTeaser={lines[0]}
      txHash={lead.txHash}
      persistKey={`alchemix-v3:${lead.id}`}
    />
  );
}

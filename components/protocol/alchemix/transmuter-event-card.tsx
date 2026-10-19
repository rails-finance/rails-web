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
// Each moved amount shows once, on the spine; the head is words (rails-ops
// decision 0045). A custody move draws the
// send mark and no direction. A poke moves nothing and draws nothing.
//
// NO READING. These rows carry no `stateAtBlockFromReading`, and the card
// states none: a Transmuter position has no getCDP.

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { gasPrice } from "@/components/shared/event-price-row";
import { EventLedgerContext, ROW_CELLS } from "@/components/shared/event-ledger-context";
import { LearnMore } from "@/components/shared/learn-more-modal";
import type { SpineColumnProps, SpineTokenRow } from "@/components/shared/spine-column";
import { PartyChip, type ChainTruthRowSpec, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { useStatCells } from "@/components/shared/chain-truth-cells";
import { ALCHEMIX_TRANSMUTER } from "@/lib/alchemix/learn-more";
import { formatExact, formatUnitsExact } from "@/lib/utils/format";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import type { AlchemixV3Context, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AlchemixCoords } from "@/lib/alchemix/event-provenance";
import { transmuterEarlyClaimProv, transmuterEmittedProv } from "@/lib/alchemix/transmuter-provenance";
import type { TransmuterEarlyClaim } from "@/lib/alchemix/transmuter-early-claim";
import {
  claimShareSymbol,
  earlyClaimSentence,
  transmuterExplainerLines,
  type TransmuterEvent,
} from "@/lib/alchemix/transmuter-lines";
import { ALCHEMIX_HEAD_WORDS, alchemixLegKind } from "@/lib/alchemix/head-words";

export { earlyClaimSentence, type TransmuterEvent };

const scaled = (raw: string | null | undefined): number => {
  if (raw == null) return 0;
  const n = Number(raw.split(".")[0]);
  return Number.isFinite(n) ? n / 1e18 : 0;
};

const positive = (raw: string | null | undefined): boolean =>
  raw != null && /^\d+$/.test(raw) && BigInt(raw) > BigInt(0);

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

/** The row's head (decision 0045): the kind in words, the chip that names
 *  where the position landed or who claimed it, and on a custody move the
 *  counterparty as the clause. The amounts are on the spine's flank and in
 *  the cells. `caption`: the words in one line. */
function rowSpec(legs: TransmuterEvent[]): { spec: ChainTruthRowSpec; caption: string } {
  const created = find(legs, "transmuter_position_created");
  const claimed = find(legs, "transmuter_position_claimed");
  const poked = find(legs, "transmuter_position_poked");
  const transfers = legs.filter((l) => l.context.data.eventType === "transfer");
  const mint = transfers.find((l) => l.context.data.transfer?.transferType === "mint");

  if (created) {
    const d = created.context.data;
    // Where the new position landed, once: the mint's recipient. The chip
    // prefixes are literals, which check:parties maps to their roles.
    const to = mint?.context.data.transfer?.toAddress;
    return {
      spec: {
        label: ALCHEMIX_HEAD_WORDS.staked,
        status: "open",
        deltas: [],
        party: to
          ? {
              prefix: "to",
              address: to,
              ens: true,
              prov: transmuterEmittedProv("to_addr", d.syntheticSymbol, null, coordsForTransmuterLeg(mint!)),
            }
          : undefined,
      },
      caption: ALCHEMIX_HEAD_WORDS.staked,
    };
  }

  if (claimed) {
    const d = claimed.context.data;
    const coords = coordsForTransmuterLeg(claimed);
    return {
      spec: {
        label: ALCHEMIX_HEAD_WORDS.claimed,
        deltas: [],
        party: d.raw.claimer
          ? {
              prefix: "by",
              address: d.raw.claimer,
              ens: true,
              prov: transmuterEmittedProv("claimer", d.syntheticSymbol, null, coords),
            }
          : undefined,
      },
      caption: ALCHEMIX_HEAD_WORDS.claimed,
    };
  }

  if (poked) return { spec: { label: ALCHEMIX_HEAD_WORDS.poked, deltas: [] }, caption: ALCHEMIX_HEAD_WORDS.poked };

  // Custody alone: where the position ended the transaction, the clause after
  // the kind.
  const last = transfers[transfers.length - 1];
  const t = last?.context.data.transfer;
  const burned = t?.transferType === "burn";
  const counterparty = burned ? t?.fromAddress : t?.toAddress;
  const kind = last ? alchemixLegKind(last.context.data) : ALCHEMIX_HEAD_WORDS.transferred;
  const party =
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
      : undefined;
  return {
    spec: { label: kind, deltas: [], clauses: party ? [<PartyChip key="party" party={party} />] : undefined },
    caption: party
      ? `${kind} ${ALCHEMIX_HEAD_WORDS.sep} ${party.prefix} ${party.address.slice(0, 6)}…${party.address.slice(-4)}`
      : kind,
  };
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
  const toCells = useStatCells();
  const lead = legs[0];
  const custodyOnly = legs.every((l) => l.context.data.eventType === "transfer");
  const tokens = spineTokens(legs, mytSymbol);
  const spine: SpineColumnProps = custodyOnly
    ? { tokens: [{ symbol: lead.context.data.syntheticSymbol, badge: "send" }], isLast: !!isLast }
    : { tokens, isLast: !!isLast };
  const claimLeg = find(legs, "transmuter_position_claimed");
  const earlyHere = claimLeg ? early : null;
  const stats = detailStats(legs, mytSymbol, earlyHere);
  const lines = transmuterExplainerLines(legs, mytSymbol, earlyHere);
  const { spec, caption } = rowSpec(legs);
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
    caption,
    // The logs' figures are the event's cells: a Transmuter position has no
    // reading.
    cells:
      stats.length > 0
        ? toCells(stats.map((s, i) => ({ ...s, key: `log-${i}` })))
        : { none: "the logs state no amount" },
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

// The event page's contract (rails-ops reference/app-anatomy.md, P4) for a
// row of a Polaris pETH account (ui-jobs 865): the address and the row's
// kind and effect, then the shared rows.

import type { EventPageContract, EventPageSlot } from "@/lib/shared/explorer-adapter";
import { makeEventTitle } from "@/lib/shared/event-title";
import { formatDateLong } from "@/lib/date";
import { FPETH, PETH, VPETH } from "@/lib/polaris/asset-catalog";
import { polarisPethAccountHref } from "@/lib/polaris/routes";
import { big, PETH_EFFECTS, pethKindLabel, pethRowEffect, units, ZERO } from "@/lib/polaris/peth-ledger";
import type { PethLedgerRow } from "@/lib/sources/api/polaris-peth";

const WORDS = {
  address: "Address",
  effect: "Effect",
  timeline_link: "See the whole history in the timeline.",
  description: (day: string) => `One of this address's pETH transactions on Polaris, on ${day}.`,
};

const EFFECT_WORD = Object.fromEntries(PETH_EFFECTS.map((e) => [e.key, e.label]));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface PolarisPethEventPageInput extends EventPageSlot {
  address: string;
  row: PethLedgerRow | undefined;
}

export function polarisPethEventPage({ address, row, event, ...slot }: PolarisPethEventPageInput): EventPageContract {
  const label = row ? pethKindLabel(row.kind) : event.actionLabel;
  // The headline: the pETH the row moved, else its fpETH, else its vpETH
  // (a not-decoded Morpho Blue row moves vpETH alone).
  const head = row
    ? [
        { raw: big(row.peth_delta_raw), token: PETH },
        { raw: big(row.fpeth_delta_raw), token: FPETH },
        { raw: big(row.vpeth_delta_raw), token: VPETH },
      ].find((m) => m.raw !== ZERO)
    : undefined;
  return {
    heading: label,
    title: makeEventTitle(
      event,
      label,
      // The kind and the amount it moved, unlabelled, as a Trove event's
      // title reads ("Repay 5K USDC"): the kind word carries the direction.
      head
        ? [
            {
              value: units(head.raw < ZERO ? -head.raw : head.raw),
              symbol: head.token.symbol,
              address: head.token.address,
            },
          ]
        : [],
    ),
    facts: [
      {
        key: "address",
        label: WORDS.address,
        value: short(address),
        full: address,
        mono: true,
        href: polarisPethAccountHref(address),
      },
      ...(row ? [{ key: "effect", label: WORDS.effect, value: EFFECT_WORD[pethRowEffect(row)] ?? row.effect }] : []),
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: `${WORDS.description(formatDateLong(event.timestamp))} ${WORDS.timeline_link}`,
  };
}

// The event page's contract (rails-ops reference/app-anatomy.md, P4) for a
// row of a Polaris pETH account (ui-jobs 865): the address and the row's
// kind and effect, then the shared rows.

import type { EventPageContract, EventPageSlot } from "@/lib/shared/explorer-adapter";
import { makeEventTitle } from "@/lib/shared/event-title";
import { formatDateLong } from "@/lib/date";
import { PETH } from "@/lib/polaris/asset-catalog";
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
  const d = row ? big(row.peth_delta_raw) : ZERO;
  return {
    heading: label,
    title: makeEventTitle(
      event,
      label,
      d !== ZERO
        ? [
            {
              value: units(d < ZERO ? -d : d),
              symbol: PETH.symbol,
              address: PETH.address,
              label: d > ZERO ? "In" : "Out",
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

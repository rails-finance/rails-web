"use client";

// One timeline row of a Liquity V2 redeemer's page: one Trove a redemption
// the wallet sent took debt from, on the shared event-card shell
// (components/shared/event-card.tsx) as the deposit row draws it
// (sp-event-card.tsx). T1 the label with the BOLD redeemed on the spine and
// the collateral paid out of the Trove in the head, T2 the Trove, its rate at the block, the two amounts and the transaction,
// T3 the row in words. The Trove links open this redemption in the Trove's
// timeline, each a LinkedValue (anatomy L14) whose tooltip reads "Trove
// 710946…7687 →".

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { SpineTokenRow } from "@/components/shared/spine-column";
import { txCell } from "@/components/shared/event-tx-cell";
import { LinkedValue } from "@/components/shared/linked-value";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { useChainId } from "@/lib/shared/chain-context";
import { formatCompact } from "@/lib/shared/format-compact";
import { shortPositionId } from "@/lib/shared/position-name";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { big, exactUnits, units } from "@/lib/liquity-v2/sp-math";
import { fmtRateNum } from "@/lib/liquity/figure-format";
import { redemptionLogProv } from "@/lib/liquity-v2/redeemer-provenance";
import { REDEMPTION_LABEL, redemptionId, redemptionTroveHref } from "@/lib/liquity-v2/redeemer-timeline";
import type { LiquityV2RedemptionRow } from "@/lib/sources/api/liquity-v2-redeemer";

/** Four significant digits below one, the compact form above it. */
const amountText = (raw: bigint): string => {
  const n = units(raw);
  return n >= 1 ? formatCompact(n) : n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
};

function amountCell(
  key: string,
  label: string,
  raw: bigint,
  symbol: string,
  address: string,
  info: Provenance,
): EventCellSpec {
  return {
    kind: "stat",
    key,
    label,
    changed: true,
    figure: `liquity-v2-redeemer-${key}`,
    value: {
      after: { text: `${amountText(raw)} ${symbol}`, info, value: exactUnits(raw) },
      icon: symbol,
      iconAddress: address,
    },
  };
}

export function LiquityV2RedemptionCard({
  row,
  isLast,
  eventNumber,
}: {
  row: LiquityV2RedemptionRow;
  isLast: boolean;
  eventNumber?: number;
}) {
  const branch = LIQUITY_V2_BRANCHES[row.collateral_type.toLowerCase()];
  const c = branch.symbol;
  const bold = big(row.bold_raw);
  const coll = big(row.coll_raw);
  const id = shortPositionId(row.trove_id);
  const chainId = useChainId();
  const troveHref = redemptionTroveHref(row);
  const troveTip = `Trove ${id} →`;
  // The Trove's annual rate at the block, from the row's TroveOperation log
  // (absent from a server before ui-jobs 762).
  const ratePct = row.rate_raw != null ? Number(big(row.rate_raw)) / 1e16 : null;
  const rateText = ratePct != null ? `${fmtRateNum(ratePct)}%` : null;

  const tokens: SpineTokenRow[] = [
    {
      symbol: "BOLD",
      address: TOKEN_ADDRESSES.BOLD,
      direction: "right",
      popover: true,
      value: units(bold),
      display: amountText(bold),
      verb: "redeemed",
    },
    // Out of the Trove, to whoever called the CollateralRegistry: no arrow
    // toward this wallet, and the head states the amount.
    { symbol: c, address: branch.collateralAddr, popover: true, verb: "paid out of the Trove" },
  ];

  const cells: EventCellSpec[] = [
    {
      kind: "stat",
      key: "trove",
      label: "Trove",
      changed: false,
      value: {
        lines: [
          <Prov key="trove" info={redemptionLogProv("trove", row)} value={row.trove_id}>
            <LinkedValue href={troveHref} tip={troveTip} label={`Trove ${id}`} className="link font-mono text-xs">
              {id}
            </LinkedValue>
          </Prov>,
          <span key="branch" className="text-xs text-rb-500">
            {c} branch
          </span>,
        ],
      },
    },
    ...(rateText
      ? [
          {
            kind: "stat",
            key: "rate",
            label: "Interest rate",
            changed: false,
            figure: "liquity-v2-redeemer-rate",
            value: { after: { text: rateText, info: redemptionLogProv("rate", row), value: String(ratePct) } },
          } satisfies EventCellSpec,
        ]
      : []),
    amountCell("bold", "BOLD redeemed", bold, "BOLD", TOKEN_ADDRESSES.BOLD, redemptionLogProv("bold", row)),
    amountCell("coll", `${c} paid out of the Trove`, coll, c, branch.collateralAddr, redemptionLogProv("coll", row)),
    txCell({
      txHash: row.transaction_hash,
      block: row.block_number,
      info: redemptionLogProv("block", row),
      chainId,
    }),
  ];

  const slots: EventCardSlots = {
    event: {
      id: redemptionId(row),
      family: "liquity-v2-redeemer",
      txHash: row.transaction_hash,
      blockNumber: Number(row.block_number),
      timestamp: Number(row.block_timestamp),
      number: eventNumber,
    },
    spine: { tokens, isLast },
    head: {
      label: REDEMPTION_LABEL,
      // The Trove it hit, linked to this redemption in its timeline; the row's
      // click stays the card's.
      clauses: [
        <LinkedValue
          key="trove"
          href={troveHref}
          tip={troveTip}
          label={`Trove ${id}`}
          className="link"
          dataAttrs={{ "data-redeemer-trove": row.trove_id }}
        >
          Trove {id} ({c})
        </LinkedValue>,
        ...(rateText
          ? [
              <span key="rate" data-redeemer-rate="" data-anatomy="Q4·liquity">
                at{" "}
                <Prov info={redemptionLogProv("rate", row)} value={String(ratePct)}>
                  {rateText}
                </Prov>
              </span>,
            ]
          : []),
      ],
      deltas: [
        {
          label: "Paid out of the Trove",
          value: units(coll),
          symbol: c,
          address: branch.collateralAddr,
          exact: exactUnits(coll),
          display: amountText(coll),
          prov: redemptionLogProv("coll", row),
          // The spine draws the collateral without a flank: the head keeps it at every width.
          noSpineCounterpart: true,
        },
      ],
    },
    caption: REDEMPTION_LABEL,
    cells,
    ledgers: { none: "A redemption row holds no balance: it states what one redemption did to one Trove." },
    explainer: {
      body: (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed" data-anatomy="Q2·liquity">
          <li>
            {amountText(bold)} BOLD of the Trove&apos;s debt redeemed, {amountText(coll)} {c} paid out of it.
          </li>
          <li>The redemption fee stays in the Trove.</li>
        </ul>
      ),
    },
    learnMore: null,
  };
  return <EventCard slots={slots} avatar={null} />;
}

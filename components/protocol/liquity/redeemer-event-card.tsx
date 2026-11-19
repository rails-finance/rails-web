"use client";

// One timeline row of a Liquity V2 redeemer's page: one Trove a redemption
// the wallet sent took debt from, on the shared event-card shell
// (components/shared/event-card.tsx) as the deposit row draws it
// (sp-event-card.tsx). T1 the label with the BOLD redeemed and the collateral
// paid out on the spine, T2 the Trove, the two amounts and the transaction,
// T3 the row in words with the Trove linked to its page.

import Link from "next/link";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { SpineTokenRow } from "@/components/shared/spine-column";
import { BlockRef } from "@/components/shared/block-ref";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { formatCompact } from "@/lib/shared/format-compact";
import { shortPositionId } from "@/lib/shared/position-name";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { LIQUITY_FORK_CARD_CONFIGS } from "@/lib/shared/liquity-fork-card-config";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { big, exactUnits, units } from "@/lib/liquity-v2/sp-math";
import { redemptionLogProv } from "@/lib/liquity-v2/redeemer-provenance";
import { REDEMPTION_LABEL, redemptionId } from "@/lib/liquity-v2/redeemer-timeline";
import type { LiquityV2RedemptionRow } from "@/lib/sources/api/liquity-v2-redeemer";

const TROVE_PATH = LIQUITY_FORK_CARD_CONFIGS["liquity-v2"].trovePath;
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
/** Four significant digits below one, the compact form above it. */
const amountText = (raw: bigint): string => {
  const n = units(raw);
  return n >= 1 ? formatCompact(n) : n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
};

export const troveHref = (r: LiquityV2RedemptionRow) => `${TROVE_PATH}/${r.collateral_type}/${r.trove_id}`;

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
    {
      symbol: c,
      address: branch.collateralAddr,
      direction: "left",
      popover: true,
      value: units(coll),
      display: amountText(coll),
      verb: "paid out",
    },
  ];

  const cells: EventCellSpec[] = [
    {
      kind: "stat",
      key: "trove",
      label: "Trove",
      changed: false,
      value: {
        lines: [
          <Link key="trove" href={troveHref(row)} prefetch={false} className="link font-mono text-xs">
            <Prov info={redemptionLogProv("trove", row)} value={row.trove_id}>
              {id}
            </Prov>
          </Link>,
          <span key="branch" className="text-xs text-rb-500">
            {c} branch
          </span>,
        ],
      },
    },
    amountCell("bold", "BOLD redeemed", bold, "BOLD", TOKEN_ADDRESSES.BOLD, redemptionLogProv("bold", row)),
    amountCell("coll", `${c} paid out`, coll, c, branch.collateralAddr, redemptionLogProv("coll", row)),
    {
      kind: "stat",
      key: "tx",
      label: "Transaction",
      changed: false,
      value: {
        lines: [
          <a
            key="tx"
            href={explorerUrl(MAINNET_CHAIN_ID, "tx", row.transaction_hash)}
            target="_blank"
            rel="noopener"
            className="link-muted font-mono text-xs"
          >
            {short(row.transaction_hash)} ↗
          </a>,
          <span key="block" className="text-xs text-rb-500">
            Block{" "}
            <Prov info={redemptionLogProv("block", row)} value={row.block_number}>
              <BlockRef block={Number(row.block_number)} chainId={MAINNET_CHAIN_ID} size={12} />
            </Prov>
          </span>,
        ],
      },
    },
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
      // The Trove it hit, linked to its page; the row's click stays the card's.
      clauses: [
        <Link
          key="trove"
          href={troveHref(row)}
          prefetch={false}
          onClick={(e) => e.stopPropagation()}
          className="link"
          data-redeemer-trove={row.trove_id}
        >
          Trove {id} ({c})
        </Link>,
      ],
      deltas: [],
    },
    caption: REDEMPTION_LABEL,
    cells,
    ledgers: { none: "A redemption row holds no balance: it states what one redemption did to one Trove." },
    explainer: {
      body: (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed" data-anatomy="Q2·liquity">
          <li>
            <Link href={troveHref(row)} prefetch={false} className="link">
              Trove {id}
            </Link>{" "}
            ({c}): {amountText(bold)} BOLD of its debt redeemed, {amountText(coll)} {c} paid out of it.
          </li>
          <li>The redemption fee stays in the Trove.</li>
        </ul>
      ),
    },
    learnMore: null,
  };
  return <EventCard slots={slots} avatar={null} />;
}

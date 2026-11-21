"use client";

// One timeline row of a Liquity V1 LQTY stake, on the shared event-card shell
// (components/shared/event-card.tsx), as the deposit's row draws it
// (v1-sp-event-card.tsx): T1 the label with the moved amounts on the spine,
// T2 the balance sheet (v1-staking-sheet.ts), T3 the row in words
// (lib/liquity-v1/staking-event-prose.ts). The rows carry no sender or gas.

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { SpineTokenRow } from "@/components/shared/spine-column";
import { BlockRef } from "@/components/shared/block-ref";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { formatCompact } from "@/lib/shared/format-compact";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { NATIVE } from "@/lib/shared/asset-roster";
import { big, exactUnits, units } from "@/lib/liquity-v1/staking-math";
import { stTouchProv } from "@/lib/liquity-v1/staking-provenance";
import { stEventLabel, stEventSentences } from "@/lib/liquity-v1/staking-event-prose";
import type { LiquityV1StakeEventRow } from "@/lib/sources/api/liquity-v1-staking";
import { stStakeSheet } from "./v1-staking-sheet";

const ZERO = BigInt(0);
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

function txCell(txHash: string, block: string, info: Provenance): EventCellSpec {
  return {
    kind: "stat",
    key: "tx",
    label: "Transaction",
    changed: false,
    value: {
      lines: [
        <a
          key="tx"
          href={explorerUrl(MAINNET_CHAIN_ID, "tx", txHash)}
          target="_blank"
          rel="noopener"
          className="link-muted font-mono text-xs"
        >
          {short(txHash)} ↗
        </a>,
        <span key="block" className="text-xs text-rb-500">
          Block{" "}
          <Prov info={info} value={block}>
            <BlockRef block={Number(block)} chainId={MAINNET_CHAIN_ID} size={12} />
          </Prov>
        </span>,
      ],
    },
  };
}

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
    figure: `liquity-v1-st-${key}`,
    value: {
      after: { text: `${formatCompact(units(raw))} ${symbol}`, info, value: exactUnits(raw) },
      icon: symbol,
      iconAddress: address,
    },
  };
}

export function LiquityV1StakeEventCard({
  row,
  isLast,
  eventNumber,
}: {
  row: LiquityV1StakeEventRow;
  isLast: boolean;
  /** The timeline's number: the pill links the event's page (P4). */
  eventNumber?: number;
}) {
  const coord = (summary: string) => stTouchProv(summary, row.tx_hash, row.block_number);
  const change = big(row.stake_change);
  const lusd = big(row.lusd_gain);
  const eth = big(row.eth_gain);
  const label = stEventLabel(row);

  const tokens: SpineTokenRow[] = [];
  if (change !== ZERO)
    tokens.push({
      symbol: "LQTY",
      address: TOKEN_ADDRESSES.LQTY,
      direction: change > ZERO ? "right" : "left",
      popover: true,
      value: units(change > ZERO ? change : -change),
      verb: change > ZERO ? "staked" : "unstaked",
    });
  if (lusd > ZERO)
    tokens.push({
      symbol: "LUSD",
      address: TOKEN_ADDRESSES.LUSD,
      direction: "left",
      popover: true,
      value: units(lusd),
      verb: "claimed",
    });
  if (eth > ZERO)
    tokens.push({
      symbol: "ETH",
      address: NATIVE,
      direction: "left",
      popover: true,
      value: units(eth),
      verb: "claimed",
    });
  if (tokens.length === 0) tokens.push({ symbol: "LQTY", address: TOKEN_ADDRESSES.LQTY });

  const cells: EventCellSpec[] = [
    amountCell(
      "stake-after",
      "Stake after",
      big(row.stake_after),
      "LQTY",
      TOKEN_ADDRESSES.LQTY,
      coord("Stake after — the touch's StakeChanged _newStake, or the stake before it on a claim."),
    ),
    txCell(row.tx_hash, row.block_number, coord("Block — the block this touch's logs were emitted in.")),
  ];

  const slots: EventCardSlots = {
    event: {
      id: row.event_key,
      family: "liquity-v1-st",
      txHash: row.tx_hash,
      blockNumber: Number(row.block_number),
      timestamp: Number(row.block_timestamp),
      number: eventNumber,
    },
    spine: { tokens, isLast },
    head: { label, deltas: [] },
    caption: label,
    cells,
    sheet: stStakeSheet(row),
    ledgers: { none: "A stake's balance is the Stake side's total." },
    price: { prices: [] },
    explainer: {
      body: (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {stEventSentences(row).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ),
    },
    learnMore: null,
  };
  return <EventCard slots={slots} avatar={null} />;
}

"use client";

// One timeline row of a Polaris stability-pool deposit or reserve loan, on
// the shared event-card shell (components/shared/event-card.tsx): T1 the label
// with the moved amounts on the spine, T2 the balance sheet
// (polaris-sp-loan-sheet.ts; a transfer keeps its cells) and the price row
// (the holder's gas), T3 the row in words (lib/polaris/sp-event-prose.ts,
// lib/polaris/loan-event-prose.ts).

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { SpineColumnProps, SpineTokenRow } from "@/components/shared/spine-column";
import { BlockRef } from "@/components/shared/block-ref";
import { Prov } from "@/components/shared/provenance";
import { explorerUrl } from "@/lib/shared/chains";
import { formatCompact } from "@/lib/shared/format-compact";
import { FPETH, PETH, POLARIS_CHAIN_ID, POLARIS_MARKET_CONFIG, POLARIS_WETH } from "@/lib/polaris/asset-catalog";
import { big, exactUnits, feeAtTouch, units } from "@/lib/polaris/sp-loan-math";
import { touchProv, loanIndexProv } from "@/lib/polaris/sp-loan-provenance";
import { spEventLabel, spEventSentences } from "@/lib/polaris/sp-event-prose";
import { loanEventLabel, loanEventSentences } from "@/lib/polaris/loan-event-prose";
import type { PolarisDepositEventRow, PolarisLoanEventRow } from "@/lib/sources/api/polaris-sp-loans";
import type { Provenance } from "@/components/shared/provenance";
import type { EventGas } from "@/components/shared/event-price-row";
import { polarisDepositSheet, polarisLoanSheet } from "./polaris-sp-loan-sheet";

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
          href={explorerUrl(POLARIS_CHAIN_ID, "tx", txHash)}
          target="_blank"
          rel="noopener"
          className="link-muted font-mono text-xs"
        >
          {short(txHash)} ↗
        </a>,
        <span key="block" className="text-xs text-rb-500">
          Block{" "}
          <Prov info={info} value={block}>
            <BlockRef block={Number(block)} chainId={POLARIS_CHAIN_ID} size={12} />
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
  changed = true,
): EventCellSpec {
  return {
    kind: "stat",
    key,
    label,
    changed,
    figure: `polaris-${key}`,
    value: {
      after: { text: `${formatCompact(units(raw))} ${symbol}`, info, value: exactUnits(raw) },
      icon: symbol,
      iconAddress: address,
    },
  };
}

/** The transaction's gas, where the position's holder sent it: the receipt's
 *  gas used times its gas price, in ETH (the rows carry no ETH price). */
function holderGas(
  r: { tx_from: string | null; tx_gas_used: string | null; tx_gas_price: string | null },
  holder: string | null,
): EventGas | undefined {
  if (!holder || !r.tx_from || r.tx_from.toLowerCase() !== holder.toLowerCase()) return undefined;
  if (!r.tx_gas_used || !r.tx_gas_price) return undefined;
  const eth = units(big(r.tx_gas_used) * big(r.tx_gas_price));
  return eth > 0 ? { eth, usd: 0, gasUsed: Number(r.tx_gas_used) } : undefined;
}

const bullets = (lines: string[]) => (
  <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
    {lines.map((l) => (
      <li key={l}>{l}</li>
    ))}
  </ul>
);

export function PolarisDepositEventCard({
  row,
  isLast,
  eventNumber,
  holder,
  vaultHeld,
}: {
  row: PolarisDepositEventRow;
  isLast: boolean;
  /** The timeline's number: the pill links the event's page (P4). */
  eventNumber?: number;
  holder: string | null;
  vaultHeld: boolean;
}) {
  const cfg = POLARIS_MARKET_CONFIG[row.market];
  const s = cfg.stable.symbol;
  const coord = (summary: string) => touchProv(summary, row.tx_hash, row.block_number, "pool", row.market);
  const change = big(row.top_up_or_withdrawal);
  const bcClaimed = big(row.bc_gain_claimed);
  const gainClaimed = big(row.stable_gain_claimed);

  const tokens: SpineTokenRow[] = [];
  if (change !== ZERO)
    tokens.push({
      symbol: s,
      address: cfg.stable.address,
      direction: change > ZERO ? "right" : "left",
      popover: true,
      value: units(change > ZERO ? change : -change),
      verb: change > ZERO ? "deposited" : "withdrawn",
    });
  if (bcClaimed > ZERO)
    tokens.push({
      symbol: PETH.symbol,
      address: PETH.address,
      direction: "left",
      popover: true,
      value: units(bcClaimed),
      verb: "claimed",
    });
  if (gainClaimed > ZERO)
    tokens.push({
      symbol: s,
      address: cfg.stable.address,
      direction: "left",
      popover: true,
      value: units(gainClaimed),
      verb: "claimed",
    });
  if (tokens.length === 0) tokens.push({ symbol: s, address: cfg.stable.address });
  const spine: SpineColumnProps = { tokens, isLast };

  const cells: EventCellSpec[] =
    row.event_type === "transfer"
      ? [txCell(row.tx_hash, row.block_number, coord("Block — the block the deposit NFT's Transfer was logged in."))]
      : [
          amountCell(
            "deposit-after",
            "Deposit after",
            big(row.new_deposit),
            s,
            cfg.stable.address,
            coord("Deposit after — the DepositUpdated's newDeposit, logged after this operation."),
          ),
          ...(big(row.deposit_loss) > ZERO
            ? [
                amountCell(
                  "burned",
                  "Burned since previous touch",
                  big(row.deposit_loss),
                  s,
                  cfg.stable.address,
                  coord("Burned since previous touch — the DepositOperation's depositLossSinceLastOperation."),
                ),
              ]
            : []),
          ...(big(row.stable_gain_since) > ZERO
            ? [
                {
                  ...amountCell(
                    "stable-gain",
                    `${s} gain paid`,
                    big(row.stable_gain_since),
                    s,
                    cfg.stable.address,
                    coord(`${s} gain paid — the DepositOperation's stableTokenGainSinceLastOperation.`),
                  ),
                  sub: [{ content: `${formatCompact(units(gainClaimed))} claimed` }],
                },
              ]
            : []),
          ...(big(row.bc_gain_since) > ZERO
            ? [
                {
                  ...amountCell(
                    "peth-gain",
                    "pETH paid",
                    big(row.bc_gain_since),
                    PETH.symbol,
                    PETH.address,
                    coord("pETH paid — the DepositOperation's bcTokenGainSinceLastOperation."),
                  ),
                  sub: [{ content: `${formatCompact(units(bcClaimed))} claimed` }],
                },
              ]
            : []),
          txCell(row.tx_hash, row.block_number, coord("Block — the block this DepositOperation was logged in.")),
        ];

  const label = spEventLabel(row);
  const slots: EventCardSlots = {
    event: {
      id: row.event_key,
      family: "polaris",
      txHash: row.tx_hash,
      blockNumber: Number(row.block_number),
      timestamp: Number(row.block_timestamp),
      number: eventNumber,
    },
    spine,
    head: { label, deltas: [] },
    caption: label,
    cells,
    sheet: polarisDepositSheet(row),
    ledgers: { none: "A deposit's balance is the Deposit side's total." },
    price: { gas: row.event_type === "transfer" ? undefined : holderGas(row, holder), prices: [] },
    explainer: { body: bullets(spEventSentences(row, s, holder, vaultHeld ? cfg.vault.symbol : null)) },
    learnMore: null,
  };
  return <EventCard slots={slots} avatar={null} />;
}

export function PolarisLoanEventCard({
  row,
  previous,
  isLast,
  eventNumber,
  holder,
}: {
  row: PolarisLoanEventRow;
  previous: PolarisLoanEventRow | null;
  isLast: boolean;
  /** The timeline's number: the pill links the event's page (P4). */
  eventNumber?: number;
  holder: string | null;
}) {
  const coord = (summary: string) => touchProv(summary, row.tx_hash, row.block_number, "loans");
  const c = big(row.coll_change);
  const d = big(row.debt_change);
  const tokens: SpineTokenRow[] = [];
  if (c !== ZERO)
    tokens.push({
      symbol: FPETH.symbol,
      address: FPETH.address,
      direction: c > ZERO ? "right" : "left",
      popover: true,
      value: units(c > ZERO ? c : -c),
      verb: c > ZERO ? "deposited" : "returned",
    });
  if (d !== ZERO)
    tokens.push({
      symbol: POLARIS_WETH.symbol,
      address: POLARIS_WETH.address,
      direction: d > ZERO ? "left" : "right",
      popover: true,
      value: units(d > ZERO ? d : -d),
      verb: d > ZERO ? "borrowed" : "repaid",
    });
  if (tokens.length === 0) tokens.push({ symbol: FPETH.symbol, address: FPETH.address });

  const fee = feeAtTouch(row, previous);
  const dps = row.debt_per_share;
  const cells: EventCellSpec[] =
    row.event_type === "transfer"
      ? [txCell(row.tx_hash, row.block_number, coord("Block — the block the loan NFT's Transfer was logged in."))]
      : [
          amountCell(
            "coll-after",
            "Collateral after",
            big(row.coll_after),
            FPETH.symbol,
            FPETH.address,
            coord("Collateral after — the collateral before this touch plus its signed fpETH change."),
            c !== ZERO,
          ),
          amountCell(
            "debt-after",
            "Debt after",
            big(row.debt_after),
            POLARIS_WETH.symbol,
            POLARIS_WETH.address,
            coord("Debt after — the loan's shares after this touch at the debt per share in force, rounded up."),
          ),
          ...(fee != null && fee > ZERO
            ? [
                amountCell(
                  "fee",
                  "Fees since previous touch",
                  fee,
                  POLARIS_WETH.symbol,
                  POLARIS_WETH.address,
                  coord(
                    "Fees since previous touch — the shares before this touch at its index, less the debt after the previous touch.",
                  ),
                ),
              ]
            : []),
          ...(dps
            ? [
                {
                  kind: "stat" as const,
                  key: "index",
                  label: "Debt per share",
                  changed: false,
                  value: {
                    after: {
                      text: (Number(big(dps)) / 1e27).toFixed(9),
                      info: loanIndexProv(row.debt_per_share_tx_hash, row.debt_per_share_block),
                      value: dps,
                    },
                  },
                  sub: row.floor_price
                    ? [{ content: `Floor ${units(big(row.floor_price)).toFixed(4)} WETH per fpETH` }]
                    : undefined,
                },
              ]
            : []),
          txCell(row.tx_hash, row.block_number, coord("Block — the block this touch was logged in.")),
        ];

  const label = loanEventLabel(row);
  const slots: EventCardSlots = {
    event: {
      id: row.event_key,
      family: "polaris",
      txHash: row.tx_hash,
      blockNumber: Number(row.block_number),
      timestamp: Number(row.block_timestamp),
      number: eventNumber,
    },
    spine: { tokens, isLast },
    head: { label, deltas: [] },
    caption: label,
    cells,
    sheet: polarisLoanSheet(row, previous),
    ledgers: { none: "A loan's balances are the Collateral and Debt totals." },
    price: { gas: row.event_type === "transfer" ? undefined : holderGas(row, holder), prices: [] },
    explainer: { body: bullets(loanEventSentences(row, previous, holder)) },
    learnMore: null,
  };
  return <EventCard slots={slots} avatar={null} />;
}

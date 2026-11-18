"use client";

// One timeline row of a Liquity V2 stability-pool deposit, on the shared
// event-card shell (components/shared/event-card.tsx), as Polaris's deposit
// row draws it: T1 the label with the moved amounts on the spine, T2 the
// balance sheet (sp-sheet.ts) and the price row (the depositor's gas), T3 the
// row in words (lib/liquity-v2/sp-event-prose.ts).

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { SpineTokenRow } from "@/components/shared/spine-column";
import type { EventGas } from "@/components/shared/event-price-row";
import { BlockRef } from "@/components/shared/block-ref";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { formatCompact } from "@/lib/shared/format-compact";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { big, exactUnits, units } from "@/lib/liquity-v2/sp-math";
import { spCompoundProv, spLiqProv, spTouchProv } from "@/lib/liquity-v2/sp-provenance";
import type { ChainTruthDelta } from "@/components/shared/chain-truth-event";
import { DEPOSIT_TOUCH_TIP } from "@/lib/liquity-v2/touch-words";
import { spEventLabel, spEventSentences } from "@/lib/liquity-v2/sp-event-prose";
import type { LiquityV2DepositEventRow } from "@/lib/sources/api/liquity-v2-sp";
import { DEPOSIT_AFTER_FORMULA, spDepositSheet } from "./sp-sheet";

const ZERO = BigInt(0);
/** A kept amount as the row states it: the compact form from 0.01, two
 *  significant digits below it, so 0.000083 BOLD does not read as 0.0001. */
const keptText = (raw: bigint): string => {
  const n = units(raw);
  return n >= 0.01 ? formatCompact(n) : n.toLocaleString("en-US", { maximumSignificantDigits: 2 });
};
/** Collateral as the row states it: four significant digits below one. */
const collText = (raw: bigint): string => {
  const n = units(raw);
  return n >= 1 ? formatCompact(n) : n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
};
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
    figure: `liquity-v2-sp-${key}`,
    value: {
      after: { text: `${formatCompact(units(raw))} ${symbol}`, info, value: exactUnits(raw) },
      icon: symbol,
      iconAddress: address,
    },
  };
}

/** The transaction's gas, where the depositor sent it: the receipt's gas used
 *  times its effective gas price, in ETH (the rows carry no ETH price). */
function depositorGas(r: LiquityV2DepositEventRow): EventGas | undefined {
  if (!r.tx_from || r.tx_from.toLowerCase() !== r.depositor.toLowerCase()) return undefined;
  if (!r.gas_used || !r.effective_gas_price) return undefined;
  const eth = units(big(r.gas_used) * big(r.effective_gas_price));
  return eth > 0 ? { eth, usd: 0, gasUsed: Number(r.gas_used) } : undefined;
}

const bullets = (lines: string[]) => (
  <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
    {lines.map((l) => (
      <li key={l}>{l}</li>
    ))}
  </ul>
);

export function LiquityV2DepositEventCard({
  row,
  isLast,
  eventNumber,
}: {
  row: LiquityV2DepositEventRow;
  isLast: boolean;
  /** The timeline's number: the pill links the event's page (P4). */
  eventNumber?: number;
}) {
  const branch = LIQUITY_V2_BRANCHES[row.collateral_type.toLowerCase()];
  const c = branch.symbol;
  const coord = (summary: string) => spTouchProv(summary, row.tx_hash, row.block_number, row.collateral_type);
  const change = big(row.top_up_or_withdrawal);
  const collClaimed = big(row.coll_gain_claimed);
  const yieldClaimed = big(row.yield_gain_claimed);

  const tokens: SpineTokenRow[] = [];
  if (change !== ZERO)
    tokens.push({
      symbol: "BOLD",
      address: TOKEN_ADDRESSES.BOLD,
      direction: change > ZERO ? "right" : "left",
      popover: true,
      value: units(change > ZERO ? change : -change),
      verb: change > ZERO ? "deposited" : "withdrawn",
    });
  if (collClaimed > ZERO)
    tokens.push({
      symbol: c,
      address: branch.collateralAddr,
      direction: "left",
      popover: true,
      value: units(collClaimed),
      verb: "claimed",
    });
  if (yieldClaimed > ZERO)
    tokens.push({
      symbol: "BOLD",
      address: TOKEN_ADDRESSES.BOLD,
      direction: "left",
      popover: true,
      value: units(yieldClaimed),
      verb: "claimed",
    });
  // A compound (withdrawFromSP(0), no claim) moves no token: the yield it
  // kept joins the deposit, and the collateral it did not claim is stashed in
  // the pool. Where a loss since the last touch landed with it, the head and
  // spine state the deposit's change instead (after − before, with its sign),
  // and the yield and the loss stay in the sheet.
  const label = spEventLabel(row);
  const deltas: ChainTruthDelta[] = [];
  if (label === "Compounded") {
    const yieldAdded = big(row.yield_gain_since) - yieldClaimed;
    const stashed = big(row.coll_gain_since) - collClaimed;
    const lossToo = big(row.deposit_loss) > ZERO;
    const sinceAndClaimed = (since: string, claimed: string) => ({
      since: exactUnits(big(since)),
      claimed: exactUnits(big(claimed)),
    });
    const bold = lossToo ? big(row.deposit_after) - big(row.deposit_before) : yieldAdded;
    if (bold !== ZERO) {
      const mag = bold < ZERO ? -bold : bold;
      tokens.push({
        symbol: "BOLD",
        address: TOKEN_ADDRESSES.BOLD,
        direction: "right",
        popover: true,
        value: units(mag),
        display: lossToo ? `${bold < ZERO ? "−" : "+"}${keptText(mag)}` : keptText(mag),
        verb: lossToo ? "deposit change" : "added to the deposit",
      });
      deltas.push({
        value: units(bold),
        symbol: "BOLD",
        address: TOKEN_ADDRESSES.BOLD,
        exact: exactUnits(bold),
        display: keptText(mag),
        prov: lossToo
          ? spLiqProv.depositChange(
              row.collateral_type,
              row.tx_hash,
              row.block_number,
              exactUnits(big(row.deposit_before)),
              exactUnits(big(row.deposit_after)),
            )
          : spCompoundProv(
              "yield",
              row.tx_hash,
              row.block_number,
              row.collateral_type,
              sinceAndClaimed(row.yield_gain_since, row.yield_gain_claimed),
            ),
      });
    }
    if (stashed > ZERO) {
      tokens.push({
        symbol: c,
        address: branch.collateralAddr,
        direction: "right",
        popover: true,
        value: units(stashed),
        display: collText(stashed),
        verb: "stashed",
      });
      deltas.push({
        label: "Stashed",
        value: units(stashed),
        symbol: c,
        address: branch.collateralAddr,
        exact: exactUnits(stashed),
        display: collText(stashed),
        prov: spCompoundProv(
          "stash",
          row.tx_hash,
          row.block_number,
          row.collateral_type,
          sinceAndClaimed(row.coll_gain_since, row.coll_gain_claimed),
        ),
      });
    }
  }
  if (tokens.length === 0) tokens.push({ symbol: "BOLD", address: TOKEN_ADDRESSES.BOLD });

  const cells: EventCellSpec[] = [
    amountCell("deposit-after", "Deposit after", big(row.deposit_after), "BOLD", TOKEN_ADDRESSES.BOLD, {
      kind: "derived",
      pclass: "indexed",
      summary:
        "Deposit after — the deposit after this operation, replayed from the operations: the deposit before it, less the loss, plus the change and the yield, less the yield claimed.",
      formula: DEPOSIT_AFTER_FORMULA,
      via: "GET /api/liquity-v2/stability-pool/timeline",
    }),
    ...(big(row.coll_gain_since) > ZERO
      ? [
          {
            ...amountCell(
              "coll-gain",
              `${c} paid in`,
              big(row.coll_gain_since),
              c,
              branch.collateralAddr,
              coord(`${c} paid in — the DepositOperation's ethGainSinceLastOperation.`),
            ),
            sub: [{ content: `${formatCompact(units(collClaimed))} claimed` }],
          },
        ]
      : []),
    txCell(row.tx_hash, row.block_number, coord("Block — the block this DepositOperation was logged in.")),
  ];

  const slots: EventCardSlots = {
    event: {
      id: row.event_key,
      family: "liquity-v2-sp",
      txHash: row.tx_hash,
      blockNumber: Number(row.block_number),
      timestamp: Number(row.block_timestamp),
      number: eventNumber,
    },
    spine: { tokens, isLast },
    head: { label, labelTip: label === "Touched" ? DEPOSIT_TOUCH_TIP : undefined, deltas },
    caption: label,
    cells,
    sheet: spDepositSheet(row),
    ledgers: { none: "A deposit's balance is the Deposit side's total." },
    price: { gas: depositorGas(row), prices: [] },
    // What a touch is, closing the Explanation under the event's sentences.
    explainer: {
      body: (
        <>
          {bullets(spEventSentences(row, c))}
          <p className="mt-2 text-sm leading-relaxed text-rb-500" data-touch-note="">
            {DEPOSIT_TOUCH_TIP}
          </p>
        </>
      ),
    },
    learnMore: null,
  };
  return <EventCard slots={slots} avatar={null} />;
}

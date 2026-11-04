"use client";

// One CoW trade on the shared event-card shell (components/shared/event-card.tsx):
// T1 the trade in words, the spine's token rows (sold into the settlement,
// bought back to the wallet) with the amounts on their flanks; T2 Sold, Bought, the
// executed price, the fee where the log carries one, the settlement
// transaction and its block; T3 the trade in words. No USD: phase 1 reads no
// oracle at a trade's block, so the slot stays empty (rails-ops chain-truth
// charter §3).

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { SpineColumnProps } from "@/components/shared/spine-column";
import { BlockRef } from "@/components/shared/block-ref";
import { explorerUrl } from "@/lib/shared/chains";
import type { CowTrade } from "@/lib/cow/types";
import {
  COW_CHAIN_ID,
  amountNumber,
  amountText,
  executedPrice,
  executedPriceProv,
  exactAmount,
  settlementWords,
  shortAddress,
  tokenText,
  tradeAmountProv,
  type CowTokenLabel,
} from "@/lib/cow/trade";

export function CowTradeCard({
  trade,
  sell,
  buy,
  isLast,
  eventNumber,
}: {
  trade: CowTrade;
  sell: CowTokenLabel;
  buy: CowTokenLabel;
  isLast: boolean;
  eventNumber?: number;
}) {
  const sold = amountNumber(trade.sellAmount, sell.decimals);
  const bought = amountNumber(trade.buyAmount, buy.decimals);
  const sellProv = tradeAmountProv(trade, "sell", sell);
  const buyProv = tradeAmountProv(trade, "buy", buy);
  const price = executedPrice(trade, sell, buy);
  const fee = trade.feeAmount !== "0" ? trade.feeAmount : null;

  const spine: SpineColumnProps = {
    tokens: [
      { symbol: sell.symbol ?? "", address: sell.address, direction: "right", value: sold ?? undefined, verb: "sold" },
      { symbol: buy.symbol ?? "", address: buy.address, direction: "left", value: bought ?? undefined, verb: "bought" },
    ],
    isLast,
  };

  const cells: EventCellSpec[] = [
    {
      kind: "stat",
      key: "sold",
      label: "Sold",
      changed: true,
      figure: "cow-sold",
      value: {
        after: {
          text: `${amountText(trade.sellAmount, sell)} ${tokenText(sell)}`,
          info: sellProv,
          value: exactAmount(trade.sellAmount, sell.decimals) ?? trade.sellAmount,
        },
        icon: sell.symbol ?? undefined,
        iconAddress: sell.address,
      },
    },
    {
      kind: "stat",
      key: "bought",
      label: "Bought",
      changed: true,
      figure: "cow-bought",
      value: {
        after: {
          text: `${amountText(trade.buyAmount, buy)} ${tokenText(buy)}`,
          info: buyProv,
          value: exactAmount(trade.buyAmount, buy.decimals) ?? trade.buyAmount,
        },
        icon: buy.symbol ?? undefined,
        iconAddress: buy.address,
      },
    },
    {
      kind: "stat",
      key: "price",
      label: "Executed price",
      changed: false,
      inputs: ["sold", "bought"],
      figure: "cow-price",
      value: price
        ? { after: { text: price.text, info: executedPriceProv(trade, sell, buy, price), value: price.value } }
        : { none: "Decimals not read" },
    },
    ...(fee
      ? [
          {
            kind: "stat" as const,
            key: "fee",
            label: "Fee",
            changed: true,
            figure: "cow-fee",
            value: {
              after: {
                text: `${amountText(fee, sell)} ${tokenText(sell)}`,
                info: tradeAmountProv(trade, "fee", sell),
                value: exactAmount(fee, sell.decimals) ?? fee,
              },
            },
          },
        ]
      : []),
    {
      kind: "stat",
      key: "settlement",
      label: "Settlement",
      changed: false,
      value: {
        lines: [
          <a
            key="tx"
            href={explorerUrl(COW_CHAIN_ID, "tx", trade.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-muted font-mono text-xs"
          >
            {shortAddress(trade.txHash)} ↗
          </a>,
          <span key="block" className="text-xs text-rb-500">
            Block <BlockRef block={trade.blockNumber} chainId={COW_CHAIN_ID} size={12} />
          </span>,
        ],
      },
      sub: [{ content: settlementWords(trade) }],
    },
  ];

  const soldWords = `${amountText(trade.sellAmount, sell)} ${tokenText(sell)}`;
  const boughtWords = `${amountText(trade.buyAmount, buy)} ${tokenText(buy)}`;
  const others = trade.settlementTrades - 1;

  const slots: EventCardSlots = {
    event: {
      id: trade.id,
      family: "cow",
      txHash: trade.txHash,
      blockNumber: trade.blockNumber,
      timestamp: trade.timestamp,
      number: eventNumber,
    },
    spine,
    // The head is words (rails-ops decision 0045); the amounts stand on the
    // spine's flanks beside their tokens.
    // Below `sm`, where the spine draws no flanks, the head carries the two
    // amounts, signed out of and into the wallet.
    head: {
      label: `Sold ${tokenText(sell)} for ${tokenText(buy)}`,
      deltas:
        sold != null && bought != null
          ? [
              { value: -sold, symbol: sell.symbol ?? "", address: sell.address, prov: sellProv },
              { value: bought, symbol: buy.symbol ?? "", address: buy.address, prov: buyProv },
            ]
          : [],
    },
    caption: "Trade",
    cells,
    ledgers: { none: "A trade holds no balance in CoW Protocol." },
    explainer: {
      body: (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            This wallet sold {soldWords} and bought {boughtWords} through CoW Protocol&rsquo;s settlement contract.
          </li>
          {price && (
            <li>
              One {tokenText(price.base)} cost {price.text.split(" = ")[1]} in this trade.
            </li>
          )}
          {fee && (
            <li>
              The settlement kept {amountText(fee, sell)} {tokenText(sell)} of the sold amount as its fee.
            </li>
          )}
          <li>
            A solver sent the settlement transaction
            {others > 0
              ? `, which settled ${others.toLocaleString("en-US")} other ${others === 1 ? "trade" : "trades"} with this one`
              : ""}
            .
          </li>
        </ul>
      ),
    },
    learnMore: null,
  };
  return <EventCard slots={slots} avatar={null} />;
}

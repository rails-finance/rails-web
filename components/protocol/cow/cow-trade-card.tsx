"use client";

// One CoW trade on the shared event-card shell (components/shared/event-card.tsx):
// T1 the trade in words, the spine's token rows (sold into the settlement,
// bought for the order; the Trade log names no receiver) with the amounts on their flanks; every token
// icon on the card opens the asset's panel (AssetPopover); T2 Sold, Bought, the
// executed price, the fee where the log carries one, the settlement
// transaction and its block; T3 the trade in words. No USD: phase 1 reads no
// oracle at a trade's block, so the slot stays empty (rails-ops chain-truth
// charter §3).

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { SpineColumnProps } from "@/components/shared/spine-column";
import { BlockRef } from "@/components/shared/block-ref";
import { Prov } from "@/components/shared/provenance";
import { AssetPopover } from "@/components/shared/asset-popover";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { UnknownTokenSvg } from "@/components/shared/unknown-token-svg";
import { explorerUrl } from "@/lib/shared/chains";
import type { CowTrade } from "@/lib/cow/types";
import {
  COW_CHAIN_ID,
  amountNumber,
  amountText,
  executedPrice,
  executedPriceProv,
  exactAmount,
  settlementBlockProv,
  settlementWords,
  shortAddress,
  tokenText,
  tradeAmountProv,
  type CowTokenLabel,
} from "@/lib/cow/trade";
import { COW_TERMS, cowFeeSentence } from "@/lib/cow/terms";

/** A token's icon that opens its panel (AssetPopover): the contract, and the
 *  asset page's row and link where Rails has a page for it. */
function TokenIconPopover({ token }: { token: CowTokenLabel }) {
  return (
    <AssetPopover symbol={tokenText(token)} address={token.address}>
      {token.symbol ? (
        <TokenChipIcon symbol={token.symbol} address={token.address} size={16} filterable={false} untitled />
      ) : (
        <UnknownTokenSvg size={16} untitled />
      )}
    </AssetPopover>
  );
}

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
      {
        symbol: sell.symbol ?? "",
        address: sell.address,
        direction: "right",
        popover: true,
        value: sold ?? undefined,
        verb: "sold",
      },
      {
        symbol: buy.symbol ?? "",
        address: buy.address,
        direction: "left",
        popover: true,
        value: bought ?? undefined,
        verb: "bought",
      },
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
        chip: <TokenIconPopover token={sell} />,
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
        chip: <TokenIconPopover token={buy} />,
      },
    },
    {
      kind: "stat",
      key: "price",
      label: "Executed price",
      changed: false,
      inputs: fee ? ["sold", "fee", "bought"] : ["sold", "bought"],
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
            rel="noopener"
            className="link-muted font-mono text-xs"
          >
            {shortAddress(trade.txHash)} ↗
          </a>,
          <span key="block" className="text-xs text-rb-500">
            Block{" "}
            <Prov info={settlementBlockProv(trade)} value={String(trade.blockNumber)}>
              <BlockRef block={trade.blockNumber} chainId={COW_CHAIN_ID} size={12} />
            </Prov>
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
    ledgers: { none: `A trade holds no balance in ${COW_TERMS.name}.` },
    explainer: {
      body: (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            This wallet&rsquo;s order sold {soldWords} and bought {boughtWords} through {COW_TERMS.name}&rsquo;s
            settlement contract.
          </li>
          {price && (
            <li>
              One {tokenText(price.base)} cost {price.text.split(" = ")[1]} in this trade
              {fee ? ", on the sold amount less the fee" : ""}.
            </li>
          )}
          {fee && <li>{cowFeeSentence(`${amountText(fee, sell)} ${tokenText(sell)}`)}</li>}
          <li>
            By {COW_TERMS.name}&rsquo;s docs, its fees are part of the trade&rsquo;s execution, so Sold and Bought are
            amounts after fees: the order received less, or paid more, than it would have without them.
          </li>
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

"use client";

// One timeline row of a Polaris pETH account (ui-jobs 865): one transaction
// of the address's, as the server's classifier named it, on the shared
// event-card shell as the redeemer row draws it
// (components/protocol/liquity/redeemer-event-card.tsx). T1 the kind with the
// tokens it moved on the spine, T2 the effect, the ETH figures, the curve fee,
// the trade's price, any valuation at its block and the transaction, T3
// the row in words (T10·polaris). A valuation is labelled as one and is never
// added into ETH out.

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { SpineTokenRow } from "@/components/shared/spine-column";
import { BlockRef } from "@/components/shared/block-ref";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { explorerUrl, SEPOLIA_CHAIN_ID } from "@/lib/shared/chains";
import { FPETH, PETH, POLARIS_VENUES, POLARIS_WETH, VPETH } from "@/lib/polaris/asset-catalog";
import {
  big,
  exactUnits,
  PETH_EFFECTS,
  pethAmountText,
  pethKindLabel,
  pethLineToken,
  pethRowBullets,
  pethRowEffect,
  pethRowId,
  pethRowLines,
  units,
  ZERO,
  type PethTokenNames,
} from "@/lib/polaris/peth-ledger";
import { pethLineProv, pethRowEthProv, pethRowPriceProv, pethRowValuationProv } from "@/lib/polaris/peth-provenance";
import type { PethLedgerRow } from "@/lib/sources/api/polaris-peth";

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export const PETH_NAMES: PethTokenNames = {
  peth: { symbol: PETH.symbol, address: PETH.address },
  fpeth: { symbol: FPETH.symbol, address: FPETH.address },
  vpeth: { symbol: VPETH.symbol, address: VPETH.address },
  weth: { symbol: POLARIS_WETH.symbol, address: POLARIS_WETH.address },
};

const EFFECT_WORD = Object.fromEntries(PETH_EFFECTS.map((e) => [e.key, e.label]));

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
    figure: `polaris-peth-${key}`,
    value: {
      after: { text: `${pethAmountText(raw)} ${symbol}`, info, value: exactUnits(raw) },
      icon: symbol,
      iconAddress: address,
    },
  };
}

export function PolarisPethEventCard({
  row,
  isLast,
  eventNumber,
}: {
  row: PethLedgerRow;
  isLast: boolean;
  eventNumber?: number;
}) {
  const label = pethKindLabel(row.kind);
  const effect = pethRowEffect(row);
  const lines = pethRowLines(row);
  const ethIn = big(row.eth_in_raw);
  const ethOut = big(row.eth_out_raw);
  const fee = big(row.curve_fee_raw);
  const v = row.valuation;

  // The spine: each token the address's lines moved, one row per token and
  // direction, toward the wallet (left) or away from it (right).
  const byToken = new Map<string, { symbol: string; address: string; raw: bigint; dir: "in" | "out" }>();
  for (const l of lines) {
    const t = pethLineToken(l.token, PETH_NAMES, POLARIS_VENUES);
    const k = `${t.address}:${l.direction}`;
    const prev = byToken.get(k);
    byToken.set(k, { ...t, raw: (prev?.raw ?? ZERO) + big(l.amount_raw), dir: l.direction });
  }
  const tokens: SpineTokenRow[] = [...byToken.values()].map((t) => ({
    symbol: t.symbol,
    address: t.address,
    direction: t.dir === "in" ? "left" : "right",
    popover: true,
    value: units(t.raw),
    display: pethAmountText(t.raw),
  }));

  const lineCells: EventCellSpec[] = lines.map((l, i) => {
    const t = pethLineToken(l.token, PETH_NAMES, POLARIS_VENUES);
    return amountCell(
      `line-${i}`,
      `${pethKindLabel(l.rule)} (${l.direction === "in" ? "in" : "out"})`,
      big(l.amount_raw),
      t.symbol,
      t.address,
      pethLineProv(row, l, t.symbol),
    );
  });

  const cells: EventCellSpec[] = [
    {
      kind: "stat",
      key: "effect",
      label: "Effect",
      changed: false,
      value: { lines: [<span key="effect">{EFFECT_WORD[effect] ?? effect}</span>] },
    },
    ...lineCells,
    ...(ethIn > ZERO
      ? [amountCell("eth-in", "ETH in", ethIn, "ETH", POLARIS_WETH.address, pethRowEthProv(row, "ethIn"))]
      : []),
    ...(ethOut > ZERO
      ? [amountCell("eth-out", "ETH out", ethOut, "ETH", POLARIS_WETH.address, pethRowEthProv(row, "ethOut"))]
      : []),
    ...(fee > ZERO ? [amountCell("fee", "Curve fee", fee, PETH.symbol, PETH.address, pethRowEthProv(row, "fee"))] : []),
    ...(row.event_price_raw
      ? [
          {
            kind: "stat",
            key: "price",
            label: "Price per pETH",
            changed: false,
            figure: "polaris-peth-price",
            value: {
              after: {
                text: `${pethAmountText(big(row.event_price_raw))} ETH`,
                info: pethRowPriceProv(row),
                value: exactUnits(big(row.event_price_raw)),
              },
            },
          } satisfies EventCellSpec,
        ]
      : []),
    ...(v && v.price_at_block_filled && v.eth_raw != null
      ? [
          amountCell(
            "valued-eth",
            v.kind === "psm_mint" ? "Valued then" : "Valued at the floor then",
            big(v.eth_raw),
            "ETH",
            POLARIS_WETH.address,
            pethRowValuationProv(row, "eth"),
          ),
        ]
      : []),
    ...(v && v.price_at_block_filled && v.kind === "peth_arrival" && v.eth_at_spot_raw != null
      ? [
          amountCell(
            "valued-spot",
            "Valued at spot then",
            big(v.eth_at_spot_raw),
            "ETH",
            POLARIS_WETH.address,
            pethRowValuationProv(row, "spot"),
          ),
        ]
      : []),
    ...(v && v.price_at_block_filled && v.kind === "peth_arrival" && v.eth_at_floor_raw != null
      ? [
          amountCell(
            "valued-floor",
            "Valued at the floor then",
            big(v.eth_at_floor_raw),
            "ETH",
            POLARIS_WETH.address,
            pethRowValuationProv(row, "floor"),
          ),
        ]
      : []),
    {
      kind: "stat",
      key: "tx",
      label: "Transaction",
      changed: false,
      value: {
        lines: [
          <a
            key="tx"
            href={explorerUrl(SEPOLIA_CHAIN_ID, "tx", row.tx_hash)}
            target="_blank"
            rel="noopener"
            className="link-muted font-mono text-xs"
          >
            {short(row.tx_hash)} ↗
          </a>,
          <span key="block" className="text-xs text-rb-500">
            Block{" "}
            <Prov
              info={{
                kind: "chain",
                pclass: "emitted",
                summary: "Block — the block this transaction landed in.",
                via: "GET /api/polaris/peth/<address>",
                source: { block: row.block_number, txHash: row.tx_hash },
              }}
              value={row.block_number}
            >
              <BlockRef block={Number(row.block_number)} chainId={SEPOLIA_CHAIN_ID} size={12} />
            </Prov>
          </span>,
        ],
      },
    },
  ];

  const headline = lines[0];
  const headToken = headline ? pethLineToken(headline.token, PETH_NAMES, POLARIS_VENUES) : null;
  const bullets = pethRowBullets(row, PETH_NAMES);
  const slots: EventCardSlots = {
    event: {
      id: pethRowId(row),
      family: "polaris-peth",
      txHash: row.tx_hash,
      blockNumber: Number(row.block_number),
      timestamp: Number(row.block_timestamp ?? 0),
      number: eventNumber,
    },
    spine: { tokens, isLast },
    head: {
      label,
      clauses: [],
      deltas:
        headline && headToken
          ? [
              {
                label: EFFECT_WORD[effect] ?? effect,
                value: units(big(headline.amount_raw)),
                symbol: headToken.symbol,
                address: headToken.address,
                exact: exactUnits(big(headline.amount_raw)),
                display: pethAmountText(big(headline.amount_raw)),
                prov: pethLineProv(row, headline, headToken.symbol),
              },
            ]
          : [],
    },
    caption: label,
    cells,
    ledgers: { none: "A pETH account row holds no balance." },
    explainer: {
      body:
        bullets.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed" data-anatomy="T10·polaris">
            {bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed" data-anatomy="T10·polaris">
            This transaction moved no pETH for this address.
          </p>
        ),
    },
    learnMore: null,
  };
  return <EventCard slots={slots} avatar={null} />;
}

"use client";

// One timeline row of a Polaris pETH account (ui-jobs 865): one transaction
// of the address's, as the server's classifier named it, on the shared
// event-card shell as the redeemer row draws it
// (components/protocol/liquity/redeemer-event-card.tsx). T1 the kind with the
// tokens it moved on the spine, T2 the effect, the ETH figures, the curve fee,
// the trade's price, any valuation at its block and the transaction, T3
// the row in words (T10·polaris), closed by the link to the place its tokens
// went to or came from (T10.1·polaris; ui-jobs 872). A valuation is labelled
// as one and is never added into ETH out.

import Link from "next/link";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { SpineTokenRow } from "@/components/shared/spine-column";
import { txCell } from "@/components/shared/event-tx-cell";
import type { Provenance } from "@/components/shared/provenance";
import { SEPOLIA_CHAIN_ID } from "@/lib/shared/chains";
import {
  FPETH,
  PETH,
  POLARIS_TOKENS_BY_ADDRESS,
  POLARIS_VENUES,
  POLARIS_WETH,
  VPETH,
} from "@/lib/polaris/asset-catalog";
import {
  big,
  exactUnits,
  PETH_EFFECTS,
  pethAmountText,
  pethKindLabel,
  pethLineToken,
  pethPlaceWords,
  pethRowBullets,
  pethRowEffect,
  pethRowId,
  pethRowLines,
  pethSpineAmountLink,
  units,
  ZERO,
  type PethTokenNames,
} from "@/lib/polaris/peth-ledger";
import { pethLineProv, pethRowEthProv, pethRowPriceProv, pethRowValuationProv } from "@/lib/polaris/peth-provenance";
import { PETH_PLACE_NAMES, pethPlaceHref } from "@/lib/polaris/peth-place-links";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import type { PethLedgerRow } from "@/lib/sources/api/polaris-peth";
import { polarisPethSheet } from "./polaris-peth-sheet";

export const PETH_NAMES: PethTokenNames = {
  peth: { symbol: PETH.symbol, address: PETH.address },
  fpeth: { symbol: FPETH.symbol, address: FPETH.address },
  vpeth: { symbol: VPETH.symbol, address: VPETH.address },
  weth: { symbol: POLARIS_WETH.symbol, address: POLARIS_WETH.address },
  others: POLARIS_TOKENS_BY_ADDRESS,
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

/** The row's primary place as a link: its page (→) or the contract on the
 *  block explorer (↗), with the T3 line's text, or with `direction` the words
 *  for one line's amount. Null where the row has none. */
function pethPlaceLinkOf(
  row: PethLedgerRow,
  direction?: "in" | "out",
): { href: string; tip: string; external: boolean } | null {
  const p = row.place;
  const to = p ? pethPlaceHref(p) : null;
  if (!p || !to) return null;
  return { ...to, tip: `${pethPlaceWords(row, p, PETH_PLACE_NAMES, direction)} ${to.external ? "↗" : "→"}` };
}

/** The row's place line in T3. Null where the row has none. */
export function PlaceLine({ row }: { row: PethLedgerRow }) {
  const to = pethPlaceLinkOf(row);
  if (!to) return null;
  return (
    <p className="mt-2 text-sm leading-relaxed" data-anatomy="T10.1·polaris" data-peth-row-place={row.place?.kind}>
      {to.external ? (
        <a href={to.href} target="_blank" rel="noopener" className={INLINE_LINK}>
          {to.tip}
        </a>
      ) : (
        <Link href={to.href} prefetch={false} className={INLINE_LINK}>
          {to.tip}
        </Link>
      )}
    </p>
  );
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
  // Keyed by token address and direction, as `primary` below is.
  for (const l of lines) {
    const t = pethLineToken(l.token, PETH_NAMES, POLARIS_VENUES);
    const k = `${t.address}:${l.direction}`;
    const prev = byToken.get(k);
    byToken.set(k, { ...t, raw: (prev?.raw ?? ZERO) + big(l.amount_raw), dir: l.direction });
  }
  // The amounts of the row's primary lines open its place where it has a
  // Rails page, each with the T3 line's words for its line's direction as the
  // tooltip (ui-jobs 872, 878): a CDP's collateral sent reads "Went to USDp
  // CDP #12", a deposit's gain paid "Came from USDp deposit #3". The spine
  // links no page outside Rails: a place on the block explorer leaves its
  // amounts plain.
  const primary = new Set(
    lines
      .filter((l) => l.rule === row.kind)
      .map((l) => `${pethLineToken(l.token, PETH_NAMES, POLARIS_VENUES).address}:${l.direction}`),
  );
  const tokens: SpineTokenRow[] = [...byToken.entries()].map(([k, t]) => {
    const place = primary.has(k) ? pethPlaceLinkOf(row, t.dir) : null;
    const amountLink = pethSpineAmountLink(place);
    return {
      symbol: t.symbol,
      address: t.address,
      direction: t.dir === "in" ? "left" : "right",
      popover: true,
      value: units(t.raw),
      display: pethAmountText(t.raw),
      ...(amountLink ? { amountLink } : {}),
    };
  });

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
    txCell({
      txHash: row.tx_hash,
      block: row.block_number,
      info: {
        kind: "chain",
        pclass: "emitted",
        summary: "Block — the block this transaction landed in.",
        via: "GET /api/polaris/peth/<address>",
        source: { block: row.block_number, txHash: row.tx_hash },
      },
      chainId: SEPOLIA_CHAIN_ID,
    }),
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
    sheet: polarisPethSheet(row),
    ledgers: { none: "Each balance is its side's total." },
    explainer: {
      body: (
        <>
          {bullets.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed" data-anatomy="T10·polaris">
              {bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-relaxed" data-anatomy="T10·polaris">
              This transaction moved no pETH for this address.
            </p>
          )}
          <PlaceLine row={row} />
        </>
      ),
    },
    learnMore: null,
  };
  return <EventCard slots={slots} avatar={null} />;
}

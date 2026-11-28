"use client";

// One Aave position swap settled through CoW, on the shared event-card shell
// (components/shared/event-card.tsx), as the CoW figures' listings draw it
// (cow-aave-swaps-view.tsx): T1 the swap's kind in words, the spine's two legs
// (given out of the position, received into it); T2 the surplus and the fees,
// each in its token and in US dollars at the trade's block, the fee in bp, the
// position and the settlement transaction; T3 the swap in words. The amounts
// are the swap's legs as the position's timeline pairs them.

import Link from "next/link";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { SpineColumnProps, SpineSwapLeg } from "@/components/shared/spine-column";
import { txCell } from "@/components/shared/event-tx-cell";
import { LinkedValue } from "@/components/shared/linked-value";
import { Prov } from "@/components/shared/provenance";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { COW_TERMS } from "@/lib/cow/terms";
import { COW_CHAIN_ID, shortAddress } from "@/lib/cow/trade";
import {
  COW_AAVE_FAMILY_NAME,
  COW_SHAPE_LABEL,
  bpText,
  cowSwapEventHref,
  cowSwapPositionHref,
  shiftRaw,
  swapKindText,
  tokenAmountText,
  usdText,
  type CowAaveFamily,
  type CowAaveSwap,
} from "@/lib/cow/aave-totals";
import { cowSwapBpProv, cowSwapUsdProv } from "@/lib/cow/aave-totals-provenance";

type Labels = Record<string, { symbol: string | null; decimals: number | null }>;

const NATIVE_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function label(labels: Labels, address: string): { symbol: string | null; decimals: number | null } {
  if (address === NATIVE_ETH) return { symbol: "ETH", decimals: 18 };
  return labels[address] ?? { symbol: null, decimals: null };
}

const legNumber = (raw: string | undefined, decimals: number | null) =>
  raw == null || decimals == null ? undefined : Number(shiftRaw(raw, decimals));

export function CowAaveSwapCard({
  family,
  swap: s,
  labels,
  isLast,
}: {
  family: CowAaveFamily;
  swap: CowAaveSwap;
  labels: Labels;
  isLast: boolean;
}) {
  const given = label(labels, s.given);
  const received = label(labels, s.received);
  const t = s.trade;
  const tokenSym = t ? (t.token.symbol ?? shortAddress(t.token.address)) : "";
  const kind = swapKindText(s.kind);

  // The Aave swap grammar (aave-v4-event-card.tsx): the swap glyph, the legs stacked beside it, given then
  // received; a leg whose amount is not known is left out.
  const swapLegs: SpineSwapLeg[] = [];
  for (const [address, l, raw] of [
    [s.given, given, s.givenAmount],
    [s.received, received, s.receivedAmount],
  ] as const) {
    const value = legNumber(raw, l.decimals);
    if (value != null && l.symbol) swapLegs.push({ symbol: l.symbol, address, value });
  }
  const spine: SpineColumnProps = {
    icon: "swap",
    swapLegs,
    swapAxis: s.kind === "collateral_swap" ? "supply" : s.kind === "debt_swap" ? "debt" : "mixed",
    isLast,
  };

  const surplusProv = cowSwapUsdProv(family, s, "surplus");
  const feeProv = cowSwapUsdProv(family, s, "fees");
  const bpProv = cowSwapBpProv(s);
  const noneText = t?.unpriced === "no-decimals" ? "Decimals not read" : "No price";
  const cells: EventCellSpec[] = t
    ? [
        {
          kind: "stat",
          key: "surplus",
          label: COW_SHAPE_LABEL[t.shape],
          changed: true,
          figure: "cow-swap-surplus",
          value:
            !t.unpriced && t.surplusUsd != null && surplusProv
              ? { after: { text: usdText(t.surplusUsd), info: surplusProv, value: t.surplusUsd.toFixed(2) } }
              : { none: noneText },
          sub: [{ content: `${tokenAmountText(t.surplus, t.token.decimals)} ${tokenSym}` }],
        },
        {
          kind: "stat",
          key: "fees",
          label: "Fees in the trade's price",
          changed: true,
          figure: "cow-swap-fees",
          value: t.unpriced
            ? { none: noneText }
            : t.feeUsd != null && feeProv
              ? { after: { text: usdText(t.feeUsd), info: feeProv, value: t.feeUsd.toFixed(2) } }
              : { none: "No fee" },
          sub:
            !t.feeGap.startsWith("-") && bpProv
              ? [{ content: bpText(t.feeBp) }]
              : [{ content: `${tokenAmountText(t.feeGap, t.token.decimals)} ${tokenSym}` }],
        },
      ]
    : [];
  cells.push({
    kind: "stat",
    key: "position",
    label: "Position",
    changed: false,
    value: {
      lines: [
        <LinkedValue
          key="w"
          href={cowSwapPositionHref(family, s)}
          tip={`${COW_AAVE_FAMILY_NAME[family]} position of ${shortAddress(s.wallet)} →`}
          label={shortAddress(s.wallet)}
          className={`font-mono text-xs ${INLINE_LINK}`}
        >
          {shortAddress(s.wallet)}
        </LinkedValue>,
        <span key="m" className="text-xs capitalize text-rb-500">
          {s.market}
        </span>,
      ],
    },
  });
  cells.push(
    txCell({ key: "settlement", label: "Settlement", txHash: s.txHash, block: s.block, chainId: COW_CHAIN_ID }),
  );

  const slots: EventCardSlots = {
    event: { id: s.swapKey, family: `cow-${family}`, txHash: s.txHash, blockNumber: s.block, timestamp: s.timestamp },
    spine,
    // The closed row states both figures, apart, each with its receipt.
    head: {
      label: `${kind} via CoW`,
      deltas: [],
      clauses: !t
        ? ["No trade read"]
        : t.unpriced
          ? [t.unpriced === "no-decimals" ? `Decimals of ${tokenSym} not read` : `No price for ${tokenSym}`]
          : [
              <span key="s" data-cow-row-surplus="">
                Surplus{" "}
                {surplusProv && t.surplusUsd != null ? (
                  <Prov info={surplusProv} value={t.surplusUsd.toFixed(2)}>
                    <span className="tabular-nums text-foreground">{usdText(t.surplusUsd)}</span>
                  </Prov>
                ) : null}
              </span>,
              <span key="f" data-cow-row-fees="">
                {t.feeUsd != null && feeProv ? (
                  <>
                    Fees{" "}
                    <Prov info={feeProv} value={t.feeUsd.toFixed(2)}>
                      <span className="tabular-nums text-foreground">{usdText(t.feeUsd)}</span>
                    </Prov>
                  </>
                ) : (
                  "No fee"
                )}
              </span>,
            ],
    },
    caption: kind,
    cells,
    ledgers: { none: `A swap holds no balance in ${COW_TERMS.name}.` },
    explainer: {
      body: (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            A {kind.toLowerCase()} on this {COW_AAVE_FAMILY_NAME[family]} position, settled through{" "}
            {COW_TERMS.settlement.replace(/'/g, "’")}.
          </li>
          {t ? (
            t.unpriced ? (
              <li>
                {t.unpriced === "no-decimals"
                  ? `The decimals of ${tokenSym} are not read, so this swap is in neither figure.`
                  : `Aave has no price for ${tokenSym}, so this swap is in neither figure.`}
              </li>
            ) : null
          ) : (
            <li>No trade is read for this swap&rsquo;s settlement yet, so it is in neither figure.</li>
          )}
          <li>
            <Link href={cowSwapEventHref(family, s)} className={INLINE_LINK}>
              Open the swap on the position&rsquo;s timeline
            </Link>
          </li>
        </ul>
      ),
    },
    learnMore: null,
  };
  return <EventCard slots={slots} avatar={null} />;
}

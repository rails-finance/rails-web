"use client";

// One Sky Savings position: an address that holds sUSDS. The listing row and
// the position page draw it through the shared position card (rails-ops
// TO-DO-position-card 322); `skySavingsCardSlots` turns the position into the
// shell's slots.
//
// Every figure is at the sealed block the api names (`asOf`), and the page
// draws the card only once the gate has passed. The balance is in sUSDS, its
// worth and the interest earned in USDS (exact decimals in the tooltip), and
// the Savings Rate and the share price are those in force at that block.

import { useState, type ReactNode } from "react";
import { Hash, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { PositionCard, type PositionCardHead, type PositionCardSlots } from "@/components/shared/position-card";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { Prov } from "@/components/shared/provenance";
import { AssetAmount } from "@/components/shared/asset-amount";
import { WalletPill } from "@/components/shared/wallet-pill";
import { withRealMinus } from "@/lib/utils/format";
import { formatCompact } from "@/lib/shared/format-compact";
import { skyPositionContent } from "@/lib/sky-savings/learn-more";
import { SUSDS, USDS } from "@/lib/sky-savings/constants";
import { exact, pctString, rayExact, rayNumber, skyYearlyEarnings, units, yearlyText } from "@/lib/sky-savings/math";
import { chiProv, earnedProv, rateProv, sharesHeldProv, valueProv, yearlyProv } from "@/lib/sky-savings/provenance";
import type { SkyAsOf, SkyPosition } from "@/lib/sky-savings/types";
import { PanelFigure } from "@/components/shared/position-card-panel";

const worthHead = (p: SkyPosition, asOf: SkyAsOf): PositionCardHead => {
  const v = p.value ? units(p.value.raw) : 0;
  return {
    id: "worth",
    label: "Worth",
    labelTip:
      "What the sUSDS held redeems for in USDS at the page's block: the share count times the share price, rounded down as the contract rounds it.",
    value:
      p.value && v > 0 ? (
        <Prov info={valueProv(asOf.block, p.value.raw, p.shares.raw, asOf.chi)}>
          <AssetAmount value={v} symbol={USDS.symbol} address={USDS.address} exact={exact(p.value.raw)} />
        </Prov>
      ) : null,
    sub: p.value && v > 0 ? undefined : "nothing held",
  };
};

const earnedHead = (p: SkyPosition, asOf: SkyAsOf): PositionCardHead => {
  const label = "Interest earned";
  const labelTip =
    "What the position is worth now, plus every USDS amount that left it, less every USDS amount that came in.";
  if (!p.earned) return { id: "earned", label, labelTip, value: null };
  const yearly = skyYearlyEarnings(p, asOf);
  const e = units(p.earned.raw);
  return {
    id: "earned",
    label,
    labelTip,
    value: (
      <span title={`${withRealMinus(exact(p.earned.raw))} ${USDS.symbol}`}>
        <Prov info={earnedProv(asOf.block, p.earned.raw, p.value?.raw ?? "0", p.usdsIn.raw, p.usdsOut.raw)}>
          <AssetAmount
            value={e}
            symbol={USDS.symbol}
            address={USDS.address}
            exact={exact(p.earned.raw)}
            signed={e < 0}
          />
        </Prov>
      </span>
    ),
    sub:
      yearly != null && p.value ? (
        <Prov
          info={yearlyProv(asOf.block, p.value.raw, asOf.ssr, pctString(asOf.ssrAnnual))}
          value={yearly.toFixed(2)}
          symbol={USDS.symbol}
        >
          <span className="tabular-nums">
            about {yearlyText(yearly)} {USDS.symbol} a year at {pctString(asOf.ssrAnnual)}
          </span>
        </Prov>
      ) : undefined,
  };
};

const rateHead = (asOf: SkyAsOf): PositionCardHead => ({
  id: "rate",
  label: "Savings Rate",
  labelTip:
    "The yearly rate Sky governance has set for every sUSDS holder, in force at the page's block. Governance can change it at any block.",
  value: (
    <Prov info={rateProv(asOf.block, asOf.ssr, pctString(asOf.ssrAnnual))} value={pctString(asOf.ssrAnnual)}>
      <span>{pctString(asOf.ssrAnnual)}</span>
    </Prov>
  ),
});

/** The position's rows at the head of the card's ⋮: a link to its page. */
function SkyMenuRows({ holder }: { holder: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  return (
    <>
      <ToolsMenuItem
        icon={copied === "id" ? <Icon name="check" size={16} /> : <Hash size={16} />}
        title="Holder address"
        subtitle={copied === "id" ? "Copied" : "Copy the address"}
        onClick={() => copy("id", holder)}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this position"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}/ethereum/sky-savings/${holder}`)}
      />
    </>
  );
}

export interface SkySavingsPositionCardProps {
  p: SkyPosition;
  asOf: SkyAsOf;
  surface?: "listing" | "detail";
  explanation?: ReactNode;
  /** A line at the card's foot: the block the gate checked the page against. */
  foot?: ReactNode;
  viewHref?: () => string;
}

export function skySavingsCardSlots({
  p,
  asOf,
  surface = "listing",
  explanation,
  foot,
  viewHref,
}: SkySavingsPositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  // A position that holds nothing keeps its figures (the interest it earned)
  // and wears the Closed tag; a live one wears none.
  const status = p.status === "open" ? null : { word: "Closed", tone: "muted" as const };
  const heads = [worthHead(p, asOf), earnedHead(p, asOf), rateHead(asOf)];
  const counters = {
    lastActivityAt: p.activity.lastTimestamp ?? null,
    eventCount: p.activity.events,
    eventCountNoun: "event",
    ...(detail ? { order: "age-last" as const } : {}),
  };
  if (!detail) {
    return {
      surface: "listing",
      status,
      heads,
      counters,
      menu: null,
      identity: (
        <WalletPill wallet={p.holder} ensName={null} filterProtocol="sky-savings" bookmarkProtocol="sky-savings" />
      ),
    };
  }
  const shares = units(p.shares.raw);
  return {
    surface: "detail",
    status,
    heads,
    counters,
    panel: [
      [
        {
          id: "balance",
          label: "Balance",
          tip: "The sUSDS shares the address holds: every deposit, withdrawal and transfer that names it, replayed in order to the page's block.",
          value:
            shares > 0 ? (
              <Prov info={sharesHeldProv(p.holder, asOf.block, p.shares.raw)}>
                <span data-prov-exact={exact(p.shares.raw)} data-prov-symbol={SUSDS.symbol}>
                  {formatCompact(shares)}
                </span>
              </Prov>
            ) : (
              "—"
            ),
          ...(shares > 0 && {
            asset: { symbol: SUSDS.symbol, address: SUSDS.address, figure: `${exact(p.shares.raw)} ${SUSDS.symbol}` },
          }),
        },
      ],
      asOf.chi
        ? [
            {
              id: "share-price",
              label: "Share price",
              tip: "The USDS one sUSDS redeems for at the page's block, called chi in the contract. It grows every second at the Savings Rate.",
              value: (
                <Prov info={chiProv(asOf)} value={rayExact(asOf.chi)} symbol={USDS.symbol}>
                  <span className="tabular-nums">
                    <PanelFigure>1</PanelFigure> {SUSDS.symbol} ={" "}
                    <PanelFigure>{rayNumber(asOf.chi).toFixed(6)}</PanelFigure> {USDS.symbol}
                  </span>
                </Prov>
              ),
            },
          ]
        : [],
    ],
    foot,
    explainer: { body: explanation ?? null, viewHref },
    learnMore: skyPositionContent(),
    menu: { leading: () => <SkyMenuRows holder={p.holder} />, exports: null },
  };
}

/** The Sky Savings position card: its slots, drawn by the shared card. */
export function SkySavingsPositionCard(props: SkySavingsPositionCardProps) {
  return <PositionCard slots={skySavingsCardSlots(props)} />;
}

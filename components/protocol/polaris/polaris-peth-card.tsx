"use client";

// A Polaris pETH account's card, on the position card shell (P1; the
// redeemer's card is the sibling, components/protocol/liquity/redeemer-card.tsx):
// the headlines are the ETH the address paid for pETH and the ETH that
// reached it (ETH and WETH only), the curve fees it paid, and the pETH it
// holds at the head; the panel values that holding at the curve's spot and
// floor, the gap between them, and the two prices (ui-jobs 865). No profit or
// loss, no percentage, no gain or loss colour (the equity-at-the-feed ruling).

import { useState, type ReactNode } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import {
  PositionCard,
  type PositionCardHead,
  type PositionCardSlots,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { Prov } from "@/components/shared/provenance";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { ListingTag } from "@/components/shared/listing-tag";
import { positionName } from "@/lib/shared/position-name";
import { positionLink } from "@/lib/shared/position-link";
import { PETH, POLARIS_WETH } from "@/lib/polaris/asset-catalog";
import { polarisPethAccountHref } from "@/lib/polaris/routes";
import { exactUnits, type PethHeadlines } from "@/lib/polaris/peth-ledger";
import { pethHeadProv, pethLedgerSumProv, pethValuedProv } from "@/lib/polaris/peth-provenance";
import { RawFigure, tokenIcon } from "./polaris-sp-loan-parts";

const ETH = "ETH";
const W = POLARIS_WETH;

/** The heavy address's sentence, the same on the card, the explanation, the
 *  timeline and the refusal. */
export const PETH_HEAVY = "This address has too many transactions for one page, so its pETH account is not drawn.";

/** Why a head figure is not on the card. */
export const PETH_UNREAD = {
  ledger: "History still being read",
  heavy: PETH_HEAVY,
  head: "The current figures did not load. Reload to try again.",
} as const;

function PethMenuRows({ address }: { address: string }) {
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
        icon={copied === "id" ? <Check size={16} /> : <Copy size={16} />}
        title="Address"
        subtitle={copied === "id" ? "Copied" : "Copy the address"}
        onClick={() => copy("id", address)}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Check size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this page"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", positionLink(polarisPethAccountHref(address)))}
      />
    </>
  );
}

export interface PolarisPethCardProps {
  address: string;
  figures: PethHeadlines;
  /** Why the ledger's figures are absent, or null where they are served. */
  ledgerGap: "reading" | "too_heavy" | null;
  /** The head reads answered. */
  headRead: boolean;
  scannedTo: string | null;
  /** The ledger is served with its freshness unchecked. */
  unchecked?: boolean;
  headBlock: string | null;
  /** The newest row's timestamp. */
  lastAt: number | null;
  explanation: ReactNode;
}

export function polarisPethSlots({
  address,
  figures: f,
  ledgerGap,
  headRead,
  scannedTo,
  unchecked = false,
  headBlock,
  lastAt,
  explanation,
}: PolarisPethCardProps): PositionCardSlots {
  const ledgerHead = (
    id: string,
    label: string,
    raw: bigint | null,
    symbol: string,
    address: string,
    what: "ethIn" | "ethOut" | "curveFees",
    labelTip: string,
  ): PositionCardHead => ({
    id,
    label,
    labelTip,
    value:
      raw != null ? (
        <Prov info={pethLedgerSumProv(what, scannedTo, unchecked)}>
          <RawFigure raw={raw} symbol={symbol} />
        </Prov>
      ) : null,
    unavailable:
      raw == null
        ? ledgerGap === "too_heavy"
          ? PETH_UNREAD.heavy
          : ledgerGap === "reading"
            ? PETH_UNREAD.ledger
            : true
        : undefined,
    assets: raw != null ? tokenIcon(symbol, address, raw) : undefined,
  });

  const heads: PositionCardHead[] = [
    ledgerHead(
      "eth-in",
      "ETH in",
      f.ethIn,
      ETH,
      W.address,
      "ethIn",
      "The ETH and WETH this address paid for pETH and fpETH.",
    ),
    ledgerHead("eth-out", "ETH out", f.ethOut, ETH, W.address, "ethOut", "The ETH and WETH that reached this address."),
    ledgerHead(
      "curve-fees",
      "Curve fees paid",
      f.curveFees,
      PETH.symbol,
      PETH.address,
      "curveFees",
      "The fees the bonding curve took on this address's trades, in pETH.",
    ),
    {
      id: "peth-held",
      label: "pETH held",
      labelTip: "The pETH in this address's wallet now.",
      value:
        f.pethHeld != null ? (
          <Prov info={pethHeadProv("pethHeld", headBlock)}>
            <RawFigure raw={f.pethHeld} symbol={PETH.symbol} />
          </Prov>
        ) : null,
      unavailable: f.pethHeld == null ? (headRead ? true : PETH_UNREAD.head) : undefined,
      assets: f.pethHeld != null ? tokenIcon(PETH.symbol, PETH.address, f.pethHeld) : undefined,
    },
  ];

  const ethRow = (
    id: string,
    label: string,
    raw: bigint | null,
    info: Parameters<typeof Prov>[0]["info"],
    tip: string,
  ): PositionPanelRow => ({
    id,
    label,
    tip,
    asset: raw != null ? { symbol: ETH, address: W.address, figure: `${exactUnits(raw)} ${ETH}` } : undefined,
    value:
      raw != null ? (
        <Prov info={info}>
          <RawFigure raw={raw} symbol={ETH} />
        </Prov>
      ) : null,
    unavailable: raw == null ? (headRead ? true : PETH_UNREAD.head) : undefined,
  });

  const gap = f.atSpot != null && f.atFloor != null ? f.atSpot - f.atFloor : null;
  const left: PositionPanelRow[] = [
    ethRow(
      "at-spot",
      "pETH held at spot",
      f.atSpot,
      pethValuedProv("pethSpot", headBlock),
      "The pETH held, at the bonding curve's price now.",
    ),
    ethRow(
      "at-floor",
      "pETH held at the floor",
      f.atFloor,
      pethValuedProv("pethFloor", headBlock),
      "The pETH held, at the floor price the protocol only raises.",
    ),
    {
      id: "spot-over-floor",
      label: "Spot over the floor",
      tip: "The holding's value at spot less its value at the floor.",
      asset: gap != null ? { symbol: ETH, address: W.address, figure: `${exactUnits(gap)} ${ETH}` } : undefined,
      value:
        gap != null ? (
          <Prov
            info={{
              ...pethValuedProv("pethSpot", headBlock),
              summary:
                "Spot over the floor — pETH held at spot less pETH held at the floor, both at the head block, in ETH.",
              formula: "balanceOf(address) × (currentPrice() − floorPrice()) ÷ 10¹⁸",
            }}
          >
            <RawFigure raw={gap} symbol={ETH} />
          </Prov>
        ) : null,
      unavailable: gap == null ? (headRead ? true : PETH_UNREAD.head) : undefined,
    },
  ];
  const right: PositionPanelRow[] = [
    ethRow("spot", "Spot price", f.spot, pethHeadProv("spot", headBlock), "One pETH in ETH at the bonding curve now."),
    ethRow(
      "floor",
      "Floor price",
      f.floor,
      pethHeadProv("floor", headBlock),
      "One pETH in ETH at the floor, which the protocol only raises.",
    ),
  ];

  return {
    surface: "detail",
    status: null,
    lifecycle: false,
    heads,
    tag: <ListingTag market="pETH account" />,
    counters: { lastActivityAt: lastAt, eventCount: null, liquidationCount: null, order: "age-last" },
    name: positionName({ noun: "pETH account", id: address }),
    explainer: { body: explanation },
    learnMore: null,
    menu: { leading: () => <PethMenuRows address={address} />, noun: "account", exports: null },
    panel: [left, right],
  };
}

export function PolarisPethCard(props: PolarisPethCardProps) {
  return <PositionCard slots={polarisPethSlots(props)} />;
}

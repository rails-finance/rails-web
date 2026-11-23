"use client";

// A Liquity V1 stability-pool deposit on the shared position card, as
// Liquity V2's deposit card draws one (sp-deposit-card.tsx): one depositor,
// one pool.
//
// On its page the headlines are the pool's getters at head: the deposit now
// (getCompoundedLUSDDeposit), the ETH the next touch pays out
// (getDepositorETHGain) and the LQTY accrued for it (getDepositorLQTYGain). A
// listing row states the index's figures: the deposit recorded at the last
// touch (≈, since liquidations burn it between touches), and the ETH and LQTY
// paid at touches.

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
import { WalletPill } from "@/components/shared/wallet-pill";
import { ListingTag } from "@/components/shared/listing-tag";
import { LinkedAddress } from "@/components/shared/linked-address";
import { positionName } from "@/lib/shared/position-name";
import { liquityV1DepositHref, LIQUITY_V1_SP_PATH } from "@/lib/liquity-v1/sp-routes";
import {
  big,
  exactUnits,
  isTagged,
  listingDeposit,
  poolShare,
  type DepositLifetime,
  type DepositNow,
} from "@/lib/liquity-v1/sp-math";
import { spLiveProv, spPendingLossProv, spPoolShareProv, spSumProv } from "@/lib/liquity-v1/sp-provenance";
import { pctText } from "@/lib/shared/vault-amount-text";
import { TINY_AMOUNT_FLOOR_TEXT } from "@/lib/utils/format";
import type { LiquityV1DepositRow } from "@/lib/sources/api/liquity-v1-sp";
import { RawFigure, tokenIcon, V1_SP_TOKENS } from "./v1-sp-parts";

const NOUN = "Deposit";
const MARKET = "Stability Pool";
const ZERO = BigInt(0);
/** Where the chain has seen a touch the index has not read. */
const INDEX_BEHIND = "the index has not yet read the newest touch";
const PENDING_ETH_TIP =
  "The ETH liquidations have paid the deposit since its last touch. The next touch sends it to the depositor, or to the depositor's Trove.";

export interface LiquityV1DepositCardProps {
  row: LiquityV1DepositRow;
  surface?: "listing" | "detail";
  lifetime?: DepositLifetime | null;
  /** The chain read at head. On a listing surface (the wallet page), the
   *  Deposit headline states it in place of the last touch's figure. */
  now?: DepositNow | null;
  /** The block the wallet page read `now` at, for its receipts. */
  nowBlock?: number;
  /** The chain read is in flight. */
  pending?: boolean;
  /** The pool's getTotalLUSDDeposits() and the block of the read `now` came from. */
  pool?: { totalRaw: bigint; block: number } | null;
  /** The chain's deposits(depositor) differs from the index's recorded
   *  deposit: the chain has seen a touch the index has not read yet. */
  indexBehind?: boolean;
  explanation?: ReactNode;
}

function DepositMenuRows({ row }: { row: LiquityV1DepositRow }) {
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
        title="Depositor"
        subtitle={copied === "id" ? "Copied" : "Copy the depositor's address"}
        onClick={() => copy("id", row.depositor)}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Check size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this deposit"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}${liquityV1DepositHref(row.depositor)}`)}
      />
    </>
  );
}

export function liquityV1DepositSlots({
  row,
  surface = "detail",
  lifetime,
  now,
  nowBlock,
  pending = false,
  pool,
  indexBehind = false,
  explanation,
}: LiquityV1DepositCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const closed = row.status === "closed";
  const name = positionName({ market: MARKET, noun: NOUN, id: row.depositor });
  // The pool and the depositor as the tag on both surfaces (ui-jobs 807).
  const tag = <ListingTag market={MARKET} id={row.depositor} />;
  const counters = {
    lastActivityAt: Number(row.last_timestamp),
    eventCount: Number(row.tx_count),
    liquidationCount: null,
    ...(detail ? { order: "age-last" as const } : {}),
  };
  const status = closed ? { word: "Closed", tone: "muted" as const } : null;

  if (!detail) {
    const recorded = big(row.deposit_raw);
    // The wallet page hands the head read: the deposit now and the ETH it is
    // owed. A listing states the last touch's figure.
    const shown = listingDeposit(row.deposit_raw, closed ? null : now);
    const head = shown.at === "head" ? now! : null;
    const wallet = nowBlock != null ? { block: nowBlock } : undefined;
    const heads: PositionCardHead[] = [
      head
        ? {
            id: "deposit",
            label: "Deposit now",
            value: (
              <Prov info={spLiveProv("compounded", wallet)}>
                <RawFigure raw={shown.raw} symbol="LUSD" />
              </Prov>
            ),
            assets: tokenIcon("LUSD", head.now),
          }
        : {
            id: "deposit",
            label: "Deposit",
            labelTip: "As of the deposit's last touch. Liquidations since then have not been taken out.",
            labelTipOnListing: true,
            value: closed ? null : (
              <Prov info={spSumProv("recorded", "listing")}>
                <RawFigure raw={recorded} symbol="LUSD" approx />
              </Prov>
            ),
            assets: closed ? undefined : tokenIcon("LUSD", recorded),
          },
      ...(head
        ? [
            {
              id: "pending-eth",
              label: "Pending ETH",
              labelTip: PENDING_ETH_TIP,
              labelTipOnListing: true,
              value: (
                <Prov info={spLiveProv("ethGain", wallet)}>
                  <RawFigure raw={head.pendingEth} symbol="ETH" />
                </Prov>
              ),
              assets: tokenIcon("ETH", head.pendingEth),
            },
          ]
        : []),
      {
        id: "eth-paid",
        label: "ETH paid",
        value: (
          <Prov info={spSumProv("ethGain", "listing")}>
            <RawFigure raw={big(row.eth_gain_raw)} symbol="ETH" />
          </Prov>
        ),
        assets: tokenIcon("ETH", big(row.eth_gain_raw)),
      },
      {
        id: "lqty-paid",
        label: "LQTY paid",
        value: (
          <Prov info={spSumProv("lqtyGain", "listing")}>
            <RawFigure raw={big(row.lqty_gain_raw)} symbol="LQTY" />
          </Prov>
        ),
        assets: tokenIcon("LQTY", big(row.lqty_gain_raw)),
      },
    ];
    return {
      surface: "listing",
      status,
      heads,
      identity: (
        <WalletPill wallet={row.depositor} ensName={null} href={`${LIQUITY_V1_SP_PATH}?q=${row.depositor}`} bookmark />
      ),
      counters,
      name,
      menu: null,
      tag,
    };
  }

  const menu = { leading: () => <DepositMenuRows row={row} />, noun: "deposit", exports: null };
  const explainer = { body: explanation ?? null };

  const paidHeads = (l: DepositLifetime | null | undefined): PositionCardHead[] => [
    {
      id: "eth-paid",
      label: "ETH paid",
      labelIcon: tokenIcon("ETH", l?.ethGain ?? ZERO, 16),
      value: l ? (
        <Prov info={spSumProv("ethGain")}>
          <span className="text-rb-500">
            <RawFigure raw={l.ethGain} symbol="ETH" />
          </span>
        </Prov>
      ) : null,
    },
    {
      id: "lqty-paid",
      label: "LQTY paid",
      labelIcon: tokenIcon("LQTY", l?.lqtyGain ?? ZERO, 16),
      value: l ? (
        <Prov info={spSumProv("lqtyGain")}>
          <span className="text-rb-500">
            <RawFigure raw={l.lqtyGain} symbol="LQTY" />
          </span>
        </Prov>
      ) : null,
    },
  ];

  if (closed) {
    // Two peaks beside the Outcome: what the deposit was paid. What went in
    // and out of it is the panel beneath.
    const l = lifetime;
    const sumRow = (id: "deposited" | "withdrawn" | "burned", label: string, tip: string): PositionPanelRow[] =>
      l
        ? [
            {
              id,
              label,
              tip,
              asset: { symbol: "LUSD", address: V1_SP_TOKENS.LUSD },
              value: (
                <Prov info={spSumProv(id)}>
                  <RawFigure raw={l[id]} symbol="LUSD" />
                </Prov>
              ),
            },
          ]
        : [];
    return {
      surface: "detail",
      status,
      heads: paidHeads(l),
      tag,
      counters,
      name,
      explainer,
      learnMore: null,
      menu,
      panel: [
        [
          ...sumRow("deposited", "Deposited", "The LUSD the deposit's touches put in."),
          ...sumRow("withdrawn", "Withdrawn", "The LUSD the deposit's touches took out."),
        ],
        sumRow(
          "burned",
          "Burned by liquidations",
          "The LUSD liquidations used from the deposit, in exchange for the ETH it was paid.",
        ),
      ],
      outcome: { word: "Closed", dates: [{ at: Number(row.last_timestamp) }] },
    };
  }

  const heads: PositionCardHead[] = [
    {
      id: "deposit-now",
      label: "Deposit now",
      value: now ? (
        <Prov info={spLiveProv("compounded")}>
          <RawFigure raw={now.now} symbol="LUSD" />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? tokenIcon("LUSD", now.now) : undefined,
    },
    {
      id: "pending-eth",
      label: "Pending ETH",
      labelTip: PENDING_ETH_TIP,
      value: now ? (
        <Prov info={spLiveProv("ethGain")}>
          <RawFigure raw={now.pendingEth} symbol="ETH" />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? tokenIcon("ETH", now.pendingEth) : undefined,
    },
    {
      id: "pending-lqty",
      label: "Pending LQTY",
      labelTip:
        "The LQTY issued to the deposit since its last touch, the front end's share taken out. The next touch pays it, with the issuance that touch triggers.",
      value: now ? (
        <Prov info={spLiveProv("lqtyGain")}>
          <RawFigure raw={now.pendingLqty} symbol="LQTY" />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? tokenIcon("LQTY", now.pendingLqty) : undefined,
    },
  ];

  const left: PositionPanelRow[] = [];
  const right: PositionPanelRow[] = [];
  if (lifetime) {
    // Where the chain has seen a touch the index has not read, the recorded
    // deposit would not add up with the chain's figures: one line says so.
    left.push(
      indexBehind
        ? { id: "index-behind", label: "At the last touch", value: null, unavailable: INDEX_BEHIND }
        : {
            id: "recorded",
            label: "At the last touch",
            tip: "The LUSD the deposit held after its last touch.",
            asset: { symbol: "LUSD", address: V1_SP_TOKENS.LUSD },
            value: (
              <Prov info={spSumProv("recorded")}>
                <RawFigure raw={lifetime.recorded} symbol="LUSD" />
              </Prov>
            ),
          },
    );
    left.push({
      id: "eth-paid",
      label: "ETH paid",
      tip: "The ETH the deposit's touches have paid out.",
      asset: { symbol: "ETH", address: V1_SP_TOKENS.ETH },
      value: (
        <Prov info={spSumProv("ethGain")}>
          <RawFigure raw={lifetime.ethGain} symbol="ETH" />
        </Prov>
      ),
    });
    left.push({
      id: "lqty-paid",
      label: "LQTY paid",
      tip: "The LQTY the deposit's touches have paid the depositor.",
      asset: { symbol: "LQTY", address: V1_SP_TOKENS.LQTY },
      value: (
        <Prov info={spSumProv("lqtyGain")}>
          <RawFigure raw={lifetime.lqtyGain} symbol="LQTY" />
        </Prov>
      ),
    });
  }
  // A deposit of 0 has no share; one too small to print reads as the floor.
  const share = now && pool && now.now > ZERO ? poolShare(now.now, pool.totalRaw) : null;
  if (now && pool && share != null)
    right.push({
      id: "pool-share",
      label: "Share of the pool",
      tip: "The deposit's part of all the LUSD in the Stability Pool. The deposit burns this share of the LUSD the pool spends on each liquidation and receives this share of the ETH paid for it.",
      value: (
        <Prov info={spPoolShareProv(exactUnits(now.now), exactUnits(pool.totalRaw), pool.block)}>
          {share > 0 ? pctText(share) : `${TINY_AMOUNT_FLOOR_TEXT}%`}
        </Prov>
      ),
    });
  if (now)
    right.push({
      id: "burned-since",
      label: "Burned since last touch",
      tip: "LUSD liquidations have used from the deposit since its last touch, in exchange for the ETH pending. The next touch writes it.",
      asset: { symbol: "LUSD", address: V1_SP_TOKENS.LUSD },
      value: (
        <Prov info={spPendingLossProv()}>
          <RawFigure raw={now.pendingLoss} symbol="LUSD" />
        </Prov>
      ),
    });
  right.push({
    id: "front-end",
    label: "Front end",
    tip: "The front end the deposit was opened through. It takes its kickback share of the deposit's LQTY; an untagged deposit keeps all of it.",
    value: (
      <Prov info={spSumProv("frontEnd")}>
        {isTagged(row.front_end) ? <LinkedAddress address={row.front_end} /> : <span>None</span>}
      </Prov>
    ),
  });

  return {
    surface: "detail",
    status,
    heads,
    tag,
    counters,
    name,
    explainer,
    learnMore: null,
    menu,
    panel: [left, right],
  };
}

export function LiquityV1DepositCard(props: LiquityV1DepositCardProps) {
  return <PositionCard slots={liquityV1DepositSlots(props)} />;
}

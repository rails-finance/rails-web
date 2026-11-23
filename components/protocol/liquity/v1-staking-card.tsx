"use client";

// A Liquity V1 LQTY stake on the shared position card, as the stability-pool
// deposit draws one (v1-sp-deposit-card.tsx): one staker, one LQTYStaking.
//
// The stake moves only at the staker's touches, so every surface states
// it exact. On its page the other headlines are LQTYStaking's getters at
// head: the LUSD and ETH fees the next touch pays out (getPendingLUSDGain,
// getPendingETHGain). A listing row states the fees paid at touches; on the
// wallet page, which hands the head read, the fees pending.

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
import { positionName } from "@/lib/shared/position-name";
import { liquityV1StakeHref, LIQUITY_V1_STAKING_PATH } from "@/lib/liquity-v1/staking-routes";
import { big, exactUnits, stakeShare, type StakeLifetime, type StakeNow } from "@/lib/liquity-v1/staking-math";
import { stLiveProv, stShareProv, stSumProv } from "@/lib/liquity-v1/staking-provenance";
import { pctText } from "@/lib/shared/vault-amount-text";
import { TINY_AMOUNT_FLOOR_TEXT } from "@/lib/utils/format";
import type { LiquityV1StakeRow } from "@/lib/sources/api/liquity-v1-staking";
import { RawFigure, tokenIcon, V1_SP_TOKENS } from "./v1-sp-parts";
import { positionLink } from "@/lib/shared/position-link";

const NOUN = "LQTY stake";
const MARKET = "Staking";
const ZERO = BigInt(0);
/** Where the chain has seen a touch the index has not read. */
const INDEX_BEHIND = "the index has not yet read the newest touch";
const PENDING_LUSD_TIP =
  "The stake's share of the borrowing fees paid in since its last touch. The next touch pays it out.";
const PENDING_ETH_TIP =
  "The stake's share of the redemption fees paid in since its last touch. The next touch pays it out.";

export interface LiquityV1StakeCardProps {
  row: LiquityV1StakeRow;
  surface?: "listing" | "detail";
  lifetime?: StakeLifetime | null;
  /** The chain read at head. On a listing surface (the wallet page), the
   *  headlines state it in place of the fees paid. */
  now?: StakeNow | null;
  /** The block the wallet page read `now` at, for its receipts. */
  nowBlock?: number;
  /** The chain read is in flight. */
  pending?: boolean;
  /** totalLQTYStaked() and the block of the read `now` came from. */
  pool?: { totalRaw: bigint; block: number } | null;
  /** The chain's stakes(staker) differs from the index's stake: the chain has
   *  seen a touch the index has not read yet. */
  indexBehind?: boolean;
  explanation?: ReactNode;
}

function StakeMenuRows({ row }: { row: LiquityV1StakeRow }) {
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
        title="Staker"
        subtitle={copied === "id" ? "Copied" : "Copy the staker's address"}
        onClick={() => copy("id", row.staker)}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Check size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this stake"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", positionLink(liquityV1StakeHref(row.staker)))}
      />
    </>
  );
}

export function liquityV1StakeSlots({
  row,
  surface = "detail",
  lifetime,
  now,
  nowBlock,
  pending = false,
  pool,
  indexBehind = false,
  explanation,
}: LiquityV1StakeCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const closed = row.status === "closed";
  const name = positionName({ market: MARKET, noun: NOUN, id: row.staker });
  // Staking and the staker as the tag on both surfaces (ui-jobs 807).
  const tag = <ListingTag market={MARKET} id={row.staker} />;
  const counters = {
    lastActivityAt: Number(row.last_timestamp),
    eventCount: Number(row.tx_count),
    liquidationCount: null,
    ...(detail ? { order: "age-last" as const } : {}),
  };
  const status = closed ? { word: "Closed", tone: "muted" as const } : null;

  if (!detail) {
    const stake = big(row.stake_raw);
    // The wallet page hands the head read: the stake and the fees pending.
    const head = closed ? null : (now ?? null);
    const wallet = nowBlock != null ? { block: nowBlock } : undefined;
    const lusdPaid = big(row.lusd_gain_raw);
    const ethPaid = big(row.eth_gain_raw);
    const heads: PositionCardHead[] = [
      {
        id: "stake",
        label: "Stake",
        value: closed ? null : head ? (
          <Prov info={stLiveProv("stake", wallet)}>
            <RawFigure raw={head.stake} symbol="LQTY" />
          </Prov>
        ) : (
          <Prov info={stSumProv("stake", "listing")}>
            <RawFigure raw={stake} symbol="LQTY" />
          </Prov>
        ),
        assets: closed ? undefined : tokenIcon("LQTY", head ? head.stake : stake),
      },
      ...(head
        ? [
            {
              id: "pending-lusd",
              label: "Pending LUSD",
              labelTip: PENDING_LUSD_TIP,
              labelTipOnListing: true,
              value: (
                <Prov info={stLiveProv("lusdGain", wallet)}>
                  <RawFigure raw={head.pendingLusd} symbol="LUSD" />
                </Prov>
              ),
              assets: tokenIcon("LUSD", head.pendingLusd),
            },
            {
              id: "pending-eth",
              label: "Pending ETH",
              labelTip: PENDING_ETH_TIP,
              labelTipOnListing: true,
              value: (
                <Prov info={stLiveProv("ethGain", wallet)}>
                  <RawFigure raw={head.pendingEth} symbol="ETH" />
                </Prov>
              ),
              assets: tokenIcon("ETH", head.pendingEth),
            },
          ]
        : [
            {
              id: "lusd-paid",
              label: "LUSD paid",
              value: (
                <Prov info={stSumProv("lusdGain", "listing")}>
                  <RawFigure raw={lusdPaid} symbol="LUSD" />
                </Prov>
              ),
              assets: tokenIcon("LUSD", lusdPaid),
            },
            {
              id: "eth-paid",
              label: "ETH paid",
              value: (
                <Prov info={stSumProv("ethGain", "listing")}>
                  <RawFigure raw={ethPaid} symbol="ETH" />
                </Prov>
              ),
              assets: tokenIcon("ETH", ethPaid),
            },
          ]),
    ];
    return {
      surface: "listing",
      status,
      heads,
      identity: (
        <WalletPill wallet={row.staker} ensName={null} href={`${LIQUITY_V1_STAKING_PATH}?q=${row.staker}`} bookmark />
      ),
      counters,
      name,
      menu: null,
      tag,
    };
  }

  const menu = { leading: () => <StakeMenuRows row={row} />, noun: "stake", exports: null };
  const explainer = { body: explanation ?? null };

  const paidRows = (l: StakeLifetime): PositionPanelRow[] => [
    {
      id: "lusd-paid",
      label: "LUSD paid",
      tip: "The borrowing fees the stake's touches have paid out.",
      asset: { symbol: "LUSD", address: V1_SP_TOKENS.LUSD },
      value: (
        <Prov info={stSumProv("lusdGain")}>
          <RawFigure raw={l.lusdGain} symbol="LUSD" />
        </Prov>
      ),
    },
    {
      id: "eth-paid",
      label: "ETH paid",
      tip: "The redemption fees the stake's touches have paid out.",
      asset: { symbol: "ETH", address: V1_SP_TOKENS.ETH },
      value: (
        <Prov info={stSumProv("ethGain")}>
          <RawFigure raw={l.ethGain} symbol="ETH" />
        </Prov>
      ),
    },
  ];
  const movedRows = (l: StakeLifetime): PositionPanelRow[] => [
    {
      id: "staked",
      label: "Staked",
      tip: "The LQTY the stake's touches put in.",
      asset: { symbol: "LQTY", address: V1_SP_TOKENS.LQTY },
      value: (
        <Prov info={stSumProv("staked")}>
          <RawFigure raw={l.staked} symbol="LQTY" />
        </Prov>
      ),
    },
    {
      id: "unstaked",
      label: "Unstaked",
      tip: "The LQTY the stake's touches took out.",
      asset: { symbol: "LQTY", address: V1_SP_TOKENS.LQTY },
      value: (
        <Prov info={stSumProv("unstaked")}>
          <RawFigure raw={l.unstaked} symbol="LQTY" />
        </Prov>
      ),
    },
  ];

  if (closed) {
    // What the stake was paid as the headlines; what went in and out of it is
    // the panel beneath.
    const l = lifetime;
    const paidHeads: PositionCardHead[] = [
      {
        id: "lusd-paid",
        label: "LUSD paid",
        labelIcon: tokenIcon("LUSD", l?.lusdGain ?? ZERO, 16),
        value: l ? (
          <Prov info={stSumProv("lusdGain")}>
            <span className="text-rb-500">
              <RawFigure raw={l.lusdGain} symbol="LUSD" />
            </span>
          </Prov>
        ) : null,
      },
      {
        id: "eth-paid",
        label: "ETH paid",
        labelIcon: tokenIcon("ETH", l?.ethGain ?? ZERO, 16),
        value: l ? (
          <Prov info={stSumProv("ethGain")}>
            <span className="text-rb-500">
              <RawFigure raw={l.ethGain} symbol="ETH" />
            </span>
          </Prov>
        ) : null,
      },
    ];
    return {
      surface: "detail",
      status,
      heads: paidHeads,
      tag,
      counters,
      name,
      explainer,
      learnMore: null,
      menu,
      panel: l ? [[movedRows(l)[0]], [movedRows(l)[1]]] : undefined,
      outcome: { word: "Closed", dates: [{ at: Number(row.last_timestamp) }] },
    };
  }

  const heads: PositionCardHead[] = [
    {
      id: "stake",
      label: "Stake",
      value: now ? (
        <Prov info={stLiveProv("stake")}>
          <RawFigure raw={now.stake} symbol="LQTY" />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? tokenIcon("LQTY", now.stake) : undefined,
    },
    {
      id: "pending-lusd",
      label: "Pending LUSD",
      labelTip: PENDING_LUSD_TIP,
      value: now ? (
        <Prov info={stLiveProv("lusdGain")}>
          <RawFigure raw={now.pendingLusd} symbol="LUSD" />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? tokenIcon("LUSD", now.pendingLusd) : undefined,
    },
    {
      id: "pending-eth",
      label: "Pending ETH",
      labelTip: PENDING_ETH_TIP,
      value: now ? (
        <Prov info={stLiveProv("ethGain")}>
          <RawFigure raw={now.pendingEth} symbol="ETH" />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? tokenIcon("ETH", now.pendingEth) : undefined,
    },
  ];

  const left: PositionPanelRow[] = lifetime ? movedRows(lifetime) : [];
  const right: PositionPanelRow[] = lifetime ? paidRows(lifetime) : [];
  if (indexBehind)
    left.unshift({ id: "index-behind", label: "At the last touch", value: null, unavailable: INDEX_BEHIND });
  // A stake of 0 has no share; one too small to print reads as the floor.
  const share = now && pool && now.stake > ZERO ? stakeShare(now.stake, pool.totalRaw) : null;
  if (now && pool && share != null)
    right.push({
      id: "stake-share",
      label: "Share of the staked LQTY",
      tip: "The stake's part of all the LQTY staked, and its share of every borrowing and redemption fee paid in.",
      value: (
        <Prov info={stShareProv(exactUnits(now.stake), exactUnits(pool.totalRaw), pool.block)}>
          {share > 0 ? pctText(share) : `${TINY_AMOUNT_FLOOR_TEXT}%`}
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

export function LiquityV1StakeCard(props: LiquityV1StakeCardProps) {
  return <PositionCard slots={liquityV1StakeSlots(props)} />;
}

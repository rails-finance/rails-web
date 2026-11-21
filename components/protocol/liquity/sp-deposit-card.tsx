"use client";

// A Liquity V2 (or fork) stability-pool deposit on the shared position card: one
// (branch, depositor), as Polaris's deposit card draws one
// (components/protocol/polaris/polaris-deposit-card.tsx).
//
// On its page the headlines are the branch pool's getters at head: the
// deposit now (getCompoundedBoldDeposit), the collateral a claiming touch
// would send (getDepositorCollGain + stashedColl) and the BOLD yield it would
// pay (getDepositorYieldGainWithPending). A listing row states the index's
// figures: the deposit recorded at the last touch (≈, since liquidations burn
// it between touches), and the collateral and yield paid at touches.

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
import { sboldDepositorVault } from "@/lib/liquity-v2/sbold";
import { WalletPill } from "@/components/shared/wallet-pill";
import { ListingTag } from "@/components/shared/listing-tag";
import { PositionNameId } from "@/components/shared/position-name-id";
import { positionName } from "@/lib/shared/position-name";
import {
  LIQUITY_V2_SP,
  spDepositHref,
  spPoolOf,
  spWalletHref,
  type SpDeployment,
} from "@/lib/liquity-v2/sp-deployment";
import type { BranchShutdownState } from "@/lib/liquity-fork/shutdown";
import {
  big,
  exactUnits,
  listingDeposit,
  poolShare,
  type DepositLifetime,
  type DepositNow,
} from "@/lib/liquity-v2/sp-math";
import { spLiveProv, spPendingLossProv, spPoolShareProv, spSumProv } from "@/lib/liquity-v2/sp-provenance";
import { pctText } from "@/lib/shared/vault-amount-text";
import { TINY_AMOUNT_FLOOR_TEXT } from "@/lib/utils/format";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import { RawFigure, tokenIcon } from "./sp-parts";

const NOUN = "Deposit";
const ZERO = BigInt(0);
/** Where the chain has seen a touch the index has not read. */
const INDEX_BEHIND = "the index has not yet read the newest touch";

export interface LiquityV2DepositCardProps {
  row: LiquityV2DepositRow<string>;
  /** The deployment: Liquity V2, or a fork (lib/liquity-v2/sp-deployment.ts). */
  dep?: SpDeployment;
  /** The branch's shutdown (ui-jobs 612): an open deposit reads "Shut down". */
  shutdown?: BranchShutdownState | null;
  surface?: "listing" | "detail";
  lifetime?: DepositLifetime | null;
  /** The chain read at head. */
  /** The chain read at head. On a listing surface (the wallet page), the
   *  Deposit now headline states it in place of the last touch's figure. */
  now?: DepositNow | null;
  /** The block the wallet page read `now` at, for its receipts. */
  nowBlock?: number;
  /** The chain read is in flight. */
  pending?: boolean;
  /** The pool's getTotalBoldDeposits() and the block of the read `now` came from. */
  pool?: { totalRaw: bigint; block: number } | null;
  /** The chain's deposits() or stashedColl() differs from the index's: the
   *  chain has seen a touch the index has not read yet. */
  indexBehind?: boolean;
  explanation?: ReactNode;
}

function DepositMenuRows({ row, dep }: { row: LiquityV2DepositRow<string>; dep: SpDeployment }) {
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
        onClick={() =>
          copy("link", `${window.location.origin}${spDepositHref(dep, row.collateral_type, row.depositor)}`)
        }
      />
    </>
  );
}

const pendingCollTip = (b: string) =>
  `What a claiming touch sends the depositor in ${b}: the ${b} liquidations have paid the deposit since its last touch, and what earlier touches stashed.`;

export function liquityV2DepositSlots({
  row,
  dep = LIQUITY_V2_SP,
  shutdown = null,
  surface = "detail",
  lifetime,
  now,
  nowBlock,
  pending = false,
  pool,
  indexBehind = false,
  explanation,
}: LiquityV2DepositCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const b = row.collateral_type;
  const branch = spPoolOf(dep, b);
  const BOLD = dep.stable.symbol;
  const boldAddr = dep.stable.address;
  const icon = (symbol: string, address: string, raw: bigint, size?: number) =>
    tokenIcon(symbol, address, raw, size, dep.chainId);
  const closed = row.status === "closed";
  const name = positionName({ market: b, noun: NOUN, id: row.depositor });
  const counters = {
    lastActivityAt: Number(row.last_timestamp),
    eventCount: Number(row.tx_count),
    liquidationCount: null,
    ...(detail ? { order: "age-last" as const } : {}),
  };
  const status = closed
    ? { word: "Closed", tone: "muted" as const }
    : shutdown
      ? { word: "Shut down", tone: "caution" as const, anatomy: "C6.1" }
      : null;
  const stash = big(row.stash_raw);

  if (!detail) {
    const recorded = big(row.deposit_raw);
    // The wallet page hands the head read: the deposit now and the
    // collateral it is owed. A listing states the last touch's figure.
    const shown = listingDeposit(row.deposit_raw, closed ? null : now);
    const head = shown.at === "head" ? now! : null;
    const wallet = nowBlock != null ? { block: nowBlock } : undefined;
    const heads: PositionCardHead[] = [
      head
        ? {
            id: "deposit",
            label: "Deposit now",
            value: (
              <Prov info={spLiveProv("compounded", b, wallet, dep)}>
                <RawFigure raw={shown.raw} symbol={BOLD} />
              </Prov>
            ),
            assets: icon(BOLD, boldAddr, head.now),
          }
        : {
            id: "deposit",
            label: "Deposit",
            labelTip: "As of the deposit's last touch. Liquidations since then have not been taken out.",
            labelTipOnListing: true,
            value: closed ? null : (
              <Prov info={spSumProv("recorded", b, "listing", dep)}>
                <RawFigure raw={recorded} symbol={BOLD} approx />
              </Prov>
            ),
            assets: closed ? undefined : icon(BOLD, boldAddr, recorded),
          },
      ...(head
        ? [
            {
              id: "pending-coll",
              label: `Pending ${b}`,
              labelTip: pendingCollTip(b),
              labelTipOnListing: true,
              value: (
                <Prov info={spLiveProv("pendingColl", b, wallet, dep)}>
                  <RawFigure raw={head.pendingColl} symbol={b} />
                </Prov>
              ),
              assets: icon(b, branch.collateralAddr, head.pendingColl),
            },
          ]
        : []),
      {
        id: "coll-paid",
        label: `${b} paid in`,
        value: (
          <Prov info={spSumProv("collGain", b, "listing", dep)}>
            <RawFigure raw={big(row.coll_gain_raw)} symbol={b} />
          </Prov>
        ),
        assets: icon(b, branch.collateralAddr, big(row.coll_gain_raw)),
      },
      {
        id: "yield",
        label: `${BOLD} yield`,
        value: (
          <Prov info={spSumProv("yieldGain", b, "listing", dep)}>
            <RawFigure raw={big(row.yield_gain_raw)} symbol={BOLD} />
          </Prov>
        ),
        assets: icon(BOLD, boldAddr, big(row.yield_gain_raw)),
      },
    ];
    return {
      surface: "listing",
      status,
      heads,
      identity: (
        <WalletPill
          wallet={row.depositor}
          ensName={null}
          href={spWalletHref(dep, row.depositor)}
          vault={dep.id === "liquity-v2" ? sboldDepositorVault(row.depositor) : undefined}
          bookmark
        />
      ),
      counters,
      name,
      menu: null,
      tag: <ListingTag market={b} id={row.depositor} />,
    };
  }

  const identity = (
    <span className="flex items-center gap-2">
      <span className="text-xs text-rb-500">{b} Stability Pool</span>
      <PositionNameId name={name} />
    </span>
  );
  const menu = { leading: () => <DepositMenuRows row={row} dep={dep} />, noun: "deposit", exports: null };
  const explainer = { body: explanation ?? null };

  if (closed) {
    const l = lifetime;
    const heads: PositionCardHead[] = [
      {
        id: "deposited",
        label: "Deposited",
        labelIcon: icon(BOLD, boldAddr, l?.deposited ?? ZERO, 16),
        value: l ? (
          <Prov info={spSumProv("deposited", b, "detail", dep)}>
            <span className="text-rb-500">
              <RawFigure raw={l.deposited} symbol={BOLD} />
            </span>
          </Prov>
        ) : null,
      },
      {
        id: "coll-paid",
        label: `${b} paid in`,
        labelIcon: icon(b, branch.collateralAddr, l?.collGain ?? ZERO, 16),
        value: l ? (
          <Prov info={spSumProv("collGain", b, "detail", dep)}>
            <span className="text-rb-500">
              <RawFigure raw={l.collGain} symbol={b} />
            </span>
          </Prov>
        ) : null,
      },
    ];
    // A closed deposit can still hold a stash, which only a claim sends.
    if (l && stash > ZERO)
      heads.push({
        id: "stash",
        label: `${b} unclaimed`,
        labelTip: `${b} the deposit's touches stashed and no claim has sent yet.`,
        labelIcon: icon(b, branch.collateralAddr, stash, 16),
        value: (
          <Prov info={spSumProv("stash", b, "detail", dep)}>
            <RawFigure raw={stash} symbol={b} />
          </Prov>
        ),
      });
    return {
      surface: "detail",
      status,
      heads,
      identity,
      counters,
      name,
      explainer,
      learnMore: null,
      menu,
      outcome: { word: "Closed", dates: [{ at: Number(row.last_timestamp) }] },
    };
  }

  const heads: PositionCardHead[] = [
    {
      id: "deposit-now",
      label: "Deposit now",
      value: now ? (
        <Prov info={spLiveProv("compounded", b, undefined, dep)}>
          <RawFigure raw={now.now} symbol={BOLD} />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? icon(BOLD, boldAddr, now.now) : undefined,
    },
    {
      id: "pending-coll",
      label: `Pending ${b}`,
      labelTip: pendingCollTip(b),
      value: now ? (
        <Prov info={spLiveProv("pendingColl", b, undefined, dep)}>
          <RawFigure raw={now.pendingColl} symbol={b} />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? icon(b, branch.collateralAddr, now.pendingColl) : undefined,
    },
    {
      id: "pending-yield",
      label: `Pending ${BOLD} yield`,
      labelTip: "The yield the branch's interest has paid the deposit since its last touch. The next touch pays it.",
      value: now ? (
        <Prov info={spLiveProv("yieldGain", b, undefined, dep)}>
          <RawFigure raw={now.pendingYield} symbol={BOLD} />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? icon(BOLD, boldAddr, now.pendingYield) : undefined,
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
            tip: `The ${BOLD} the deposit held after its last touch.`,
            asset: { symbol: BOLD, address: boldAddr },
            value: (
              <Prov info={spSumProv("recorded", b, "detail", dep)}>
                <RawFigure raw={lifetime.recorded} symbol={BOLD} />
              </Prov>
            ),
          },
    );
    if (!indexBehind && lifetime.kept > ZERO)
      left.push({
        id: "yield-kept",
        label: "Yield kept",
        tip: `${BOLD} yield the touches did not claim. It joined the deposit.`,
        asset: { symbol: BOLD, address: boldAddr },
        value: (
          <Prov info={spSumProv("kept", b, "detail", dep)}>
            <RawFigure raw={lifetime.kept} symbol={BOLD} />
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
      tip: `The deposit's part of all the ${BOLD} in the ${b} Stability Pool. The deposit burns this share of the ${BOLD} the pool spends on each liquidation and receives this share of the ${b} paid for it.`,
      value: (
        <Prov info={spPoolShareProv(b, exactUnits(now.now), exactUnits(pool.totalRaw), pool.block, dep)}>
          {share > 0 ? pctText(share) : `${TINY_AMOUNT_FLOOR_TEXT}%`}
        </Prov>
      ),
    });
  if (now)
    right.push({
      id: "burned-since",
      label: "Burned since last touch",
      tip: `${BOLD} liquidations have used from the deposit since its last touch, in exchange for the ${b} pending. The next touch writes it.`,
      asset: { symbol: BOLD, address: boldAddr },
      value: (
        <Prov info={spPendingLossProv(b, dep)}>
          <RawFigure raw={now.pendingLoss} symbol={BOLD} />
        </Prov>
      ),
    });

  return {
    surface: "detail",
    status,
    heads,
    identity,
    counters,
    name,
    explainer,
    learnMore: null,
    menu,
    panel: [left, right],
  };
}

export function LiquityV2DepositCard(props: LiquityV2DepositCardProps) {
  return <PositionCard slots={liquityV2DepositSlots(props)} />;
}

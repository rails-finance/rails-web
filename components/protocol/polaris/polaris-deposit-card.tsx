"use client";

// A Polaris stability-pool deposit on the shared position card: one
// (market, token id) of the pool's deposit NFT (rails-ops
// TO-DO-stability-pool-deposits.md §2).
//
// On its page the headlines are the pool's getters at head: the deposit now
// (getCompoundedStableTokenDeposit), the pETH a touch would pay
// (getDepositorBcTokenGain + stashedBcTokens) and the stable gain it would
// pay (getDepositorStableTokenGainWithPending). A listing row states the index's
// figures: the deposit recorded at the last touch (≈, since liquidations burn
// it between touches), and the pETH and stable gain paid at touches.
//
// #2 of each market is held by the market's savings vault (sUSDp, sGOLDp),
// and the card says so (C22·polaris); the vault's share holders stay off the
// explorer (decision 0014).

import { useState, type ReactNode } from "react";
import { Check, Copy, Image as ImageIcon, Link2 } from "lucide-react";
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
import { HeadingTip } from "@/components/shared/tip-label";
import { positionName, shortPositionId } from "@/lib/shared/position-name";
import { PETH, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { polarisDepositHref, polarisDepositNftUrl, POLARIS_SP_PATH } from "@/lib/polaris/routes";
import { big, type DepositLifetime, type DepositNow } from "@/lib/polaris/sp-loan-math";
import {
  spLiveProv,
  spPendingLossProv,
  spRowProv,
  spSumProv,
  type PolarisRowVia,
} from "@/lib/polaris/sp-loan-provenance";
import type { PolarisDepositRow } from "@/lib/sources/api/polaris-sp-loans";
import { RawFigure, tokenIcon } from "./polaris-sp-loan-parts";
import { positionLink } from "@/lib/shared/position-link";

const NOUN = "Deposit";

export interface PolarisDepositCardProps {
  row: PolarisDepositRow;
  surface?: "listing" | "detail";
  lifetime?: DepositLifetime | null;
  /** The chain read laid over the index, where the two agree. */
  now?: DepositNow | null;
  /** The chain read is in flight. */
  pending?: boolean;
  explanation?: ReactNode;
  /** The wallet page: each listing figure carries its receipt, the row read
   *  through `via`. */
  receipts?: { via: PolarisRowVia };
}

/** The vault-held tag (C22·polaris). */
export function VaultHeldTag({ market }: { market: PolarisMarket }) {
  const vault = POLARIS_MARKET_CONFIG[market].vault;
  return (
    <span className="text-xs text-rb-500" data-anatomy="C22·polaris" data-vault-held={vault.address}>
      <HeadingTip
        text={`Held by the ${vault.symbol} vault`}
        tip={`The ${vault.symbol} savings vault deposits its holders' ${POLARIS_MARKET_CONFIG[market].stable.symbol} through this one position. Rails does not list the vault's holders.`}
      />
    </span>
  );
}

function DepositMenuRows({ row }: { row: PolarisDepositRow }) {
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
        title={`${NOUN} ${shortPositionId(row.token_id)}`}
        subtitle={copied === "id" ? "Copied" : "Copy the deposit number"}
        onClick={() => copy("id", row.token_id)}
      />
      <ToolsMenuItem
        icon={<ImageIcon size={16} />}
        title="Deposit NFT"
        subtitle="Open it on Etherscan"
        onClick={() => window.open(polarisDepositNftUrl(row.market, row.token_id), "_blank", "noopener")}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Check size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this deposit"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", positionLink(polarisDepositHref(row.market, row.token_id)))}
      />
    </>
  );
}

export function polarisDepositSlots({
  row,
  surface = "detail",
  lifetime,
  now,
  pending = false,
  explanation,
  receipts,
}: PolarisDepositCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const m = row.market;
  const stable = POLARIS_MARKET_CONFIG[m].stable;
  const s = stable.symbol;
  const closed = row.status === "closed";
  const name = positionName({ market: s, noun: NOUN, id: row.token_id });
  // The market and the deposit NFT as the tag on both surfaces (ui-jobs 807).
  const tag = <ListingTag market={s} id={row.token_id} />;
  const counters = {
    lastActivityAt: Number(row.last_timestamp),
    eventCount: row.tx_count,
    liquidationCount: null,
    ...(detail ? { order: "age-last" as const } : {}),
  };
  const status = closed ? { word: "Closed", tone: "muted" as const } : null;
  const vault = row.vault_held ? <VaultHeldTag market={m} /> : null;

  if (!detail) {
    const recorded = big(row.deposit_raw);
    const prov = (what: Parameters<typeof spRowProv>[0], figure: ReactNode) =>
      receipts ? <Prov info={spRowProv(what, m, receipts.via)}>{figure}</Prov> : figure;
    const heads: PositionCardHead[] = [
      {
        id: "deposit",
        label: "Deposit",
        labelTip: "As of the deposit's last touch. Liquidations since then have not been taken out.",
        labelTipOnListing: true,
        value: closed ? null : prov("recorded", <RawFigure raw={recorded} symbol={s} approx />),
        assets: closed ? undefined : tokenIcon(s, stable.address, recorded),
      },
      {
        id: "peth-paid",
        label: "pETH paid in",
        value: prov("bcGain", <RawFigure raw={big(row.bc_gain_raw)} symbol={PETH.symbol} />),
        assets: tokenIcon(PETH.symbol, PETH.address, big(row.bc_gain_raw)),
      },
      {
        id: "stable-gain",
        label: `${s} gain`,
        value: prov("stableGain", <RawFigure raw={big(row.stable_gain_raw)} symbol={s} />),
        assets: tokenIcon(s, stable.address, big(row.stable_gain_raw)),
      },
    ];
    return {
      surface: "listing",
      status,
      heads,
      identity:
        vault ??
        (row.holder ? (
          <WalletPill wallet={row.holder} ensName={null} href={`${POLARIS_SP_PATH}?q=${row.holder}`} bookmark />
        ) : null),
      counters,
      name,
      menu: null,
      tag,
    };
  }

  // The vault-held tag stays beside the market and ID.
  const identity = vault ?? undefined;
  const menu = { leading: () => <DepositMenuRows row={row} />, noun: "deposit", exports: null };
  const explainer = { body: explanation ?? null };

  if (closed) {
    const l = lifetime;
    return {
      surface: "detail",
      status,
      heads: [
        {
          id: "deposited",
          label: "Deposited",
          labelIcon: tokenIcon(s, stable.address, l?.deposited ?? BigInt(0), 16),
          value: l ? (
            <Prov info={spSumProv("deposited", m)}>
              <span className="text-rb-500">
                <RawFigure raw={l.deposited} symbol={s} />
              </span>
            </Prov>
          ) : null,
        },
        {
          id: "peth-paid",
          label: "pETH paid in",
          labelIcon: tokenIcon(PETH.symbol, PETH.address, l?.bcGain ?? BigInt(0), 16),
          value: l ? (
            <Prov info={spSumProv("bcGain", m)}>
              <span className="text-rb-500">
                <RawFigure raw={l.bcGain} symbol={PETH.symbol} />
              </span>
            </Prov>
          ) : null,
        },
      ],
      identity,
      tag,
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
        <Prov info={spLiveProv("compounded", m)}>
          <RawFigure raw={now.now} symbol={s} />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? tokenIcon(s, stable.address, now.now) : undefined,
    },
    {
      id: "pending-peth",
      label: "Pending pETH",
      labelTip:
        "What the next touch pays the deposit in pETH: the pETH liquidations have paid it since its last touch, and what earlier touches left unclaimed.",
      value: now ? (
        <Prov info={spLiveProv("pendingPeth", m)}>
          <RawFigure raw={now.pendingPeth} symbol={PETH.symbol} />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? tokenIcon(PETH.symbol, PETH.address, now.pendingPeth) : undefined,
    },
    {
      id: "pending-stable",
      label: `Pending ${s} gain`,
      labelTip: `The yield the deposit has earned since its last touch. The next touch pays it.`,
      value: now ? (
        <Prov info={spLiveProv("stableGain", m)}>
          <RawFigure raw={now.pendingStable} symbol={s} />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? tokenIcon(s, stable.address, now.pendingStable) : undefined,
    },
  ];

  const left: PositionPanelRow[] = [];
  const right: PositionPanelRow[] = [];
  if (lifetime) {
    left.push({
      id: "recorded",
      label: "At the last touch",
      tip: `The ${s} the deposit held after its last touch.`,
      asset: { symbol: s, address: stable.address },
      value: (
        <Prov info={spSumProv("recorded", m)}>
          <RawFigure raw={lifetime.recorded} symbol={s} />
        </Prov>
      ),
    });
    if (lifetime.kept > BigInt(0))
      left.push({
        id: "yield-kept",
        label: "Yield kept",
        tip: `${s} gain the touches did not claim. It stays in the deposit and compounds.`,
        asset: { symbol: s, address: stable.address },
        value: (
          <Prov info={spSumProv("kept", m)}>
            <RawFigure raw={lifetime.kept} symbol={s} />
          </Prov>
        ),
      });
  }
  if (now)
    right.push({
      id: "burned-since",
      label: "Burned since last touch",
      tip: `${s} liquidations have used from the deposit since its last touch, in exchange for the pETH pending. The next touch writes it.`,
      asset: { symbol: s, address: stable.address },
      value: (
        <Prov info={spPendingLossProv(m)}>
          <RawFigure raw={now.pendingLoss} symbol={s} />
        </Prov>
      ),
    });

  return {
    surface: "detail",
    status,
    heads,
    identity,
    tag,
    counters,
    name,
    explainer,
    learnMore: null,
    menu,
    panel: [left, right],
  };
}

export function PolarisDepositCard(props: PolarisDepositCardProps) {
  return <PositionCard slots={polarisDepositSlots(props)} />;
}

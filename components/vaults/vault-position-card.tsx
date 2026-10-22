"use client";

// One vault HOLDING as a listing card — the pair `(vault, holder)` — for the
// Aave vault layer on Ethereum and MetaMorpho on Base (Yearn has no census and
// no listing). The card is a slot builder (rails-ops TO-DO-position-card 322,
// 323, 324): `vaultCardSlots` turns the census row and the listing's live read
// into one `PositionCardSlots` object and the shared `PositionCard` draws it.
// The holder page draws components/vaults/vault-holding-card.tsx.
//
// Heads: Balance (the shares, with the census's USD beneath) and Share of the
// vault; a closed holding has one head, Closed by, and the Outcome column. The
// identity is the share symbol with the venue mark, the attested name or the
// shape word, and the wallet pill. Notice: the divergence between the census
// and the live read. Unread figures are said in words.

import type { ReactNode } from "react";
import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardHead, type PositionCardSlots } from "@/components/shared/position-card";
import { RevealTip } from "@/components/shared/reveal-tip";
import { WalletPill } from "@/components/shared/wallet-pill";
import { NotLoaded } from "@/components/shared/not-loaded";
import { BlockRef } from "@/components/shared/block-ref";
import { pctText, shortAddress } from "@/components/protocol/morpho-base/vault-exposure-parts";
import { AAVE_FAMILY_SINGULAR } from "@/components/vaults/aave-vault-format";
import { VaultVenueMark } from "@/components/vaults/vault-venue-mark";
import { formatUnitsExact, formatUsdValue } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { attestedAddress, attestedShortName } from "@/lib/shared/attested-addresses";
import {
  VAULT_SHAPE_WORD,
  usdText,
  vaultPositionFraction,
  vaultPositionIsDust,
  vaultPositionStatus,
  vaultPositionUsd,
  type VaultPositionFamily,
  type VaultPositionRow,
} from "@/lib/aave-vaults/vault-position";
import {
  aaveVaultCensusBalanceProv,
  aaveVaultHolderFractionProv,
  aaveVaultHolderSharesProv,
  aaveVaultPositionDivergenceProv,
  aaveVaultPositionSeenProv,
  aaveAttestedNameProv,
  aaveVaultPositionShapeProv,
  aaveVaultUnpricedProv,
  aaveVaultValueUsdProv,
  type AaveVaultCoords,
} from "@/lib/aave-vaults/vault-provenance";
import { AssetAmount } from "@/components/shared/asset-amount";

const n = (v: number) => v.toLocaleString("en-US");

/** The family word beside the share symbol: the mechanism the vault runs as,
 *  in the singular. MetaMorpho is the vault standard on Base; the curator is a
 *  name and stays off the card. */
const FAMILY_SINGULAR: Record<VaultPositionFamily, string> = {
  ...AAVE_FAMILY_SINGULAR,
  morpho: "MetaMorpho vault",
};

/** Which chain a row was censused on, and the routes that follow from it. */
const chainOf = (row: VaultPositionRow): ChainId => (row.chainId === BASE_CHAIN_ID ? BASE_CHAIN_ID : MAINNET_CHAIN_ID);

/** The words a card prints where nothing was read. */
const Unread = ({ what }: { what: string }) => <span className="text-base font-normal text-rb-500">{what}</span>;

/** A block, as a date and a number. With no timestamp the block number stands
 *  alone rather than a date being inferred from it. */
function BlockStamp({ block, at }: { block: number; at: number | null }) {
  return (
    <>
      {at != null ? `${formatDate(at)} · ` : ""}
      <BlockRef block={block} />
    </>
  );
}

/** A figure carrying its name for the verifiers, opening its full value on a
 *  click. */
function Figure({ name, tip, children }: { name?: string; tip?: string; children: ReactNode }) {
  return <span data-figure={name}>{tip ? <RevealTip tip={tip}>{children}</RevealTip> : children}</span>;
}

export interface VaultPositionCardProps {
  row: VaultPositionRow;
}

/** The vault card's slots for the shared position card. */
function vaultCardSlots({ row }: VaultPositionCardProps): PositionCardSlots {
  const status = vaultPositionStatus(row);
  const chainId = chainOf(row);
  const shareDecimals = row.shareDecimals ?? 18;
  const shareSymbol = row.symbol ?? shortAddress(row.vault);
  const assetSymbol = row.asset?.symbol ?? "the vault's asset";
  const fraction = vaultPositionFraction(row);
  const dust = vaultPositionIsDust(row);

  // Two coord sets in one: a receipt takes whichever block its figure was
  // read at, the live read's or the census's.
  const coords: AaveVaultCoords = {
    blockNumber: row.live?.blockNumber,
    censusBlock: row.census.block,
    chainId,
    vault: row.vault,
    vaultName: row.symbol ?? undefined,
    shareSymbol: row.symbol ?? undefined,
    assetSymbol: row.asset?.symbol,
    holder: row.holder,
  };

  // ── identity ─────────────────────────────────────────────────────────────
  // The vault leads, the way a Trove row leads with its collateral. On the
  // listing the row is a <Link>, so the symbol is plain text there.
  const attested = attestedAddress(row.holder);
  const shapeWord = row.census.shape ? VAULT_SHAPE_WORD[row.census.shape] : null;
  const codeSize = typeof row.census.shapeDetail?.codeSize === "number" ? row.census.shapeDetail.codeSize : null;
  // A published registry's name replaces the shape word: one mechanism phrase
  // in the space, and the name is the more useful of the two.
  const nameOrShape = attested ? (
    <Prov info={aaveAttestedNameProv(coords, attested)}>
      <span className="text-xs text-rb-500" data-attested-constant={attested.constant}>
        <span className="font-mono">{attestedShortName(attested)}</span> in Aave&rsquo;s address book
      </span>
    </Prov>
  ) : shapeWord ? (
    <Prov info={aaveVaultPositionShapeProv(coords, row.census.shape ?? "", codeSize)}>
      <span className="text-xs text-rb-500">{shapeWord}</span>
    </Prov>
  ) : null;
  const identity = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-sm font-semibold text-foreground" data-card-vault-symbol={shareSymbol}>
        <span>{shareSymbol}</span>
        <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-normal text-rb-500">
          <span>·</span>
          <VaultVenueMark family={row.family} />
          <span>{FAMILY_SINGULAR[row.family]}</span>
        </span>
      </span>
      {/* The listing names the holder; the toggle stops a click from reaching
          the row's <Link>, so bookmarking never navigates. */}
      <WalletPill wallet={row.holder} ensName={null} bookmark />
      {nameOrShape}
    </span>
  );

  // ── heads ────────────────────────────────────────────────────────────────
  // Balance: the shares with the share token's icon, the census's oracle USD
  // beneath in cents (the one-asset head, rails-ops ui-jobs 377). Where the
  // live read did not answer, the census's balance stands in and the sub says so.
  const usd = vaultPositionUsd(row);
  const priced = row.value.usdE8 != null && usd != null;
  const pricedBlock = row.value.pricedBlock ?? row.census.block;
  const censusShares = Number(row.census.balance) / 10 ** shareDecimals;
  const balanceHead: PositionCardHead = {
    id: "balance",
    label: "Balance",
    labelTip: row.live
      ? `The ${shareSymbol} this address holds: the vault's balanceOf() for it, read at the page's block. Beneath it, what the holding was worth at the census block, through the vault's convertToAssets and the chain's Aave V3 oracle.`
      : `The ${shareSymbol} this address held at the census block: the live read did not answer, so the census's balance stands in. Beneath it, what the holding was worth at the census block, through the vault's convertToAssets and the chain's Aave V3 oracle.`,
    value: (
      <Figure>
        <Prov info={row.live ? aaveVaultHolderSharesProv(coords) : aaveVaultCensusBalanceProv(coords)}>
          <AssetAmount
            value={row.live ? row.live.shares.value : censusShares}
            symbol={shareSymbol}
            address={row.vault}
            exact={formatUnitsExact(row.live ? row.live.shares.raw : row.census.balance, shareDecimals)}
          />
        </Prov>
      </Figure>
    ),
    usd: priced ? (
      <Figure tip={`${usdText(row.value.usdE8!)} at census block ${n(pricedBlock)}, via the chain's Aave V3 oracle`}>
        <Prov info={aaveVaultValueUsdProv(coords, row.value, shareDecimals)}>
          <span className="font-bold text-green-400">{formatUsdValue(usd)}</span>
        </Prov>
      </Figure>
    ) : (
      <Figure>
        <Prov info={aaveVaultUnpricedProv(coords, row.value)}>
          <Unread what="not priced" />
        </Prov>
      </Figure>
    ),
    sub: [
      priced
        ? `Aave V3 oracle at census block ${n(pricedBlock)}`
        : row.value.pricedBlock == null
          ? "the census has not priced this vault yet"
          : `the oracle declined ${row.value.assetSymbol ?? "the asset"}`,
    ].join(" · "),
  };
  const fractionHead: PositionCardHead = {
    id: "share-of-vault",
    label: "Share of the vault",
    labelTip: "This holding's shares over the vault's totalSupply(), both read at the page's block.",
    value: (
      <Figure>
        {dust ? (
          <Unread what="less than 0.0001%" />
        ) : fraction != null ? (
          <Prov info={aaveVaultHolderFractionProv(coords)}>{pctText(fraction)}</Prov>
        ) : (
          <NotLoaded className="text-base font-normal text-rb-500" />
        )}
      </Figure>
    ),
    sub: dust ? (
      <span className="tabular-nums">{row.live ? row.live.shares.raw : row.census.balance} wei of shares</span>
    ) : undefined,
  };
  const closedHead: PositionCardHead = {
    id: "closed-by",
    label: "Closed by",
    labelTip: "The block of this holding's last transfer, from the census.",
    value: (
      <Prov info={aaveVaultPositionSeenProv(coords, "last", row.census.lastBlock)}>
        <span className="text-base font-normal">
          <BlockStamp block={row.census.lastBlock} at={row.lastActivityAt} />
        </span>
      </Prov>
    ),
    sub: `nothing is held at ${status.at === row.census.block ? "the census block" : `block ${n(status.at)}`}`,
  };

  const common = {
    status: status.live ? null : { word: "Closed", tone: "muted" as const },
    heads: status.live ? [balanceHead, fractionHead] : [closedHead],
    identity,
    notice: status.divergent ? (
      <p className="mb-3 max-w-3xl text-xs leading-relaxed text-rb-500" data-card-divergence>
        <Prov info={aaveVaultPositionDivergenceProv(coords)}>
          <span>
            {row.census.live
              ? `Held at block ${n(row.census.block)}, closed by block ${n(row.live?.blockNumber ?? row.census.block)}`
              : `Held nothing at block ${n(row.census.block)}, holding shares again at block ${n(row.live?.blockNumber ?? row.census.block)}`}
          </span>
        </Prov>
        . Both are readings of <code>balanceOf()</code>, each at its block.
      </p>
    ) : undefined,
    counters: {
      lastActivityAt: row.lastActivityAt,
      eventCount: row.census.transferCount,
      eventCountNoun: "transfer",
    },
    outcome: status.live ? undefined : { word: "Closed" },
  };
  return { ...common, surface: "listing", menu: null };
}

/** The vault position card: its slots, drawn by the shared card, inside the
 *  wrapper the verifiers read. */
export function VaultPositionCard(props: VaultPositionCardProps) {
  const { row } = props;
  const status = vaultPositionStatus(row);
  return (
    <div
      data-position-card={`${row.vault}:${row.holder}`}
      data-vault={row.vault}
      data-holder={row.holder}
      data-status={status.live ? "live" : "closed"}
      data-shares-raw={row.live?.shares.raw ?? ""}
      data-claim-raw={row.live?.claim?.raw ?? ""}
      data-total-supply-raw={row.live?.totalSupply?.raw ?? ""}
      data-census-balance-raw={row.census.balance}
      data-census-block={row.census.block}
      data-live-block={row.live?.blockNumber ?? ""}
      data-transfer-count={row.census.transferCount}
      data-first-block={row.census.firstBlock}
      data-last-block={row.census.lastBlock}
      data-shape={row.census.shape ?? ""}
      data-value-usd-e8={row.value.usdE8 ?? ""}
      data-priced-block={row.value.pricedBlock ?? ""}
      data-share-ppm={row.census.sharePpm ?? ""}
    >
      <PositionCard slots={vaultCardSlots(props)} />
    </div>
  );
}

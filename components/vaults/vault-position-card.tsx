"use client";

// One vault POSITION as a card — the pair `(vault, holder)` — for the Aave
// vault layer on Ethereum and MetaMorpho on Base (Yearn has no census and draws
// no card). The card is a slot builder (rails-ops TO-DO-position-card 322,
// 323): `vaultCardSlots` turns the census row and the page's live read into one
// `PositionCardSlots` object and the shared `PositionCard` draws it, on the
// listing and on the position page.
//
// THREE LANES, KEPT APART. Shares, claim, share of the vault and what is
// redeemable are read LIVE at the page's block; transfers, first seen, last
// activity and what the address is come from the daily census at the census
// block; the USD line is the census's figure at its priced block (mig 206),
// through the vault's convertToAssets and the chain's Aave V3 oracle. Each
// figure carries its receipt, and the panel names both blocks.
//
// THE SLOTS. Heads: Balance (the shares, with the census's USD beneath) and
// Share of the vault. The panel (detail only): Claim on the left; the page's
// reads (Redeemable now, Exit, Cooldown) and the two blocks on the right. A closed card has one head,
// Closed by, and the Outcome column. Identity: the share symbol with the venue
// mark, then the attested name or the shape word; the listing adds the wallet
// pill, which the position page carries in its wallet row. Notice: the
// divergence between the census and the live read. Foot: First seen and the
// explorer link.
//
// UNREAD FIGURES ARE SAID IN WORDS ("not priced", "Not loaded"), never a zero
// or a dash; where the live read did not answer, the shares fall back to the
// census's balance and say so.
//
// THE WRAPPER. The verifiers read the card by `[data-position-card]` and its
// `data-*` attributes, and on the position page by its
// `closest("[data-skel-section='detail-card']")`, so the wrapper `div` stands
// around the shell and carries that section name on the detail surface.

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { Prov } from "@/components/shared/provenance";
import {
  PositionCard,
  type PositionCardHead,
  type PositionCardSlots,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { RevealTip } from "@/components/shared/reveal-tip";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { WalletPill } from "@/components/shared/wallet-pill";
import { NotLoaded } from "@/components/shared/not-loaded";
import { BlockRef } from "@/components/shared/block-ref";
import { pctText, shortAddress } from "@/components/protocol/morpho-base/vault-exposure-parts";
import { AAVE_FAMILY_SINGULAR } from "@/components/vaults/aave-vault-format";
import { VaultVenueMark } from "@/components/vaults/vault-venue-mark";
import { vaultContextRows, type VaultContextStripProps } from "@/components/vaults/vault-context-strip";
import { formatUnitsExact, formatUsdValue } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { explorerUrl, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { baseVaultHref, ethereumVaultHref } from "@/lib/vaults/routes";
import type { BookmarkScope } from "@/lib/shared/sessions";
import { holderListingSegment } from "@/lib/shared/protocols";
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
  aaveVaultHolderClaimProv,
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
import { formatCompact } from "@/lib/shared/format-compact";
import { AssetAmount } from "@/components/shared/asset-amount";
import { PanelFigure } from "@/components/shared/position-card-panel";

const n = (v: number) => v.toLocaleString("en-US");

/** The family word beside the share symbol: the mechanism the vault runs as,
 *  in the singular. MetaMorpho is the vault standard on Base; the curator is a
 *  name and stays off the card. */
const FAMILY_SINGULAR: Record<VaultPositionFamily, string> = {
  ...AAVE_FAMILY_SINGULAR,
  morpho: "MetaMorpho vault",
};

/** Where a listing row's holder is bookmarked: the explorer whose factory
 *  deployed the vault (rails-ops decision 0028). The position page passes the
 *  same scope to its wallet row. */
export const FAMILY_BOOKMARK_SCOPE: Record<VaultPositionFamily, BookmarkScope> = {
  morpho: "morpho-base",
  sgho: "aave-vaults",
  stata: "aave-vaults",
  "umbrella-stake": "aave-vaults",
};

/** Which chain a row was censused on, and the routes that follow from it. */
const chainOf = (row: VaultPositionRow): ChainId => (row.chainId === BASE_CHAIN_ID ? BASE_CHAIN_ID : MAINNET_CHAIN_ID);
const vaultHref = (row: VaultPositionRow, holder?: string) =>
  chainOf(row) === BASE_CHAIN_ID ? baseVaultHref(row.vault, holder) : ethereumVaultHref(row.vault, holder);

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

/** The card ⋮'s identity row: the link to this position's page. */
function VaultMenuRows({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ToolsMenuItem
      icon={copied ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
      title="Link to this position"
      subtitle={copied ? "Copied" : "Copy the page's address"}
      onClick={() =>
        void navigator.clipboard.writeText(`${window.location.origin}${href}`).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    />
  );
}

export interface VaultPositionCardProps {
  row: VaultPositionRow;
  /** The position page's card: receipts, the panel, the (i), the ⋮. */
  receipts?: boolean;
  /** The (i) pane's "?": what a vault position is and what each figure reads. */
  learnMore?: LearnMoreContent | null;
  /** The page's live reads for the panel's right column, above the two
   *  blocks: Redeemable now, Exit and, on a stake token, Cooldown. */
  context?: VaultContextStripProps;
  /** The (i) pane's prose. */
  explanation?: ReactNode;
}

/** The vault card's slots for the shared position card. */
export function vaultCardSlots({
  row,
  receipts = false,
  learnMore,
  context,
  explanation,
}: VaultPositionCardProps): PositionCardSlots {
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
  // The detail card names its figures for the verifiers; twenty listing rows
  // would make twenty of each name.
  const figureName = (name: string) => (receipts ? name : undefined);

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
        {receipts ? (
          <Link href={vaultHref(row)} className="hover:underline" prefetch={false}>
            {shareSymbol}
          </Link>
        ) : (
          <span>{shareSymbol}</span>
        )}
        <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-normal text-rb-500">
          <span>·</span>
          <VaultVenueMark family={row.family} />
          <span>{FAMILY_SINGULAR[row.family]}</span>
        </span>
      </span>
      {/* The listing names the holder; the toggle stops a click from reaching
          the row's <Link>, so bookmarking never navigates. */}
      {!receipts && (
        <WalletPill
          wallet={row.holder}
          ensName={null}
          bookmarkProtocol={FAMILY_BOOKMARK_SCOPE[row.family]}
          bookmarkListing={holderListingSegment(FAMILY_BOOKMARK_SCOPE[row.family])}
        />
      )}
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
      <Figure name={figureName("holder-shares")}>
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
      <Figure
        name={figureName("holder-value-usd")}
        tip={`${usdText(row.value.usdE8!)} at census block ${n(pricedBlock)}, via the chain's Aave V3 oracle`}
      >
        <Prov info={aaveVaultValueUsdProv(coords, row.value, shareDecimals)}>
          <span className="font-bold text-green-400">{formatUsdValue(usd)}</span>
        </Prov>
      </Figure>
    ) : (
      <Figure name={figureName("holder-value-usd")}>
        <Prov info={aaveVaultUnpricedProv(coords, row.value)}>
          <Unread what="not priced" />
        </Prov>
      </Figure>
    ),
    sub: [
      ...(row.live || !receipts ? [] : [`shares from the census at block ${n(row.census.block)}`]),
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
      <Figure name={figureName("holder-fraction")}>
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
      ...(receipts ? { order: "age-last" as const } : {}),
    },
    outcome: status.live ? undefined : { word: "Closed" },
  };
  if (!receipts) return { ...common, surface: "listing", menu: null };

  // ── the detail card ──────────────────────────────────────────────────────
  const detail = {
    ...common,
    surface: "detail" as const,
    explainer: { body: explanation ?? null },
    learnMore: learnMore ?? null,
    menu: { leading: () => <VaultMenuRows href={vaultHref(row, row.holder)} />, exports: null },
    foot: (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-rb-500" data-card-foot>
        <span>
          First seen{" "}
          <Prov info={aaveVaultPositionSeenProv(coords, "first", row.census.firstBlock)}>
            <span>
              <BlockStamp block={row.census.firstBlock} at={row.firstSeenAt} />
            </span>
          </Prov>
        </span>
        <a
          href={explorerUrl(chainId, "address", row.holder)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-external"
        >
          {chainId === BASE_CHAIN_ID ? "on Basescan" : "on Etherscan"}
        </a>
      </div>
    ),
  };
  if (!status.live) return { ...detail, outcome: { word: "Closed" } };

  // ── the panel ────────────────────────────────────────────────────────────
  const claim =
    row.live?.claim && row.asset ? (
      <Figure
        name={figureName("holder-claim")}
        tip={`${formatUnitsExact(row.live.claim.raw, row.asset.decimals)} ${row.asset.symbol}`}
      >
        <Prov info={aaveVaultHolderClaimProv(coords)}>{formatCompact(row.live.claim.value)}</Prov>
      </Figure>
    ) : (
      <NotLoaded className="text-rb-500" />
    );
  const left: PositionPanelRow[] = [
    {
      id: "claim",
      label: "Claim",
      value: claim,
      asset:
        row.live?.claim && row.asset
          ? {
              symbol: row.asset.symbol,
              address: row.asset.address,
              figure: `${formatUnitsExact(row.live.claim.raw, row.asset.decimals)} ${row.asset.symbol}`,
            }
          : undefined,
      tip: `What those shares convert to in ${assetSymbol}: the vault's convertToAssets() of this balance at the same block.`,
    },
  ];
  const right: PositionPanelRow[] = [
    ...(context ? vaultContextRows(context) : []),
    ...(row.live
      ? [
          {
            id: "read-at",
            label: "Read at",
            value: (
              <>
                block{" "}
                <PanelFigure>
                  <BlockRef block={row.live.blockNumber} />
                </PanelFigure>
              </>
            ),
            tip: "The block the shares, the claim, the share of the vault and the redeemable figure were read at.",
          },
        ]
      : []),
    {
      id: "census-at",
      label: "Census at",
      value: (
        <>
          block{" "}
          <PanelFigure>
            <BlockRef block={row.census.block} />
          </PanelFigure>
        </>
      ),
      tip: "The block the daily census swept to: the transfers, first seen and the dollar value are counted there.",
    },
  ];
  return { ...detail, outcome: undefined, panel: [left, right] };
}

/** The vault position card: its slots, drawn by the shared card, inside the
 *  wrapper the verifiers read. */
export function VaultPositionCard(props: VaultPositionCardProps) {
  const { row, receipts = false } = props;
  const status = vaultPositionStatus(row);
  return (
    <div
      data-position-card={`${row.vault}:${row.holder}`}
      data-skel-section={receipts ? "detail-card" : undefined}
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

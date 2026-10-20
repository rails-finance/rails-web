"use client";

// The holder card (rails-ops ui-jobs 407 step 4, 410; survey 2026-10-20 §6,
// "The holder page"): one card for every vault family, on the shared card's
// detail surface under "Holding summary".
// ----------------------------------------------------------------------------
// Headlines: Balance · Share of the vault · Claim · Earned. Stats, at most six
// (decision 0040), in this order where they apply: Redeemable now, Exit, Claim
// by market (Morpho), Cooldown (Umbrella), Read at, Census at (not Yearn),
// First seen. The card is a renderer: the page builds every figure and receipt
// on the server, and Earned arrives as a promise over the Lifetime flows replay
// (lib/vaults/vault-flows.ts `vaultEarned`), so the card paints at once and
// Earned lands when the history has been read.
//
// Unread figures are said in words; a carried share price leaves Earned with no
// figure and a subline naming the block (decision 0048 point 2).

import Link from "next/link";
import { Fragment, Suspense, use, useState, type ReactNode } from "react";
import { Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { Prov, type Provenance } from "@/components/shared/provenance";
import {
  PositionCard,
  type PositionCardHead,
  type PositionCardSlots,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { PanelFigure } from "@/components/shared/position-card-panel";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { RevealTip } from "@/components/shared/reveal-tip";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { NotLoaded } from "@/components/shared/not-loaded";
import { BlockRef } from "@/components/shared/block-ref";
import { AssetAmount } from "@/components/shared/asset-amount";
import { VaultVenueMark, type VaultVenue } from "@/components/vaults/vault-venue-mark";
import { formatCompact } from "@/lib/shared/format-compact";
import { formatUnitsExact, formatUsdValue } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { pctText, shortAddress } from "@/lib/shared/vault-amount-text";
import { VAULT_FAMILIES, familyOfCensus } from "@/lib/vaults/families";
import type { ChainId } from "@/lib/shared/chains";
import { VAULT_SHAPE_WORD, usdText, vaultPositionUsd, type VaultPositionRow } from "@/lib/aave-vaults/vault-position";
import {
  aaveAttestedNameProv,
  aaveVaultPositionDivergenceProv,
  aaveVaultPositionSeenProv,
  aaveVaultPositionShapeProv,
  aaveVaultUnpricedProv,
  aaveVaultValueUsdProv,
  type AaveVaultCoords,
} from "@/lib/aave-vaults/vault-provenance";
import { attestedAddress, attestedShortName } from "@/lib/shared/attested-addresses";
import {
  holdingCensusAtProv,
  holdingClaimProv,
  holdingEarnedProv,
  holdingFirstSeenProv,
  holdingFractionProv,
  holdingMaxRedeemProv,
  holdingMaxWithdrawProv,
  holdingReadAtProv,
  holdingSharesProv,
  holdingTotalSupplyProv,
  type HoldingCoords,
} from "@/lib/vaults/holding-provenance";
import type { VaultEarned, VaultHoldingHistory } from "@/lib/vaults/earned";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";

const n = (v: number) => v.toLocaleString("en-US");
const ZERO = BigInt(0);
const units = (raw: string, decimals: number) => Number(raw) / 10 ** decimals;

/** One market of the holder's attributed slice (Morpho). */
export interface VaultHoldingMarket {
  id: string;
  label: string;
  /** Asset units, raw. */
  raw: string;
  prov: Provenance;
}

export interface VaultHoldingCardProps {
  coords: HoldingCoords & { chainId: ChainId };
  family: VaultVenue;
  /** Draw the venue mark beside the family word (Yearn: only where endorsed). */
  venueMark: boolean;
  vaultHref: string;
  /** This page's path, for "Link to this holding". */
  holdingHref: string;
  assetAddress?: string;
  shares: RawAmount;
  claim: RawAmount | null;
  totalSupply: RawAmount | null;
  /** Under 0.0001% of the vault: the wei are stated instead. */
  dust: boolean;
  maxWithdraw: RawAmount | null;
  /** Umbrella: the subline under Redeemable now. */
  maxRedeem?: RawAmount | null;
  exit: string;
  /** Umbrella: the state in a few words, the sentence behind it, its receipt. */
  cooldown?: { state: string; text: string; sentence: string; prov: Provenance };
  /** The census row, where the census has one. */
  census: VaultPositionRow | null;
  /** Morpho: the holder's attributed amount per market. */
  markets?: VaultHoldingMarket[];
  history: Promise<VaultHoldingHistory>;
  explanation: ReactNode;
  learnMore: LearnMoreContent;
}

/** The words a card prints where nothing was read. */
const Unread = ({ what }: { what: string }) => <span className="text-base font-normal text-rb-500">{what}</span>;

const Pending = () => <div className="mt-2 h-9 w-20 animate-pulse rounded-md bg-rb-200 dark:bg-rb-700" />;

function Figure({ name, children }: { name: string; children: ReactNode }) {
  return <span data-figure={name}>{children}</span>;
}

function Stamp({ block, at, chainId }: { block: number; at: number | null; chainId: ChainId }) {
  return (
    <>
      {at != null ? `${formatDate(at)} · ` : ""}
      <BlockRef block={block} chainId={chainId} />
    </>
  );
}

function MenuRows({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ToolsMenuItem
      icon={copied ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
      title="Link to this holding"
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

// ── Earned ───────────────────────────────────────────────────────────────────

const NO_FIGURE: Record<Exclude<VaultEarned["status"], "ok">, (block: number) => string> = {
  carried: (b) => `share price at block ${n(b)} did not answer`,
  unreplayed: (b) => `the replay did not equal balanceOf at block ${n(b)}`,
  unread: (b) => `convertToAssets did not answer at block ${n(b)}`,
};

function EarnedValue({
  history,
  coords,
  assetAddress,
}: {
  history: Promise<VaultHoldingHistory>;
  coords: HoldingCoords;
  assetAddress?: string;
}) {
  const { earned } = use(history);
  if (earned.status !== "ok")
    return (
      <span data-figure="holder-earned" data-earned-status={earned.status} data-earned-block={earned.block}>
        <Unread what="no figure" />
      </span>
    );
  const value = units(earned.earnedRaw, coords.assetDecimals);
  return (
    <span data-figure="holder-earned" data-earned-status="ok" data-earned-raw={earned.earnedRaw}>
      <Prov info={holdingEarnedProv(coords, earned)}>
        <AssetAmount
          value={value}
          symbol={coords.assetSymbol}
          address={assetAddress}
          exact={formatUnitsExact(earned.earnedRaw, coords.assetDecimals)}
          signed
        />
      </Prov>
    </span>
  );
}

function EarnedSub({ history }: { history: Promise<VaultHoldingHistory> }) {
  const { earned } = use(history);
  return earned.status === "ok" ? null : <>{NO_FIGURE[earned.status](earned.block)}</>;
}

function FirstSeenValue({
  history,
  coords,
}: {
  history: Promise<VaultHoldingHistory>;
  coords: HoldingCoords & { chainId: ChainId };
}) {
  const { firstSeen } = use(history);
  if (!firstSeen) return <NotLoaded inline className="" />;
  return (
    <Prov info={holdingFirstSeenProv(coords, firstSeen.block)}>
      <span>
        <Stamp block={firstSeen.block} at={firstSeen.at} chainId={coords.chainId} />
      </span>
    </Prov>
  );
}

// ── the slots ────────────────────────────────────────────────────────────────

function holdingSlots(p: VaultHoldingCardProps): PositionCardSlots {
  const c = p.coords;
  const census = p.census;
  const familyWord = VAULT_FAMILIES[p.family === "yearn" ? "yearn-v3" : familyOfCensus(p.family)].singular;
  const open = BigInt(p.shares.raw) > ZERO;
  const aave: AaveVaultCoords = {
    blockNumber: c.blockNumber,
    censusBlock: census?.census.block,
    chainId: c.chainId,
    vault: c.vault,
    vaultName: c.vaultName,
    shareSymbol: c.shareSymbol,
    assetSymbol: c.assetSymbol,
    holder: c.holder,
  };

  // ── identity ──────────────────────────────────────────────────────────────
  const attested = attestedAddress(c.holder);
  const shapeWord = census?.census.shape ? VAULT_SHAPE_WORD[census.census.shape] : null;
  const codeSize = typeof census?.census.shapeDetail?.codeSize === "number" ? census.census.shapeDetail.codeSize : null;
  const identity = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-sm font-semibold text-foreground" data-card-vault-symbol={c.shareSymbol}>
        <Link href={p.vaultHref} className="hover:underline" prefetch={false}>
          {c.shareSymbol}
        </Link>
        <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-normal text-rb-500">
          <span>·</span>
          {p.venueMark && <VaultVenueMark family={p.family} />}
          <span>{familyWord}</span>
        </span>
      </span>
      {attested ? (
        <Prov info={aaveAttestedNameProv(aave, attested)}>
          <span className="text-xs text-rb-500" data-attested-constant={attested.constant}>
            <span className="font-mono">{attestedShortName(attested)}</span> in Aave&rsquo;s address book
          </span>
        </Prov>
      ) : shapeWord && census ? (
        <Prov info={aaveVaultPositionShapeProv(aave, census.census.shape ?? "", codeSize)}>
          <span className="text-xs text-rb-500">{shapeWord}</span>
        </Prov>
      ) : null}
    </span>
  );

  // ── headlines ─────────────────────────────────────────────────────────────
  const balance: PositionCardHead = {
    id: "balance",
    label: "Balance",
    labelTip: `The ${c.shareSymbol} this address holds: the vault's balanceOf() at block ${n(c.blockNumber)}.`,
    value: (
      <Figure name="holder-shares">
        <Prov info={holdingSharesProv(c)}>
          <AssetAmount
            value={p.shares.value}
            symbol={c.shareSymbol}
            address={c.vault}
            exact={formatUnitsExact(p.shares.raw, c.shareDecimals)}
          />
        </Prov>
      </Figure>
    ),
  };

  const fraction =
    p.totalSupply && BigInt(p.totalSupply.raw) > ZERO ? Number(p.shares.raw) / Number(p.totalSupply.raw) : null;
  const share: PositionCardHead = {
    id: "share-of-vault",
    label: "Share of the vault",
    labelTip: "This balance over the vault's totalSupply(), both read at the same block.",
    value: (
      <Figure name="holder-fraction">
        {p.dust ? (
          <Unread what="less than 0.0001%" />
        ) : fraction != null ? (
          <Prov info={holdingFractionProv(c)}>{pctText(fraction)}</Prov>
        ) : (
          <NotLoaded className="text-base font-normal text-rb-500" />
        )}
      </Figure>
    ),
    sub: p.dust ? (
      <span className="tabular-nums">{p.shares.raw} wei of shares</span>
    ) : p.totalSupply ? (
      <span data-figure="total-supply">
        of{" "}
        <Prov info={holdingTotalSupplyProv(c)}>
          <span className="tabular-nums">{formatCompact(p.totalSupply.value)}</span>
        </Prov>{" "}
        {c.shareSymbol}
      </span>
    ) : undefined,
  };

  // The USD line is the census's, at its priced block; no census, no oracle.
  const usd = census ? vaultPositionUsd(census) : null;
  // A closed holding states no dollar line: the census's figure is a value then.
  const priced = open && census != null && census.value.usdE8 != null && usd != null;
  const pricedBlock = census ? (census.value.pricedBlock ?? census.census.block) : null;
  const claim: PositionCardHead = {
    id: "claim",
    label: "Claim",
    labelTip: `What the shares convert to in ${c.assetSymbol}: the vault's convertToAssets() of this balance at the same block.${
      priced ? ` Beneath it, the census's dollar value at block ${n(pricedBlock!)}, through Aave V3's oracle.` : ""
    }`,
    value: p.claim ? (
      <Figure name="holder-claim">
        <Prov info={holdingClaimProv(c)}>
          <AssetAmount
            value={p.claim.value}
            symbol={c.assetSymbol}
            address={p.assetAddress}
            exact={formatUnitsExact(p.claim.raw, c.assetDecimals)}
          />
        </Prov>
      </Figure>
    ) : (
      <Figure name="holder-claim">
        <NotLoaded className="text-base font-normal text-rb-500" />
      </Figure>
    ),
    usd: priced ? (
      <Figure name="holder-value-usd">
        <RevealTip tip={`${usdText(census!.value.usdE8!)} at census block ${n(pricedBlock!)}, via Aave V3's oracle`}>
          <Prov info={aaveVaultValueUsdProv(aave, census!.value, c.shareDecimals)}>
            <span className="font-bold text-green-400">{formatUsdValue(usd!)}</span>
          </Prov>
        </RevealTip>
      </Figure>
    ) : !open ? undefined : census ? (
      <Figure name="holder-value-usd">
        <Prov info={aaveVaultUnpricedProv(aave, census.value)}>
          <Unread what="not priced" />
        </Prov>
      </Figure>
    ) : (
      <Figure name="holder-value-usd">
        <Unread what="not priced" />
      </Figure>
    ),
    sub: priced
      ? `at census block ${n(pricedBlock!)}`
      : census || !open
        ? undefined
        : "no oracle is read for this asset",
  };

  const earned: PositionCardHead = {
    id: "earned",
    label: "Earned",
    labelTip: `The claim now plus every ${c.assetSymbol} amount that left, minus every amount that came in.`,
    value: (
      <Suspense fallback={<Pending />}>
        <EarnedValue history={p.history} coords={c} assetAddress={p.assetAddress} />
      </Suspense>
    ),
    sub: (
      <Suspense fallback={null}>
        <EarnedSub history={p.history} />
      </Suspense>
    ),
  };

  // ── stats ─────────────────────────────────────────────────────────────────
  const stats: PositionPanelRow[] = [];
  if (open) {
    stats.push({
      id: "redeemable",
      label: "Redeemable now",
      sub:
        p.maxRedeem !== undefined ? (
          <span data-figure="holder-max-redeem">
            {p.maxRedeem ? (
              <Prov info={holdingMaxRedeemProv(c)}>
                <span className="tabular-nums">
                  {formatCompact(p.maxRedeem.value)} {c.shareSymbol}
                </span>
              </Prov>
            ) : (
              <NotLoaded inline className="" />
            )}
          </span>
        ) : undefined,
      value: (
        <span data-figure="holder-max-withdraw">
          {p.maxWithdraw ? (
            <Prov info={holdingMaxWithdrawProv(c)}>{formatCompact(p.maxWithdraw.value)}</Prov>
          ) : (
            <NotLoaded inline className="" />
          )}
        </span>
      ),
      asset: p.maxWithdraw
        ? {
            symbol: c.assetSymbol,
            address: p.assetAddress,
            figure: `${formatUnitsExact(p.maxWithdraw.raw, c.assetDecimals)} ${c.assetSymbol}`,
          }
        : undefined,
      tip:
        p.maxRedeem !== undefined
          ? `The vault's maxWithdraw() for this address at block ${n(c.blockNumber)}, in ${c.assetSymbol}. Beneath it, maxRedeem() in shares: the stake token lets shares leave only inside the unstake window.`
          : `The vault's maxWithdraw() for this address at block ${n(c.blockNumber)}, in ${c.assetSymbol}: what could leave at that block.`,
    });
    stats.push({
      id: "exit",
      label: "Exit",
      value: (
        <span data-figure="holder-exit">
          <code>{p.exit}</code>
        </span>
      ),
      tip: "The vault's functions a holder leaves through, as the contract names them.",
    });
  }
  if (open && p.markets && p.markets.length > 0) {
    const funded = p.markets.filter((m) => BigInt(m.raw) > ZERO);
    stats.push({
      id: "by-market",
      label: "Claim by market",
      value: (
        <span data-figure="holder-markets" data-prov-exempt>
          <PanelFigure>{n(funded.length)}</PanelFigure> market{funded.length === 1 ? "" : "s"}
        </span>
      ),
      tip: "This holding's share of the vault applied to each market's settled assets, at the same block.",
      breakdown: {
        symbols: funded.map((m) => m.label),
        panel: (
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm" data-holder-markets="">
            {p.markets.map((m) => (
              <div key={m.id} className="contents" data-exposure-leg={m.id}>
                <dt className="min-w-0 truncate text-rb-500">{m.label}</dt>
                <dd
                  className="text-right tabular-nums text-foreground"
                  data-cell="attributed"
                  data-attributed-raw={m.raw}
                >
                  <Prov info={m.prov}>
                    {formatCompact(units(m.raw, c.assetDecimals))} {c.assetSymbol}
                  </Prov>
                </dd>
              </div>
            ))}
          </dl>
        ),
      },
    });
  }
  if (open && p.cooldown)
    stats.push({
      id: "cooldown",
      label: "Cooldown",
      value: (
        <span data-figure="holder-cooldown">
          <Prov info={p.cooldown.prov}>{p.cooldown.text}</Prov>
        </span>
      ),
      tip: `${p.cooldown.sentence}. redeem() answers only inside the window.`,
    });
  stats.push({
    id: "read-at",
    label: "Read at",
    value: (
      <>
        block{" "}
        <PanelFigure>
          <Prov info={holdingReadAtProv(c)}>
            <span>
              <BlockRef block={c.blockNumber} chainId={c.chainId} />
            </span>
          </Prov>
        </PanelFigure>
      </>
    ),
    tip: "The block the balance, the share of the vault, the claim and Redeemable now were read at.",
  });
  if (census)
    stats.push({
      id: "census-at",
      label: "Census at",
      value: (
        <>
          block{" "}
          <PanelFigure>
            <Prov info={holdingCensusAtProv(c, census.census.block)}>
              <span>
                <BlockRef block={census.census.block} chainId={c.chainId} />
              </span>
            </Prov>
          </PanelFigure>
        </>
      ),
      tip: "The block the daily census swept to: the transfer count, first seen and the dollar value are counted there.",
    });
  stats.push({
    id: "first-seen",
    label: "First seen",
    value: (
      <span data-figure="holder-first-seen">
        <PanelFigure>
          {census ? (
            <Prov info={aaveVaultPositionSeenProv(aave, "first", census.census.firstBlock)}>
              <span>
                <Stamp block={census.census.firstBlock} at={census.firstSeenAt} chainId={c.chainId} />
              </span>
            </Prov>
          ) : (
            <Suspense fallback={<span className="text-rb-500">…</span>}>
              <FirstSeenValue history={p.history} coords={c} />
            </Suspense>
          )}
        </PanelFigure>
      </span>
    ),
    tip: census
      ? "The block of this address's first transfer of the vault's shares, from the census."
      : "The block of this address's first transfer of the vault's shares, from this page's sweep.",
  });

  const divergent = census != null && census.census.live !== open;
  return {
    surface: "detail",
    heading: "Holding summary",
    status: open ? null : { word: "Closed", tone: "muted" },
    identity,
    heads: [balance, share, claim, earned],
    notice: divergent ? (
      <p className="mb-3 max-w-3xl text-xs leading-relaxed text-rb-500" data-card-divergence>
        <Prov info={aaveVaultPositionDivergenceProv(aave)}>
          <span>
            {census!.census.live
              ? `Held at census block ${n(census!.census.block)}, closed by block ${n(c.blockNumber)}`
              : `Held nothing at census block ${n(census!.census.block)}, holding again at block ${n(c.blockNumber)}`}
          </span>
        </Prov>
        .
      </p>
    ) : undefined,
    counters: census
      ? {
          lastActivityAt: census.lastActivityAt,
          eventCount: census.census.transferCount,
          eventCountNoun: "transfer",
          order: "age-last" as const,
        }
      : null,
    menu: { leading: () => <MenuRows href={p.holdingHref} />, exports: null },
    explainer: { body: <Fragment key="explanation">{p.explanation}</Fragment> },
    learnMore: p.learnMore,
    panel: [stats, []],
  };
}

/** The holder card inside the wrapper the verifiers read. */
export function VaultHoldingCard(props: VaultHoldingCardProps) {
  const { coords: c, census } = props;
  const open = BigInt(props.shares.raw) > ZERO;
  return (
    <div
      className="mb-6"
      data-position-card={`${c.vault}:${c.holder}`}
      data-skel-section="detail-card"
      data-vault={c.vault}
      data-holder={c.holder}
      data-vault-family={props.family}
      data-status={open ? "live" : "closed"}
      data-shares-raw={props.shares.raw}
      data-claim-raw={props.claim?.raw ?? ""}
      data-total-supply-raw={props.totalSupply?.raw ?? ""}
      data-max-withdraw-raw={props.maxWithdraw?.raw ?? ""}
      data-max-redeem-raw={props.maxRedeem?.raw ?? ""}
      data-holder-cooldown-state={props.cooldown?.state ?? ""}
      data-live-block={c.blockNumber}
      data-census-balance-raw={census?.census.balance ?? ""}
      data-census-block={census?.census.block ?? ""}
      data-transfer-count={census?.census.transferCount ?? ""}
      data-first-block={census?.census.firstBlock ?? ""}
      data-last-block={census?.census.lastBlock ?? ""}
      data-shape={census?.census.shape ?? ""}
      data-value-usd-e8={census?.value.usdE8 ?? ""}
      data-priced-block={census?.value.pricedBlock ?? ""}
      data-share-ppm={census?.census.sharePpm ?? ""}
    >
      <PositionCard slots={holdingSlots(props)} />
    </div>
  );
}

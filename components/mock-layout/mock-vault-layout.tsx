"use client";

// The MetaMorpho vault page as a grid of tiles (Miles, 10 Nov 2026, round
// two): Coinbase's asset page for the grid, Morpho's vault page for the hero,
// the configuration, the returns and the roles. A localhost mock under
// /mock-layout. The reads are the live page's
// (components/vaults/morpho-base-vault-page.tsx) plus the page's own.
//
// Each tile is a `Tile` holding one `ProvSection`, so its heading, read stamp,
// "?" and ⋮ sit in its top row. The reused sections keep their own headings;
// the grid's scoped selectors strip their outer margins and inner frames, and
// hide the protects section's disclaimer (the page states it once, in a row).

import Link from "next/link";
import type { ReactNode } from "react";
import { serverReadOf } from "@/lib/shared/server-head-read";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { readStampProv, SectionReadStamp } from "@/components/shared/read-stamp";
import { CopyFact } from "@/components/shared/event-page-aside";
import { PanelFigure } from "@/components/shared/position-card-panel";
import { VaultLead, VaultPills, vaultHeads, VAULT_HEAD_TIPS, VAULT_PILL } from "@/components/vaults/vault-heads";
import type { VaultMenuLink } from "@/components/vaults/vault-card";
import { VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { VaultStrip } from "@/components/vaults/vault-strip";
import { VaultIlliquidMarkets } from "@/components/vaults/vault-illiquid";
import { VaultProtects, type ProtectsSectionData } from "@/components/vaults/vault-protects";
import { chainMeta, explorerUrl } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { assetText, sharePriceText, shortAddress, shortId } from "@/lib/shared/vault-amount-text";
import { morphoBaseWalletHref } from "@/lib/morpho-base/routes";
import { morphoLoanTokenHref, morphoMarketHref } from "@/lib/morpho/market-routes";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import {
  vaultLegAssetsProv,
  vaultLegLltvProv,
  vaultLegShareProv,
  vaultHeldAssetsProv,
  vaultLostAssetsProv,
  vaultSharePriceProv,
  vaultTotalAssetsProv,
  type MorphoVaultCoords,
} from "@/lib/morpho-base/vault-provenance";
import type { MorphoBaseVaultResponse } from "@/lib/sources/chain/morpho-base-vault";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import { metaMorphoVaultHref, metaMorphoVaultsListingHref } from "@/lib/vaults/routes";
import { morphoBaseVaultPageSummary, withAssetScale } from "@/lib/vaults/summary";
import type { AssetScale } from "@/lib/vaults/asset-scale-words";
import { vaultStewardProv, vaultVenueProv } from "@/lib/vaults/card-provenance";
import { vaultWithdrawableProv } from "@/lib/vaults/row-provenance";
import { morphoVaultAssetsContent, STEWARD_TIP } from "@/lib/vaults/card-words";
import { HEALTH_DISCLAIMER } from "@/lib/vaults/health-words";
import { spanOf, yearlyOf } from "@/lib/vaults/health";
import { changeText, measuredYield, yieldText, type VaultYield, type VaultYieldRead } from "@/lib/vaults/yield";
import type { VaultStripSeries } from "@/lib/vaults/yield-read";
import { priceHistoryRows } from "@/lib/mock-layout/price-history";
import type { MockVaultConfig } from "@/lib/mock-layout/vault-config-read";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const n = (v: number) => v.toLocaleString("en-US");
const lltvText = (lltv: number) => `${(lltv * 100).toFixed(1)}%`;
const dayText = (day: number) => formatDate(new Date(day * 86_400_000));
const ZERO = /^0x0{40}$/;

/** The grid: one column, two from lg; the 1px gaps over the frame's colour
 *  draw the shared hairlines. The scoped selectors work on the reused
 *  sections: no outer margin or ring offset, no inner frame on the protects
 *  line, and no disclaimer in its explanation (the page's one copy is a row). */
const GRID = [
  "grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-rb-200 bg-rb-200 lg:grid-cols-2",
  "dark:border-rb-500/30 dark:bg-rb-500/30",
  "[&_section[data-prov-scope]]:m-0 [&_section[data-prov-scope]]:rounded-none [&_section[data-prov-scope]]:p-0",
  "[&_section[data-vault-protects]>.rounded-xl]:border-0 [&_section[data-vault-protects]>.rounded-xl]:px-0",
  "[&_[data-protects-disclaimer]]:hidden",
].join(" ");

const TILE = "min-w-0 scroll-mt-4 bg-background p-5";

function Tile({ id, wide, flush, children }: { id?: string; wide?: boolean; flush?: boolean; children: ReactNode }) {
  return (
    <div id={id} className={`${flush ? "min-w-0 scroll-mt-4" : TILE} ${wide ? "lg:col-span-2" : ""}`} data-mock-tile="">
      {children}
    </div>
  );
}

const LABEL =
  "cursor-help text-[13px] text-rb-500 underline decoration-rb-400 decoration-dotted underline-offset-4 dark:decoration-rb-500";

function Term({ label, tip }: { label: string; tip?: string }) {
  return tip ? (
    <abbr title={tip} className={LABEL}>
      {label}
    </abbr>
  ) : (
    <span className="text-[13px] text-rb-500">{label}</span>
  );
}

const WITHDRAWABLE_TIP =
  "What the vault could take out of its markets at the read block: in each market of the withdraw queue, the lesser of the vault's assets there and the market's supply less its borrow.";
const RETURNS_TIP =
  "Rails's interpretation of two reads of the share price from the daily store: the growth between them as a yearly rate, (p1 / p0 − 1) × 365 / days. Net of the fees the vault takes inside the share. No forecast.";

/** One label/value pair in a tile's two-column grid. */
function Fact({
  id,
  label,
  tip,
  value,
  sub,
}: {
  id: string;
  label: string;
  tip?: string;
  value: ReactNode | null;
  sub?: ReactNode;
}) {
  return (
    <div
      className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 border-b border-rb-200 py-2.5 dark:border-rb-500/30"
      data-mock-fact={id}
    >
      <dt>
        <Term label={label} tip={tip} />
      </dt>
      <dd className="flex min-w-0 justify-end text-right text-[14px] font-medium tabular-nums text-foreground">
        {value ?? <span className="text-[13px] font-normal text-rb-500">not read</span>}
      </dd>
      {sub && <dd className="col-span-2 mt-0.5 text-xs leading-snug text-rb-500">{sub}</dd>}
    </div>
  );
}

const FACTS = "mt-3 grid grid-cols-1 gap-x-8 border-t border-rb-200 sm:grid-cols-2 dark:border-rb-500/30";

/** A hero figure: dotted label, the figure large, a line under it. */
function Big({
  id,
  label,
  tip,
  value,
  sub,
}: {
  id: string;
  label: string;
  tip?: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="min-w-0" data-mock-hero={id}>
      <Term label={label} tip={tip} />
      <div className="mt-1 flex min-w-0 text-2xl font-semibold tabular-nums text-foreground">
        {value ?? <span className="text-[15px] font-normal text-rb-500">not read</span>}
      </div>
      {sub && <div className="mt-1 text-xs leading-snug text-rb-500">{sub}</div>}
    </div>
  );
}

const CHIP =
  "inline-flex items-center gap-1 rounded-sm border border-rb-200 px-1.5 py-0.5 text-[11px] text-rb-500 dark:border-rb-500/30";

/** One address row: what it is, its short form, copy and explorer link. */
function AddressRow({
  id,
  label,
  sub,
  address,
  explorer,
  href,
}: {
  id: string;
  label: string;
  sub?: string;
  address: string | null;
  explorer: string;
  href: (a: string) => string;
}) {
  return (
    <li
      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rb-200 py-2.5 dark:border-rb-500/30"
      data-mock-address={id}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        {sub && <div className="text-xs text-rb-500">{sub}</div>}
      </div>
      {address ? (
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[13px] text-foreground" title={address}>
            {shortAddress(address)}
          </span>
          <CopyFact value={address} label={`Copy the ${label.toLowerCase()} address`} name={id} />
          <a href={href(address)} target="_blank" rel="noopener noreferrer" className={`text-[13px] ${INLINE_LINK}`}>
            {explorer}
          </a>
        </div>
      ) : (
        <span className="text-[13px] text-rb-500">none set</span>
      )}
    </li>
  );
}

/** "7 days", "1 day", "36 hours", "none". */
function waitText(seconds: number): string {
  if (seconds === 0) return "none";
  if (seconds % 86_400 === 0) return `${n(seconds / 86_400)} ${seconds === 86_400 ? "day" : "days"}`;
  if (seconds % 3_600 === 0) return `${n(seconds / 3_600)} ${seconds === 3_600 ? "hour" : "hours"}`;
  return `${n(seconds)} seconds`;
}

/** A WAD fraction as a percentage, to two places. */
function wadPct(raw: string): string {
  const bp = Number((BigInt(raw) * BigInt(1_000_000)) / BigInt(10) ** BigInt(18)) / 10_000;
  return `${bp.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

/** Every Blue position the vault holds, on the chain's explorer. */
const blueWalletHref = (chainId: 1 | 8453, vault: string) =>
  chainId === 8453 ? morphoBaseWalletHref(vault) : (listingHrefForWallet("morpho", vault) ?? "/ethereum/morpho");

const ANCHORS = [
  ["overview", "Overview"],
  ["allocation", "Allocation"],
  ["history", "History"],
  ["risk", "Risk"],
  ["addresses", "Addresses"],
] as const;

export function MockVaultLayout({
  data,
  census,
  assetScales,
  yieldFigure: storeYield,
  strip,
  priceReads,
  protects,
  config,
}: {
  data: MorphoBaseVaultResponse;
  census: VaultCensusRow | null;
  assetScales: Record<string, AssetScale>;
  yieldFigure?: VaultYield;
  strip: VaultStripSeries | null;
  /** The share price's stored reads, oldest first; null where the store did not answer. */
  priceReads: VaultYieldRead[] | null;
  /** "What protects it" and "The protocol underneath", and the guardian and
   *  timelock behind them; null where the read failed. */
  protects: {
    block: number;
    timelock: number;
    guardian: string | null;
    protects: ProtectsSectionData;
    underneath: ProtectsSectionData;
  } | null;
  config: MockVaultConfig;
}) {
  const registry = useReceiptRegistry();
  const { vault, legs, chainId } = data;
  const chain = chainMeta(chainId);
  const v = withAssetScale(morphoBaseVaultPageSummary(data, census), assetScales);
  const yieldFigure = measuredYield(storeYield, v.totalAssets?.raw);
  const coords: MorphoVaultCoords = {
    chainId,
    readBy: serverReadOf(data),
    blockNumber: data.blockNumber,
    vault: vault.address,
    vaultName: vault.name,
    assetSymbol: vault.asset.symbol,
    shareSymbol: vault.symbol,
  };
  const unit = vault.asset.symbol;
  const ad = vault.asset.decimals;
  const steward = v.steward!;
  const funded = legs.filter((l) => BigInt(l.assets.raw) > BigInt(0));
  const addr = (a: string) => explorerUrl(chainId, "address", a);
  const name = vault.name || shortAddress(vault.address);

  const receipts = {
    totalAssets: vaultTotalAssetsProv(coords),
    sharePrice: vaultSharePriceProv(coords),
    ...(data.lostAssets
      ? {
          lostAssets: vaultLostAssetsProv(coords),
          heldAssets: vaultHeldAssetsProv(coords, {
            totalAssets: data.totalAssets.raw,
            lostAssets: data.lostAssets.raw,
          }),
        }
      : {}),
  };
  const heads = vaultHeads({
    vault: v,
    yieldFigure: storeYield,
    holdersHref: metaMorphoVaultsListingHref(chainId, { vault: vault.address }),
    receipts,
    detail: true,
  });
  const head = (id: string) => heads.find((h) => h.id === id);
  const total = head("total-assets");
  const yld = head("yield");
  const holders = head("holders");

  const w = v.withdrawable;
  const withdrawable = w ? { raw: w.withdrawable, value: Number(w.withdrawable) / 10 ** ad } : null;
  const queue = w ? { raw: w.queueAssets, value: Number(w.queueAssets) / 10 ** ad } : null;

  const links: VaultMenuLink[] = [
    {
      item: "own-positions",
      title: "This vault's positions on Morpho Blue",
      subtitle: "The vault as a Morpho Blue lender",
      href: blueWalletHref(chainId, vault.address),
      internal: true,
    },
    {
      item: "vault-contract",
      title: "Vault contract",
      subtitle: `${shortAddress(vault.address)} on ${chain.explorerName}`,
      href: addr(vault.address),
    },
    {
      item: "venue-page",
      title: "On Morpho's app",
      subtitle: "app.morpho.org",
      href: `https://app.morpho.org/${chainId === 1 ? "ethereum" : "base"}/vault/${vault.address}`,
    },
  ];

  const rows: VaultAssetRow[] = legs.map((leg) => {
    const legCoords: MorphoVaultCoords = { ...coords, marketId: leg.id, collateralSymbol: leg.collateralSymbol };
    const venue = leg.isIdle ? "Idle market" : (leg.collateralSymbol ?? shortId(leg.id));
    return {
      key: leg.id,
      venue,
      ...(leg.isIdle ? {} : { icon: { symbol: leg.collateralSymbol ?? venue, address: leg.collateralToken } }),
      href: morphoMarketHref(chainId, leg.loanToken, leg.id),
      venueProv: vaultVenueProv(
        v,
        {
          venue,
          what: leg.isIdle
            ? `the vault's idle market on Morpho Blue: a market with no collateral, no oracle and no rate model, where it holds ${unit} unlent.`
            : `the Morpho Blue market lending ${unit} against ${leg.collateralSymbol ?? "its collateral"}, a market in the vault's withdraw queue.`,
          via: "withdrawQueue(i) · idToMarketParams(id) · position(id, vault)",
          contract: { name: "Morpho Blue", address: vault.morpho },
          ids: [
            { label: "market id", value: leg.id },
            { label: "loan token", value: leg.loanToken },
          ],
        },
        coords.readBy,
      ),
      sub: leg.isIdle ? (
        "the vault's cash inside Morpho Blue"
      ) : (
        <>
          LLTV <Prov info={vaultLegLltvProv(legCoords)}>{lltvText(leg.lltv)}</Prov>
        </>
      ),
      amount: leg.assets,
      amountProv: vaultLegAssetsProv(legCoords),
      share: leg.shareOfAllocated,
      shareProv: vaultLegShareProv(legCoords),
      hooks: { "data-leg": leg.id },
    };
  });
  if (!legs.some((l) => l.isIdle))
    rows.push({
      key: "idle",
      venue: "Idle",
      sub: "no idle market in the queue",
      amount: null,
      share: null,
      offBand: true,
      hooks: { "data-idle": "none" },
    });

  const history = priceReads ? priceHistoryRows(priceReads) : null;
  const priceOf = (r: VaultYieldRead) => sharePriceText({ raw: r.raw, value: Number(r.raw) / 10 ** ad }, ad);
  // Decision 0047's figure over each window, through lib/vaults/health.ts:
  // spanOf picks the reads, yearlyOf is (p1 / p0 − 1) × 365 / d.
  const returns = ([7, 30, 90] as const).map((days) => {
    const span = priceReads ? spanOf(priceReads, days) : null;
    return { days, span, yearly: span && BigInt(span.from.raw) > BigInt(0) ? yearlyOf(span) : null };
  });

  const configStamp = (block: number | null, what: string, reads: string) =>
    block ? (
      <SectionReadStamp
        chainId={chainId}
        block={block}
        info={(at) =>
          readStampProv({
            chainId,
            block,
            at,
            what,
            contracts: [{ name: vault.name, address: vault.address, reads }],
          })
        }
      />
    ) : undefined;

  return (
    <ProvReceiptsScope registry={registry}>
      <div
        className="mb-4 rounded-lg border border-dashed border-rb-400 px-4 py-3 text-[13px] leading-relaxed text-rb-500 dark:border-rb-500"
        data-mock-note=""
      >
        A mock of a new layout for this vault&rsquo;s page: Coinbase&rsquo;s grid of tiles, with the hero,
        configuration, returns and roles from Morpho&rsquo;s vault page. New: the hero figures, vault configuration,
        returns, share price history and roles and addresses tiles. Receipts on the new tiles are not wired yet.{" "}
        <Link href={metaMorphoVaultHref(chainId, vault.address)} prefetch={false} className={INLINE_LINK}>
          The live page
        </Link>
      </div>

      <div className={GRID} data-mock-layout="">
        {/* Hero */}
        <Tile id="overview" wide>
          <ProvSection scope="mock-overview" data-mock-section="overview">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-3">
                  <VaultLead vault={v} size={32} />
                  <h1 className="min-w-0 break-words text-xl font-semibold text-foreground">{name}</h1>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <VaultPills vault={v} receipts={{}} />
                  <span className={VAULT_PILL} data-pill="chain">
                    {chain.name}
                  </span>
                  <span className={CHIP} data-mock-chip="steward">
                    <abbr title={steward.role === "curator" ? STEWARD_TIP.curator : STEWARD_TIP.owner}>
                      {steward.role === "curator" ? "Curator" : "Owner"}
                    </abbr>
                    <span className="font-mono text-foreground">
                      <Prov info={vaultStewardProv(v, steward, coords.readBy)}>{shortAddress(steward.address)}</Prov>
                    </span>
                  </span>
                  <span className={CHIP} data-mock-chip="asset">
                    Asset <span className="text-foreground">{unit}</span>
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SectionReadStamp
                  chainId={chainId}
                  block={data.blockNumber}
                  readBy={coords.readBy}
                  info={(at) =>
                    readStampProv({
                      chainId,
                      block: data.blockNumber,
                      at,
                      readBy: coords.readBy,
                      what: "Every chain figure in this section",
                      contracts: [
                        {
                          name: vault.name,
                          address: vault.address,
                          reads: "totalAssets(), totalSupply(), convertToAssets(), curator(), owner(), lostAssets()",
                        },
                      ],
                    })
                  }
                />
                <SectionMenu scope="mock-overview" title="Overview" links={links} />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
              <Big
                id="total-assets"
                label="Total assets"
                tip={VAULT_HEAD_TIPS.totalAssets}
                value={total?.value}
                sub={total?.sub}
              />
              <Big
                id="withdrawable"
                label="Withdrawable"
                tip={WITHDRAWABLE_TIP}
                value={
                  withdrawable ? (
                    <span
                      className="flex min-w-0 flex-wrap items-baseline gap-x-1.5"
                      data-mock-withdrawable={withdrawable.raw}
                    >
                      <span className="break-all">
                        {v.illiquid ? (
                          <Prov info={vaultWithdrawableProv(v, v.illiquid)}>{assetText(withdrawable, ad)}</Prov>
                        ) : (
                          <span data-prov-exempt="">{assetText(withdrawable, ad)}</span>
                        )}
                      </span>
                      <span className="text-[0.5em] font-medium text-rb-500">{unit}</span>
                    </span>
                  ) : null
                }
                sub={
                  queue ? <span data-prov-exempt="">of {assetText(queue, ad)} in the withdraw queue</span> : undefined
                }
              />
              <Big id="yield" label="Yield 30 days" tip={VAULT_HEAD_TIPS.yield} value={yld?.value} sub={yld?.sub} />
              <Big
                id="holders"
                label="Holders"
                tip={VAULT_HEAD_TIPS.holders}
                value={holders?.value}
                sub={holders?.sub}
              />
            </div>
            {v.illiquid && (
              <div className="mt-4">
                <VaultIlliquidMarkets vault={v} il={v.illiquid} />
              </div>
            )}
            <nav
              aria-label="On this page"
              className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-rb-200 pt-3 text-[13px] dark:border-rb-500/30"
            >
              {ANCHORS.map(([id, label]) => (
                <a key={id} href={`#${id}`} className={INLINE_LINK}>
                  {label}
                </a>
              ))}
            </nav>
          </ProvSection>
        </Tile>

        {/* The page's one disclaimer */}
        <Tile wide>
          <p className="text-[13px] leading-relaxed text-rb-500" data-mock-disclaimer="">
            {HEALTH_DISCLAIMER}
          </p>
        </Tile>

        <Tile>
          <ProvSection scope="mock-config" data-mock-section="config">
            <SectionHeading
              title="Vault configuration"
              stamp={configStamp(config.block, "Fee and fee recipient", "fee(), feeRecipient()")}
              menu={<SectionMenu scope="mock-config" title="Vault configuration" />}
            />
            <dl className={FACTS} data-prov-exempt="">
              <Fact
                id="version"
                label="Version"
                tip="The MetaMorpho factory release that deployed the vault."
                value={v.releaseLabel}
              />
              <Fact
                id="created"
                label="Created"
                tip="The date of the block the vault was deployed in."
                value={config.createdAt ? formatDate(new Date(config.createdAt * 1000)) : null}
                sub={vault.createdBlock > 0 ? `block ${n(vault.createdBlock)}` : undefined}
              />
              <Fact
                id="timelock"
                label="Timelock"
                tip="How long new markets, higher caps, removals and a shorter timelock wait before they take effect."
                value={protects ? waitText(protects.timelock) : null}
              />
              <Fact
                id="fee"
                label="Performance fee"
                tip="The share of the interest the vault earns that it pays to the fee recipient, as new shares. Read from fee(), a fraction of 10^18."
                value={config.fee != null ? wadPct(config.fee) : null}
                sub={
                  config.feeRecipient && !ZERO.test(config.feeRecipient)
                    ? `to ${shortAddress(config.feeRecipient)}`
                    : config.fee != null
                      ? "no fee recipient set"
                      : undefined
                }
              />
            </dl>
          </ProvSection>
        </Tile>

        <Tile>
          <ProvSection scope="mock-returns" data-mock-section="returns">
            <SectionHeading title="Returns" menu={<SectionMenu scope="mock-returns" title="Returns" />}>
              <p className="mt-1 text-[13px] text-rb-500">
                The share price&rsquo;s growth over each window, as a yearly rate.
              </p>
            </SectionHeading>
            <dl className={FACTS} data-prov-exempt="">
              {returns.map((r) => (
                <Fact
                  key={r.days}
                  id={`returns-${r.days}`}
                  label={`${r.days} days`}
                  tip={RETURNS_TIP}
                  value={
                    r.yearly != null ? (
                      yieldText(r.yearly)
                    ) : (
                      <span className="text-[13px] font-normal text-rb-500">
                        {priceReads == null ? "store did not answer" : "Not in the daily store"}
                      </span>
                    )
                  }
                  sub={r.span ? `${dayText(r.span.from.day)} to ${dayText(r.span.to.day)}` : undefined}
                />
              ))}
            </dl>
          </ProvSection>
        </Tile>

        <Tile id="history">
          <ProvSection scope="mock-price-history" data-mock-section="price-history">
            <SectionHeading
              title="Share price history"
              menu={<SectionMenu scope="mock-price-history" title="Share price history" />}
            >
              <p className="mt-1 text-[13px] text-rb-500">One read a day from Rails&rsquo;s daily store.</p>
            </SectionHeading>
            <div className="mt-2 min-w-0" data-prov-exempt="">
              {history == null ? (
                <p className="text-[13px] text-rb-500">The daily store did not answer.</p>
              ) : history.length === 0 ? (
                <p className="text-[13px] text-rb-500">No daily series yet.</p>
              ) : (
                <table className="w-full text-[13px] tabular-nums" data-mock-price-history="">
                  <thead>
                    <tr className="border-b border-rb-200 text-left text-xs text-rb-500 dark:border-rb-500/30">
                      <th className="py-2 pr-3 font-normal">
                        <span className="sr-only">Window</span>
                      </th>
                      <th className="py-2 pr-3 font-normal">Date</th>
                      <th className="py-2 pr-3 text-right font-normal">
                        <abbr title={VAULT_HEAD_TIPS.sharePrice} className={`${LABEL} text-xs`}>
                          Share price
                        </abbr>
                      </th>
                      <th className="py-2 text-right font-normal">
                        <abbr title="The latest share price over this row's, less one." className={`${LABEL} text-xs`}>
                          Change to latest
                        </abbr>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-rb-200 dark:border-rb-500/30"
                        data-mock-history-row={r.id}
                      >
                        <th scope="row" className="py-2 pr-3 text-left font-medium text-foreground">
                          {r.label}
                        </th>
                        {r.read ? (
                          <>
                            <td className="py-2 pr-3 text-rb-500" title={`Block ${n(r.read.block)}`}>
                              {dayText(r.read.day)}
                            </td>
                            <td className="break-all py-2 pr-3 text-right text-foreground">
                              {priceOf(r.read)}{" "}
                              <span className="whitespace-nowrap break-normal text-xs text-rb-500">{unit}</span>
                            </td>
                            <td className="py-2 text-right text-foreground">
                              {r.change == null ? "" : changeText(r.change)}
                            </td>
                          </>
                        ) : (
                          <td colSpan={3} className="py-2 text-rb-500">
                            Not in the daily store
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </ProvSection>
        </Tile>

        <Tile>
          <VaultStrip vault={v} strip={strip} yieldFigure={yieldFigure} />
        </Tile>

        <Tile id="allocation" wide>
          <VaultAssets
            rows={rows}
            assetSymbol={unit}
            assetAddress={vault.asset.address}
            assetDecimals={ad}
            line={
              <>
                <PanelFigure>{n(funded.length)}</PanelFigure> of {n(legs.length)} markets in the withdraw queue hold a
                balance.
              </>
            }
            shareTip="Each market's amount over the sum across the withdraw queue."
            learnMore={morphoVaultAssetsContent()}
            menu={{
              links: [
                {
                  item: "loan-token-markets",
                  title: `${unit} markets on Morpho Blue`,
                  subtitle: `Every market that lends ${unit}`,
                  href: morphoLoanTokenHref(chainId, vault.asset.address),
                  internal: true,
                },
              ],
            }}
          />
        </Tile>

        {/* The two protects sections render as one fragment: one wide tile,
            split in two from lg by the same 1px-gap hairline. */}
        <Tile id="risk" wide flush>
          <div className="grid grid-cols-1 gap-px lg:grid-cols-2 [&>section]:bg-background [&>section]:!p-5">
            <VaultProtects
              chainId={chainId}
              block={protects?.block ?? 0}
              vaultName={name}
              protects={protects?.protects ?? null}
              underneath={protects?.underneath ?? null}
            />
          </div>
        </Tile>

        <Tile id="addresses" wide>
          <ProvSection scope="mock-addresses" data-mock-section="addresses">
            <SectionHeading
              title="Roles and addresses"
              stamp={configStamp(
                protects?.block ?? null,
                "The roles",
                "owner(), curator(), guardian(), feeRecipient()",
              )}
              menu={<SectionMenu scope="mock-addresses" title="Roles and addresses" />}
            >
              <p className="mt-1 text-[13px] text-rb-500">
                {chain.name}, chain id {chainId}
              </p>
            </SectionHeading>
            <div className="mt-3 grid grid-cols-1 gap-x-8 lg:grid-cols-2" data-prov-exempt="">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-rb-500">Roles</h3>
                <ul className="mt-1 border-t border-rb-200 dark:border-rb-500/30">
                  <AddressRow
                    id="owner"
                    label="Owner"
                    sub="sets the curator, the guardian and the fee"
                    address={vault.owner}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                  <AddressRow
                    id="curator"
                    label="Curator"
                    sub="chooses the markets and their caps"
                    address={vault.curator}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                  <AddressRow
                    id="guardian"
                    label="Guardian"
                    sub="can cancel a change while it waits"
                    address={protects ? protects.guardian : null}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                  <AddressRow
                    id="fee-recipient"
                    label="Fee recipient"
                    sub="receives the performance fee"
                    address={config.feeRecipient && !ZERO.test(config.feeRecipient) ? config.feeRecipient : null}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                </ul>
                <p className="mt-2 text-xs text-rb-500">Allocators are not listed here.</p>
              </div>
              <div className="mt-4 min-w-0 lg:mt-0">
                <h3 className="text-xs font-semibold text-rb-500">Contracts</h3>
                <ul className="mt-1 border-t border-rb-200 dark:border-rb-500/30">
                  <AddressRow
                    id="vault"
                    label="Vault"
                    sub={name}
                    address={vault.address}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                  <AddressRow
                    id="asset"
                    label="Asset"
                    sub={unit}
                    address={vault.asset.address}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                  {v.assetScale && (
                    <AddressRow
                      id="wraps"
                      label="What the asset wraps"
                      sub={`${v.assetScale.wraps.symbol}, ${unit}'s asset(), ${v.assetScale.wraps.decimals} decimals`}
                      address={v.assetScale.wraps.address}
                      explorer={chain.explorerName}
                      href={addr}
                    />
                  )}
                  <AddressRow
                    id="morpho-blue"
                    label="Morpho Blue"
                    sub="the lending protocol"
                    address={vault.morpho}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                </ul>
              </div>
            </div>
          </ProvSection>
        </Tile>
      </div>
    </ProvReceiptsScope>
  );
}

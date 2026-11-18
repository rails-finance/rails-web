"use client";

// The sBOLD vault's page (rails-ops ui-jobs 749), on the Yearn vault page's
// shell (components/vaults/yearn-vault-page.tsx): the vault card (V2), then the
// grid (V13): the last 30 days (V5), three daily lines read from the chain
// (lib/sources/chain/sbold-daily.ts); where the assets are (V3), the three
// Stability Pool deposits and the idle BOLD, reconciled against total assets.
// One block's read (lib/sources/chain/sbold-vault.ts); every figure carries
// its receipt (lib/liquity-v2/sbold-provenance.ts).

import { serverReadOf } from "@/lib/shared/server-head-read";
import { ProvReceiptsScope, Prov, useReceiptRegistry } from "@/components/shared/provenance";
import { readStampProv, SectionReadStamp } from "@/components/shared/read-stamp";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import type { PositionPanelRow } from "@/components/shared/position-card-panel";
import { NotLoaded } from "@/components/shared/not-loaded";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { VaultCard, type VaultMenuLink } from "@/components/vaults/vault-card";
import { VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { Tile } from "@/components/shared/tile-grid";
import { VAULT_CARD_TILE, VAULT_GRID } from "@/components/vaults/vault-tiles";
import { Sparkline, STRIP_SCOPE } from "@/components/vaults/vault-strip";
import { vaultHeads } from "@/components/vaults/vault-heads";
import type { PositionCardHead } from "@/components/shared/position-card";
import { explorerUrl } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { formatUnitsExact } from "@/lib/utils/format";
import { assetText, pctText, sharePriceText, shareText, shortAddress } from "@/lib/shared/vault-amount-text";
import { sboldVaultPageSummary } from "@/lib/vaults/summary";
import { vaultVenueShareProv } from "@/lib/vaults/card-provenance";
import { vaultAssetsExports, vaultPointsCsv, type VaultExportModel } from "@/lib/vaults/card-export";
import { SHARES_ISSUED_TIP, sboldVaultAssetsContent, sboldVaultCardContent } from "@/lib/vaults/card-words";
import { SBOLD_ASSET, SBOLD_CREATED_BLOCK, SBOLD_DEPOSITS_HREF, SBOLD_VAULT } from "@/lib/liquity-v2/sbold";
import { engineeringParts, perShareText } from "@/lib/liquity-v2/sbold-per-share";
import { liquityV2DepositHref } from "@/lib/liquity-v2/sp-routes";
import {
  sboldAssetProv,
  sboldBlockProv,
  sboldDepositProv,
  sboldIdleProv,
  sboldNameProv,
  sboldPerShareProv,
  sboldPointProv,
  sboldReconcileProv,
  sboldSharePriceProv,
  sboldTotalAssetsProv,
  sboldTotalSupplyProv,
  type SboldCoords,
  type SboldSeriesKey,
} from "@/lib/liquity-v2/sbold-provenance";
import type { SboldVaultResponse } from "@/lib/sources/chain/sbold-vault";
import type { SboldSeries } from "@/lib/sources/chain/sbold-daily";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";

const CHAIN_ID = 1;
const n = (v: number) => v.toLocaleString("en-US");
const eth = (kind: "address" | "block", v: string | number) => explorerUrl(CHAIN_ID, kind, v);
const UNREAD = <NotLoaded className="text-base font-normal text-rb-500" />;

const fraction = (part: RawAmount | null, total: RawAmount | null): number | null =>
  part && total && BigInt(total.raw) > BigInt(0)
    ? Number((BigInt(part.raw) * BigInt(1e9)) / BigInt(total.raw)) / 1e9
    : null;

/** A share count: the full figure up to twelve integer digits, else
 *  "43.72 × 10¹⁸" with the full raw integer in its title. */
function SharesFace({ raw, decimals }: { raw: string; decimals: number }) {
  const e = engineeringParts(raw, decimals);
  const exact = formatUnitsExact(raw, decimals);
  if (e == null)
    return <span data-figure-value="">{shareText({ raw, value: Number(raw) / 10 ** decimals }, decimals)}</span>;
  return (
    <span data-figure-value="" data-prov-exact={exact} title={`${exact} shares (raw ${raw})`}>
      {e.mantissa} × 10<sup>{e.exponent}</sup>
    </span>
  );
}

/** A share price as the getter answers it: "0" where it answers zero. */
const priceText = (raw: string) =>
  BigInt(raw) === BigInt(0) ? "0" : sharePriceText({ raw, value: Number(raw) / 1e18 }, 18);

const pointText = (key: SboldSeriesKey, raw: string): string =>
  key === "totalAssets"
    ? `${assetText({ raw, value: Number(raw) / 1e18 }, 18)} BOLD`
    : key === "sharePrice"
      ? `${priceText(raw)} BOLD per share`
      : (() => {
          const e = engineeringParts(raw, 18);
          return e
            ? `${e.mantissa} × 10^${e.exponent} shares`
            : `${shareText({ raw, value: Number(raw) / 1e18 }, 18)} shares`;
        })();

const DAY_S = 86_400;
/** A day's point: its date. A block's point: its date and UTC time. */
const whenText = (p: { time: number; day?: number }) =>
  p.day != null
    ? formatDate(new Date(p.day * DAY_S * 1000))
    : `${formatDate(new Date(p.time * 1000))}, ${new Date(p.time * 1000).toISOString().slice(11, 16)} UTC`;

const SERIES_CALL: Record<SboldSeriesKey, string> = {
  totalAssets: "totalAssets()",
  totalSupply: "totalSupply()",
  sharePrice: "convertToAssets(10 ** 18)",
};

/** The last 30 days (V5), the strip's title and window (lib/vaults/yield.ts):
 *  one tile per getter, its line over the days' last blocks, blocks
 *  26,441,800 and 26,442,100, and the head read, each point placed at its
 *  block time with its receipt (ui-jobs 749). A failed read is a gap. */
function SboldDailyLines({ series }: { series: SboldSeries | null }) {
  const tiles: { key: SboldSeriesKey; tile: string; label: string }[] = [
    { key: "totalAssets", tile: "total-assets", label: "Total assets" },
    { key: "totalSupply", tile: "total-supply", label: "Shares issued" },
    { key: "sharePrice", tile: "share-price", label: "Share price" },
  ];
  const csvRows = (series?.points ?? []).flatMap((p) =>
    tiles.flatMap((t) => {
      const raw = p[t.key];
      return raw == null
        ? []
        : [{ block: p.block, time: p.time, getter: SERIES_CALL[t.key], raw, value: pointText(t.key, raw) }];
    }),
  );
  return (
    <ProvSection
      scope={STRIP_SCOPE}
      className="mb-4"
      data-anatomy="V5"
      data-vault-strip={SBOLD_VAULT}
      data-skel-section="vault-strip"
      data-series-headers={series?.cost.headers ?? ""}
      data-series-multicalls={series?.cost.multicalls ?? ""}
    >
      <SectionHeading
        title="The last 30 days"
        menu={
          <SectionMenu
            scope={STRIP_SCOPE}
            title="The last 30 days"
            exports={
              csvRows.length > 0
                ? {
                    csv: {
                      filename: `sBOLD-last-30-days-${csvRows[csvRows.length - 1].block}.csv`,
                      build: () => vaultPointsCsv(csvRows),
                      subtitle: "One row per point and getter: block, UTC time, raw answer",
                    },
                  }
                : undefined
            }
          />
        }
      />
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => {
          const pts = (series?.points ?? []).flatMap((p) => {
            const raw = p[t.key];
            return raw == null ? [] : [{ ...p, raw }];
          });
          const first = pts[0];
          const last = pts[pts.length - 1];
          const prov = (p: (typeof pts)[number]) =>
            sboldPointProv(t.key, {
              block: p.block,
              time: p.time,
              raw: p.raw,
              day: p.day,
              text: pointText(t.key, p.raw),
            });
          return (
            <div
              key={t.tile}
              className="min-w-0 rounded-xl border border-rb-200 px-3 py-2.5 dark:border-rb-500/30"
              data-strip-tile={t.tile}
              data-strip-points={pts.map((p) => p.block).join(",")}
            >
              <div className="text-xs font-semibold text-rb-500">{t.label}</div>
              {first && last && first !== last ? (
                <>
                  <p className="mt-1 text-[13px] text-foreground" data-strip-sentence="">
                    <Prov info={prov(first)}>{pointText(t.key, first.raw)}</Prov> on {whenText(first)} to{" "}
                    <Prov info={prov(last)}>{pointText(t.key, last.raw)}</Prov> at block {n(last.block)}
                  </p>
                  <Sparkline
                    points={pts.map((p) => ({ day: p.time / DAY_S, block: p.block, raw: p.raw }))}
                    label={`${t.label}, one read at each day's last block over the last 30 days, then block${
                      pts.filter((p) => p.day == null).length === 1 ? "" : "s"
                    } ${pts
                      .filter((p) => p.day == null)
                      .map((p) => n(p.block))
                      .join(", ")}`}
                    dot={(r) => {
                      const p = pts.find((x) => x.block === r.block)!;
                      return (
                        <Prov info={prov(p)} value={pointText(t.key, p.raw)}>
                          <span
                            className={`block rounded-full ${p.day == null ? "h-2 w-2 bg-foreground" : "h-1.5 w-1.5 bg-blue-500"}`}
                            title={`Block ${n(p.block)}, ${whenText(p)}: ${pointText(t.key, p.raw)}`}
                            data-strip-point={p.block}
                          />
                        </Prov>
                      );
                    }}
                  />
                </>
              ) : (
                <p className="mt-1 text-[13px] text-rb-500" data-strip-sentence="" data-strip-none="unread">
                  daily series not read
                </p>
              )}
            </div>
          );
        })}
      </div>
    </ProvSection>
  );
}

export function SboldVaultPage({ data, series }: { data: SboldVaultResponse; series: SboldSeries | null }) {
  const registry = useReceiptRegistry();
  const y = data.vault;
  const v = sboldVaultPageSummary(data, SBOLD_ASSET, SBOLD_CREATED_BLOCK);
  const unit = SBOLD_ASSET.symbol;
  const ad = SBOLD_ASSET.decimals;
  const asset = { symbol: unit, address: SBOLD_ASSET.address };
  const coords: SboldCoords = { readBy: serverReadOf(data), blockNumber: data.blockNumber || undefined };
  const fig = (name: string, raw: string | undefined, value: React.ReactNode) => (
    <span data-cell={name} data-raw={raw ?? ""}>
      {value}
    </span>
  );

  // Beside the share price (convertToAssets of one share), the ratio of the two
  // getters, to four significant digits (ui-jobs 749).
  const perShare =
    y.totalAssets && y.totalSupply && y.shareDecimals != null
      ? perShareText(y.totalAssets.raw, y.totalSupply.raw, ad, y.shareDecimals)
      : null;

  const stats: PositionPanelRow[] = [
    {
      id: "shares-issued",
      label: "Shares issued",
      tip: SHARES_ISSUED_TIP,
      sub: y.symbol ?? undefined,
      value: fig(
        "total-supply",
        y.totalSupply?.raw,
        y.totalSupply && y.shareDecimals != null ? (
          <Prov info={sboldTotalSupplyProv(coords, y.totalSupply.raw, y.shareDecimals)}>
            <SharesFace raw={y.totalSupply.raw} decimals={y.shareDecimals} />
          </Prov>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "per-share",
      label: "Total assets ÷ shares issued",
      sub: "BOLD per share",
      tip: "The vault's totalAssets() divided by its totalSupply(), both read at the page's block.",
      value: fig(
        "per-share",
        undefined,
        perShare != null && y.totalAssets && y.totalSupply && y.shareDecimals != null ? (
          <span className="break-all" data-figure-value="">
            <Prov
              info={sboldPerShareProv(coords, {
                assets: assetText(y.totalAssets, ad),
                supply: shareText(y.totalSupply, y.shareDecimals),
                assetsRaw: y.totalAssets.raw,
                supplyRaw: y.totalSupply.raw,
                ratio: perShare,
              })}
            >
              {perShare}
            </Prov>
          </span>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "asset",
      label: "Asset",
      tip: "The token the vault's asset() names.",
      sub: y.asset === SBOLD_ASSET.address ? unit : undefined,
      value: fig(
        "asset",
        undefined,
        y.asset ? (
          <span className="font-mono text-sm" data-vault-asset-read={y.asset}>
            <Prov info={sboldAssetProv(coords)}>{shortAddress(y.asset)}</Prov>
          </span>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "read-block",
      label: "Block",
      tip: "The block every figure on this page was read at.",
      value: fig(
        "read-block",
        String(data.blockNumber),
        <a
          href={eth("block", data.blockNumber)}
          target="_blank"
          rel="noopener"
          className="link-external"
          data-read-block-link={data.blockNumber}
        >
          <Prov info={sboldBlockProv(coords)}>{n(data.blockNumber)}</Prov>
        </a>,
      ),
    },
  ];

  const depositRows: VaultAssetRow[] = data.deposits.map((d) => {
    const venue = `${d.branch} Stability Pool`;
    return {
      key: d.branch,
      venue,
      href: liquityV2DepositHref(d.branch, y.address),
      sub: <span className="font-mono">{shortAddress(d.pool)}</span>,
      amount: d.compounded,
      amountProv: sboldDepositProv(coords, d.branch, d.pool),
      share: fraction(d.compounded, y.totalAssets),
      shareProv: vaultVenueShareProv(v, `the ${venue} deposit`, "totalAssets()", coords.readBy),
      hooks: { "data-sp-branch": d.branch, "data-sp-pool": d.pool, "data-deposit-raw": d.compounded?.raw ?? "" },
    };
  });
  const rows: VaultAssetRow[] = [
    ...depositRows,
    {
      key: "idle",
      venue: "Idle BOLD in the vault",
      sub: <span className="font-mono">balanceOf on {shortAddress(SBOLD_ASSET.address)}</span>,
      amount: data.idle,
      amountProv: sboldIdleProv(coords),
      share: fraction(data.idle, y.totalAssets),
      shareProv: vaultVenueShareProv(v, "the vault's BOLD balance", "totalAssets()", coords.readBy),
      hooks: { "data-idle": "vault", "data-idle-raw": data.idle?.raw ?? "" },
    },
  ];

  // The three deposits and the idle BOLD against totalAssets() (ui-jobs 749):
  // stated where all five getters answered.
  const parts = [...data.deposits.map((d) => d.compounded), data.idle];
  const reconcile =
    y.totalAssets && parts.every((p) => p != null)
      ? (() => {
          const sum = parts.reduce((t, p) => t + BigInt(p!.raw), BigInt(0));
          const diff = BigInt(y.totalAssets.raw) - sum;
          const amt = (raw: bigint) => assetText({ raw: raw.toString(), value: Number(raw) / 1e18 }, ad);
          return {
            sum,
            diff,
            text: amt,
            prov: sboldReconcileProv(coords, {
              deposits: data.deposits.map((d) => ({ branch: d.branch, pool: d.pool, raw: d.compounded!.raw })),
              idleRaw: data.idle!.raw,
              totalRaw: y.totalAssets.raw,
              sumRaw: sum.toString(),
              diffRaw: diff.toString(),
            }),
          };
        })()
      : null;

  const links: VaultMenuLink[] = [
    {
      item: "sp-deposits",
      title: "Stability Pool deposits",
      subtitle: "The vault's three deposits in the listing",
      href: SBOLD_DEPOSITS_HREF,
    },
    {
      item: "vault-contract",
      title: "Vault contract",
      subtitle: `${shortAddress(y.address)} on Etherscan`,
      href: eth("address", y.address),
    },
    {
      item: "created",
      title: "First code",
      subtitle: `Block ${n(SBOLD_CREATED_BLOCK)} on Etherscan`,
      href: eth("block", SBOLD_CREATED_BLOCK),
    },
    {
      item: "read-block",
      title: "Read block",
      subtitle: `Block ${n(data.blockNumber)} on Etherscan`,
      href: eth("block", data.blockNumber),
    },
  ];

  const explanation = (
    <div data-vault-explanation="">
      <ExplainGroup title="Holdings">
        <ExplainBullet>
          At block <Fig>{n(data.blockNumber)}</Fig> the vault reports{" "}
          <Fig>{y.totalAssets ? `${assetText(y.totalAssets, ad)} ${unit}` : "an unread amount"}</Fig> of total assets.
        </ExplainBullet>
        {data.deposits.map((d) => (
          <ExplainBullet key={d.branch}>
            The {d.branch} Stability Pool credits it{" "}
            <Fig>{d.compounded ? `${assetText(d.compounded, ad)} ${unit}` : "an unread amount"}</Fig>.
          </ExplainBullet>
        ))}
      </ExplainGroup>
      {/* Blocks 26,441,800 and 26,442,100 stay here when the strip's window has passed them (ui-jobs 749). */}
      {series && series.marked.length > 0 && (
        <ExplainGroup title="Earlier reads">
          {series.marked.map((p) => (
            <ExplainBullet key={p.block} data-sbold-marked={p.block}>
              At block <Fig>{n(p.block)}</Fig> ({whenText(p)}):{" "}
              {(["totalAssets", "totalSupply", "sharePrice"] as const).map((k, i) => {
                const raw = p[k];
                const label =
                  k === "totalAssets" ? "total assets" : k === "totalSupply" ? "shares issued" : "share price";
                return (
                  <span key={k}>
                    {i > 0 ? "; " : ""}
                    {label}{" "}
                    {raw == null ? (
                      "not read"
                    ) : (
                      <Prov info={sboldPointProv(k, { block: p.block, time: p.time, raw, text: pointText(k, raw) })}>
                        <Fig>{pointText(k, raw)}</Fig>
                      </Prov>
                    )}
                  </span>
                );
              })}
              .
            </ExplainBullet>
          ))}
        </ExplainGroup>
      )}
    </div>
  );

  // Total assets and Share price only: the figures this page reads. A share
  // price of zero reads "0" (ui-jobs 749).
  const receipts = {
    name: sboldNameProv(coords),
    totalAssets: sboldTotalAssetsProv(coords),
    sharePrice: sboldSharePriceProv(coords),
  };
  const heads: PositionCardHead[] = vaultHeads({ vault: v, holdersHref: null, receipts, detail: true })
    .filter((h) => h.id === "total-assets" || h.id === "share-price")
    .map((h) =>
      h.id === "share-price" && y.sharePrice && BigInt(y.sharePrice.raw) === BigInt(0)
        ? {
            ...h,
            value: (
              <span data-cell="share-price" data-figure="share-price" data-raw="0">
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                  <span data-figure-value="" data-prov-exact="0" data-prov-symbol={unit}>
                    <Prov info={receipts.sharePrice}>0</Prov>
                  </span>
                  <span className="text-[0.5em] font-medium text-rb-500">{unit}</span>
                </span>
              </span>
            ),
          }
        : h,
    );

  const exportModel: VaultExportModel = {
    stats: [
      [
        "Shares issued",
        y.totalSupply && y.shareDecimals != null ? shareText(y.totalSupply, y.shareDecimals) : "not read",
      ],
      ["Total assets ÷ shares issued (BOLD per share)", perShare ?? "not read"],
      ["Asset", y.asset ?? "not read"],
      ["Block", String(data.blockNumber)],
    ],
    rows: rows.map((r) => [
      `${r.venue as string} ${data.deposits.find((d) => d.branch === r.key)?.pool ?? ""}`.trim(),
      r.amount ? assetText(r.amount, ad) : "not read",
      r.share == null ? "" : pctText(r.share),
    ]),
  };

  return (
    <ProvReceiptsScope registry={registry}>
      <Tile id="summary" flush>
        <div className={VAULT_CARD_TILE}>
          <VaultCard
            vault={v}
            holdersHref={null}
            receipts={receipts}
            heads={heads}
            status={null}
            stats={stats}
            links={links}
            explanation={explanation}
            learnMore={sboldVaultCardContent()}
            stamp={
              <SectionReadStamp
                chainId={CHAIN_ID}
                block={data.blockNumber}
                readBy={coords.readBy}
                info={(at) =>
                  readStampProv({
                    chainId: CHAIN_ID,
                    block: data.blockNumber,
                    at,
                    readBy: coords.readBy,
                    what: "Every figure on this card and in where the assets are",
                    contracts: [
                      {
                        name: "sBOLD vault",
                        address: y.address,
                        reads:
                          "totalAssets(), totalSupply(), convertToAssets(10 ** 18), asset(), name(), symbol(), decimals()",
                      },
                      { name: "BOLD", address: SBOLD_ASSET.address, reads: "balanceOf(sBOLD)" },
                      ...data.deposits.map((d) => ({
                        name: `Liquity V2 ${d.branch} Stability Pool`,
                        address: d.pool,
                        reads: "getCompoundedBoldDeposit(sBOLD)",
                      })),
                    ],
                  })
                }
              />
            }
            exports={exportModel}
          />
        </div>
      </Tile>

      <div className={VAULT_GRID} data-vault-grid="" data-anatomy="V13">
        <Tile id="last-30-days" wide>
          <SboldDailyLines series={series} />
        </Tile>

        <Tile id="allocation" wide last>
          <VaultAssets
            rows={rows}
            assetSymbol={unit}
            assetAddress={asset.address}
            assetDecimals={ad}
            chart={null}
            line="The vault's deposit in each of Liquity V2's three Stability Pools, and its BOLD balance."
            shareTip="The row's amount over the vault's total assets."
            learnMore={sboldVaultAssetsContent()}
            menu={{ exports: vaultAssetsExports(v, exportModel) }}
          />
          {reconcile && (
            <p
              className="mt-3 text-[13px] text-rb-500"
              data-reconcile-sum={reconcile.sum.toString()}
              data-reconcile-diff={reconcile.diff.toString()}
            >
              {reconcile.diff === BigInt(0) ? (
                <>
                  The three deposits and the idle BOLD sum to total assets,{" "}
                  <Prov info={reconcile.prov}>{reconcile.text(reconcile.sum)}</Prov> {unit}.
                </>
              ) : (
                <>
                  The three deposits and the idle BOLD sum to{" "}
                  <Prov info={reconcile.prov}>{reconcile.text(reconcile.sum)}</Prov> {unit}; total assets are{" "}
                  <Prov info={sboldTotalAssetsProv(coords)}>{assetText(y.totalAssets!, ad)}</Prov> {unit},{" "}
                  <Prov info={reconcile.prov}>
                    {reconcile.text(reconcile.diff < BigInt(0) ? -reconcile.diff : reconcile.diff)}
                  </Prov>{" "}
                  {unit} {reconcile.diff > BigInt(0) ? "above" : "below"} the sum.
                </>
              )}
            </p>
          )}
        </Tile>
      </div>
    </ProvReceiptsScope>
  );
}

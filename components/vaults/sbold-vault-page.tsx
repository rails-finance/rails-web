"use client";

// The sBOLD vault's page (rails-ops ui-jobs 749), on the Yearn vault page's
// shell (components/vaults/yearn-vault-page.tsx): the vault card (V2), then the
// grid (V13): the daily lines' slot (V5), empty until the history source is
// decided; where the assets are (V3), the three Stability Pool deposits. One
// block's read (lib/sources/chain/sbold-vault.ts); every figure carries its
// receipt (lib/liquity-v2/sbold-provenance.ts).

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
import { STRIP_SCOPE } from "@/components/vaults/vault-strip";
import { StatAmount } from "@/components/vaults/stat-amount";
import { explorerUrl } from "@/lib/shared/chains";
import { assetText, pctText, shareText, shortAddress } from "@/lib/shared/vault-amount-text";
import { sboldVaultPageSummary } from "@/lib/vaults/summary";
import { vaultVenueShareProv } from "@/lib/vaults/card-provenance";
import { vaultAssetsExports, type VaultExportModel } from "@/lib/vaults/card-export";
import { SHARES_ISSUED_TIP, sboldVaultAssetsContent, sboldVaultCardContent } from "@/lib/vaults/card-words";
import { SBOLD_ASSET, SBOLD_CREATED_BLOCK, SBOLD_HREF } from "@/lib/liquity-v2/sbold";
import { perShareText } from "@/lib/liquity-v2/sbold-per-share";
import { liquityV2DepositHref } from "@/lib/liquity-v2/sp-routes";
import {
  sboldAssetProv,
  sboldBlockProv,
  sboldDepositProv,
  sboldNameProv,
  sboldPerShareProv,
  sboldSharePriceProv,
  sboldTotalAssetsProv,
  sboldTotalSupplyProv,
  type SboldCoords,
} from "@/lib/liquity-v2/sbold-provenance";
import type { SboldVaultResponse } from "@/lib/sources/chain/sbold-vault";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";

const CHAIN_ID = 1;
const n = (v: number) => v.toLocaleString("en-US");
const eth = (kind: "address" | "block", v: string | number) => explorerUrl(CHAIN_ID, kind, v);
const UNREAD = <NotLoaded className="text-base font-normal text-rb-500" />;

const fraction = (part: RawAmount | null, total: RawAmount | null): number | null =>
  part && total && BigInt(total.raw) > BigInt(0)
    ? Number((BigInt(part.raw) * BigInt(1e9)) / BigInt(total.raw)) / 1e9
    : null;

/** The daily lines' slot (V5): one tile per series, each empty until the
 *  history source is decided (ui-jobs 749). */
function SboldDailyLines() {
  const tiles = [
    { tile: "total-assets", label: "Total assets" },
    { tile: "total-supply", label: "Shares issued" },
    { tile: "share-price", label: "Share price" },
  ];
  return (
    <ProvSection scope={STRIP_SCOPE} className="mb-4" data-anatomy="V5" data-skel-section="vault-strip">
      <SectionHeading title="The last 30 days" menu={<SectionMenu scope={STRIP_SCOPE} title="The last 30 days" />} />
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div
            key={t.tile}
            className="min-w-0 rounded-xl border border-rb-200 px-3 py-2.5 dark:border-rb-500/30"
            data-strip-tile={t.tile}
          >
            <div className="text-xs font-semibold text-rb-500">{t.label}</div>
            <p className="mt-1 text-[13px] text-rb-500" data-strip-sentence="" data-strip-none="no-series">
              no daily series yet
            </p>
          </div>
        ))}
      </div>
    </ProvSection>
  );
}

export function SboldVaultPage({ data }: { data: SboldVaultResponse }) {
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
          <Prov info={sboldTotalSupplyProv(coords)}>
            <StatAmount amount={y.totalSupply} decimals={y.shareDecimals} shares />
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

  const rows: VaultAssetRow[] = data.deposits.map((d) => {
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

  const links: VaultMenuLink[] = [
    {
      item: "sp-deposits",
      title: "Stability Pool deposits",
      subtitle: "The vault's three deposits in the listing",
      href: SBOLD_HREF,
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
    </div>
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
            receipts={{
              name: sboldNameProv(coords),
              totalAssets: sboldTotalAssetsProv(coords),
              sharePrice: sboldSharePriceProv(coords),
            }}
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
          <SboldDailyLines />
        </Tile>

        <Tile id="allocation" wide last>
          <VaultAssets
            rows={rows}
            assetSymbol={unit}
            assetAddress={asset.address}
            assetDecimals={ad}
            chart={null}
            line="The vault's deposit in each of Liquity V2's three Stability Pools."
            shareTip="The row's amount over the vault's total assets."
            learnMore={sboldVaultAssetsContent()}
            menu={{ exports: vaultAssetsExports(v, exportModel) }}
          />
        </Tile>
      </div>
    </ProvReceiptsScope>
  );
}

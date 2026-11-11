"use client";

// One Yearn V3 vault's page on Ethereum (rails-ops ui-jobs 407; the grid of
// tiles, ui-jobs 584): the holder finder (V4), the vault card (V2), then the
// grid (components/vaults/vault-tiles.tsx): the last 30 days (V5); where the
// assets are (V3) | who holds it (V11); what protects it (V9) | the protocol
// underneath (V10), streamed by the route; configuration and addresses (V12);
// the colour note at the foot. One block's read of the vault and of the Yearn
// V3 Registry (lib/sources/chain/yearn-ethereum-vault.ts); Holders and Who
// holds it are the census's, Yield the daily store's.

import { serverReadOf } from "@/lib/shared/server-head-read";
import { ProvReceiptsScope, Prov, useReceiptRegistry } from "@/components/shared/provenance";
import { readStampProv, SectionReadStamp, useBlockTime } from "@/components/shared/read-stamp";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import type { PositionPanelRow } from "@/components/shared/position-card-panel";
import { NotLoaded } from "@/components/shared/not-loaded";
import { CreatedBullet, VaultCard, YieldBullets, type VaultMenuLink } from "@/components/vaults/vault-card";
import { ALLOCATION_SCOPE, allocationBar, VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { ColourNote, RULE, Tile, VAULT_CARD_TILE, VAULT_GRID } from "@/components/vaults/vault-tiles";
import { HOLDERS_SCOPE, VaultWhoHolds } from "@/components/vaults/vault-who-holds";
import { VaultConfiguration } from "@/components/vaults/vault-config";
import { yearnConfigTile } from "@/components/vaults/vault-config-columns";
import { yearnVaultHref } from "@/lib/vaults/routes";
import type { VaultHolders } from "@/lib/vaults/holders-read";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import { VaultFinder } from "@/components/vaults/vault-finder";
import { VaultStrip } from "@/components/vaults/vault-strip";
import type { VaultStripSeries } from "@/lib/vaults/yield-read";
import { explorerUrl } from "@/lib/shared/chains";
import { assetText, pctText, shareText, shortAddress } from "@/lib/shared/vault-amount-text";
import { StatAmount } from "@/components/vaults/stat-amount";
import { yearnVaultPageSummary } from "@/lib/vaults/summary";
import { vaultVenueProv, vaultVenueShareProv } from "@/lib/vaults/card-provenance";
import { vaultAssetsExports, type VaultExportModel } from "@/lib/vaults/card-export";
import { YEARN_REGISTRY } from "@/lib/yearn/vault-catalog";
import {
  SHARES_ISSUED_TIP,
  STEWARD_TIP,
  yearnVaultAssetsContent,
  yearnVaultCardContent,
} from "@/lib/vaults/card-words";
import { measuredYield, type VaultYield } from "@/lib/vaults/yield";
import {
  yearnVaultDebtProv,
  yearnVaultEndorsedProv,
  yearnVaultIdleProv,
  yearnVaultNameProv,
  yearnVaultQueueProv,
  yearnVaultRoleProv,
  yearnVaultSharePriceProv,
  yearnVaultShutdownProv,
  yearnVaultStrategyCapProv,
  yearnVaultStrategyDebtProv,
  yearnVaultTotalAssetsProv,
  yearnVaultTotalSupplyProv,
  yearnVaultUnlockProv,
  type YearnVaultCoords,
} from "@/lib/yearn/vault-provenance";
import type { YearnVaultResponse } from "@/lib/sources/chain/yearn-ethereum-vault";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";

const CHAIN_ID = 1;
const n = (v: number) => v.toLocaleString("en-US");
const eth = (kind: "address" | "block", v: string | number) => explorerUrl(CHAIN_ID, kind, v);
/** A strategy's cap at uint256's top: the role manager set none. */
const MAX_UINT = (BigInt(1) << BigInt(256)) - BigInt(1);
const UNREAD = <NotLoaded className="text-base font-normal text-rb-500" />;

/** A span of seconds in a reader's words: whole days, else whole hours. */
function spanWords(seconds: number): string {
  if (seconds === 0) return "none";
  const days = seconds / 86400;
  if (Number.isInteger(days)) return days === 1 ? "1 day" : `${n(days)} days`;
  const hours = seconds / 3600;
  if (Number.isInteger(hours)) return hours === 1 ? "1 hour" : `${n(hours)} hours`;
  return `${n(seconds)} seconds`;
}

const fraction = (part: RawAmount | null, total: RawAmount | null): number | null =>
  part && total && BigInt(total.raw) > BigInt(0)
    ? Number((BigInt(part.raw) * BigInt(1e9)) / BigInt(total.raw)) / 1e9
    : null;

export function YearnVaultPage({
  protects,
  data,
  yieldFigure: storeYield,
  strip,
  strategyPages = {},
  census,
  holders,
}: {
  /** "What protects it" and "The protocol underneath" (V9, V10), streamed by the route. */
  protects?: React.ReactNode;
  data: YearnVaultResponse;
  /** Rails's page for each strategy that is a roster vault (a Yearn V3 vault,
   *  a MetaMorpho vault on Ethereum), by lowercased address. */
  strategyPages?: Record<string, string>;
  yieldFigure?: VaultYield;
  /** The store's three daily series for the strip (V5); null where it did not answer. */
  strip: VaultStripSeries | null;
  /** The census's row for the vault: the Holders headline; null where it did not answer. */
  census: VaultCensusRow | null;
  /** Who holds it: the census's largest holders; null where it did not answer. */
  holders: VaultHolders | null;
}) {
  const registry = useReceiptRegistry();
  const y = data.vault;
  const createdAt = useBlockTime(CHAIN_ID, y.createdBlock > 0 ? y.createdBlock : null);
  const v = yearnVaultPageSummary(data, census);
  // A figure on total assets under the dust floor is too small to measure (ui-jobs 542).
  const yieldFigure = measuredYield(storeYield, v.totalAssets?.raw);
  const unit = y.asset.symbol;
  const ad = y.asset.decimals;
  const asset = { symbol: unit, address: y.asset.address };
  const coords: YearnVaultCoords = {
    readBy: serverReadOf(data),
    blockNumber: data.blockNumber || undefined,
    vault: y.address,
    vaultName: y.name ?? y.censusName,
    assetSymbol: unit,
    apiVersion: y.apiVersion,
  };
  const fig = (name: string, raw: string | undefined, value: React.ReactNode) => (
    <span data-cell={name} data-raw={raw ?? ""}>
      {value}
    </span>
  );
  // The short address alone: each role's explorer page is a row of the ⋮.
  const address = (a: string, role: "role manager" | "accountant") => (
    <span className="font-mono text-sm">
      <Prov info={yearnVaultRoleProv(coords, role)}>{shortAddress(a)}</Prov>
    </span>
  );

  const stats: PositionPanelRow[] = [
    {
      id: "shares-issued",
      label: "Shares issued",
      tip: SHARES_ISSUED_TIP,
      sub: y.symbol ?? undefined,
      value: fig(
        "total-supply",
        y.totalSupply?.raw,
        y.totalSupply ? (
          <Prov info={yearnVaultTotalSupplyProv(coords)}>
            <StatAmount amount={y.totalSupply} decimals={y.shareDecimals ?? ad} shares />
          </Prov>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "idle",
      label: "Idle",
      tip: "The part of the vault's assets held in the vault contract, which a withdrawal takes first.",
      asset,
      value: fig(
        "total-idle",
        y.totalIdle?.raw,
        y.totalIdle ? (
          <Prov info={yearnVaultIdleProv(coords)}>
            <StatAmount amount={y.totalIdle} decimals={ad} symbol={unit} />
          </Prov>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "deployed",
      label: "Deployed",
      tip: "What the vault records as lent to its strategies, updated when a strategy reports.",
      asset,
      value: fig(
        "total-debt",
        y.totalDebt?.raw,
        y.totalDebt ? (
          <Prov info={yearnVaultDebtProv(coords)}>
            <StatAmount amount={y.totalDebt} decimals={ad} symbol={unit} />
          </Prov>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "profit-unlock",
      label: "Profit unlock",
      tip: "How long a reported gain takes to reach the share price. A loss lands at once.",
      value: fig(
        "profit-unlock",
        undefined,
        y.profitMaxUnlockTime != null ? (
          <Prov info={yearnVaultUnlockProv(coords, y.profitMaxUnlockTime)}>{spanWords(y.profitMaxUnlockTime)}</Prov>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "steward",
      label: "Steward",
      sub: "role manager",
      tip: STEWARD_TIP.roleManager,
      value: fig(
        "role-manager",
        undefined,
        y.roleManager ? (
          <span data-steward={y.roleManager} data-steward-role="roleManager">
            {address(y.roleManager, "role manager")}
          </span>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "accountant",
      label: "Accountant",
      tip: "The contract that charges the vault's fees when a strategy reports.",
      value: fig(
        "accountant",
        undefined,
        y.accountant ? address(y.accountant, "accountant") : <span className="text-rb-500">none set</span>,
      ),
    },
  ];

  const queueDebt = data.strategies.reduce((acc, s) => acc + BigInt(s.currentDebt?.raw ?? "0"), BigInt(0));
  const outside = y.totalDebt == null ? null : BigInt(y.totalDebt.raw) - queueDebt;
  const amount = (raw: bigint): RawAmount => ({ raw: raw.toString(), value: Number(raw) / Math.pow(10, ad) });
  const rows: VaultAssetRow[] = [
    {
      key: "idle",
      venue: "Idle in the vault",
      sub: "taken first by a withdrawal",
      amount: y.totalIdle,
      amountProv: yearnVaultIdleProv(coords),
      share: fraction(y.totalIdle, y.totalAssets),
      shareProv: vaultVenueShareProv(v, "totalIdle()", "totalAssets()", coords.readBy),
      hooks: { "data-idle": "vault" },
    },
    ...data.strategies.map((s) => ({
      key: s.address,
      venue: s.name ?? shortAddress(s.address),
      ...(strategyPages[s.address.toLowerCase()] ? { href: strategyPages[s.address.toLowerCase()] } : {}),
      venueProv: vaultVenueProv(
        v,
        {
          venue: s.name ?? shortAddress(s.address),
          what: `the strategy at place ${s.position} of the vault's default queue, which the vault lends ${unit} to.`,
          via: "get_default_queue() · strategies(strategy)",
          contract: { name: s.name ?? "strategy", address: s.address },
          ids: [{ label: "strategy", value: s.address }],
        },
        coords.readBy,
      ),
      sub: (
        <>
          #{s.position} ·{" "}
          {s.maxDebt ? (
            <Prov info={yearnVaultStrategyCapProv(coords, s.address)}>
              {BigInt(s.maxDebt.raw) === MAX_UINT ? "no cap" : `cap ${assetText(s.maxDebt, ad)}`}
            </Prov>
          ) : (
            "cap not read"
          )}
        </>
      ),
      amount: s.currentDebt,
      amountProv: yearnVaultStrategyDebtProv(coords, s.address),
      share: fraction(s.currentDebt, y.totalAssets),
      shareProv: vaultVenueShareProv(v, "this strategy's current_debt", "totalAssets()", coords.readBy),
      hooks: {
        "data-strategy-row": s.address,
        "data-queue-position": String(s.position),
        "data-current-debt-raw": s.currentDebt?.raw ?? "",
      },
    })),
  ];
  if (outside != null && outside !== BigInt(0))
    rows.push({
      key: "outside-queue",
      venue: "Outside the queue",
      sub: "debt a strategy keeps until the vault pulls it back",
      amount: amount(outside),
      amountProv: yearnVaultDebtProv(coords),
      share: fraction(amount(outside), y.totalAssets),
      shareProv: vaultVenueShareProv(v, "totalDebt() less the queue's debt", "totalAssets()", coords.readBy),
      hooks: { "data-figure": "debt-outside-queue" },
    });

  const links: VaultMenuLink[] = [
    {
      item: "vault-contract",
      title: "Vault contract",
      subtitle: `${shortAddress(y.address)} on Etherscan`,
      href: eth("address", y.address),
    },
    {
      item: "factory",
      title: "Factory",
      subtitle: `Yearn V3 ${y.apiVersion} · ${shortAddress(y.factory)}`,
      href: eth("address", y.factory),
    },
    {
      item: "created",
      title: "Created",
      subtitle: `Block ${n(y.createdBlock)} on Etherscan`,
      href: eth("block", y.createdBlock),
    },
    ...(y.roleManager
      ? [
          {
            item: "steward",
            title: "Role manager on Etherscan",
            subtitle: shortAddress(y.roleManager),
            href: eth("address", y.roleManager),
          },
        ]
      : []),
    ...(y.accountant
      ? [
          {
            item: "accountant",
            title: "Accountant on Etherscan",
            subtitle: shortAddress(y.accountant),
            href: eth("address", y.accountant),
          },
        ]
      : []),
    { item: "venue-page", title: "On Yearn's site", subtitle: "yearn.fi", href: `https://yearn.fi/v3/1/${y.address}` },
    {
      item: "docs",
      title: "Yearn's documentation",
      subtitle: "docs.yearn.fi: Introduction",
      href: "https://docs.yearn.fi/getting-started/intro",
    },
  ];

  const explanation = (
    <div data-vault-explanation="">
      <ExplainGroup title="Holdings">
        <ExplainBullet>
          This vault holds <Fig>{y.totalAssets ? `${assetText(y.totalAssets, ad)} ${unit}` : "an unread amount"}</Fig>,
          lent to <Fig>{n(data.strategies.length)}</Fig> strategies apart from its idle balance.
        </ExplainBullet>
        {y.totalIdle && (
          <ExplainBullet>
            Idle{" "}
            <Fig>
              {assetText(y.totalIdle, ad)} {unit}
            </Fig>{" "}
            serves withdrawals before any strategy is touched.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Risk">
        {y.roleManager && (
          <ExplainBullet>
            The role manager <Fig>{shortAddress(y.roleManager)}</Fig> adds strategies, sets their caps and can shut the
            vault down.
          </ExplainBullet>
        )}
        <ExplainBullet>A strategy&rsquo;s reported loss lowers the share price at once.</ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Rate">
        {y.profitMaxUnlockTime != null && (
          <ExplainBullet>
            A reported gain reaches the share price over <Fig>{spanWords(y.profitMaxUnlockTime)}</Fig>.
          </ExplainBullet>
        )}
        <YieldBullets yieldFigure={yieldFigure} rewards="gauge rewards paid outside the share" />
      </ExplainGroup>
      <ExplainGroup title="History">
        <CreatedBullet
          chainId={CHAIN_ID}
          block={y.createdBlock > 0 ? y.createdBlock : null}
          by={`the Yearn V3 ${y.apiVersion} factory`}
        />
      </ExplainGroup>
    </div>
  );

  const status = y.shutdown
    ? {
        word: "Shut down",
        tone: "muted" as const,
        tip: "The vault is shut down: it takes no deposits, and holders can still withdraw.",
      }
    : null;

  const exportModel: VaultExportModel = {
    stats: [
      ["Shares issued", y.totalSupply ? shareText(y.totalSupply, y.shareDecimals ?? ad) : "not read"],
      ["Idle", y.totalIdle ? `${assetText(y.totalIdle, ad)} ${unit}` : "not read"],
      ["Deployed", y.totalDebt ? `${assetText(y.totalDebt, ad)} ${unit}` : "not read"],
      ["Profit unlock", y.profitMaxUnlockTime != null ? spanWords(y.profitMaxUnlockTime) : "not read"],
      ["Steward (role manager)", y.roleManager ?? "not read"],
      ["Accountant", y.accountant ?? "none set"],
    ],
    rows: [
      [
        "Idle in the vault",
        y.totalIdle ? assetText(y.totalIdle, ad) : "not read",
        rows[0].share == null ? "" : pctText(rows[0].share),
      ],
      ...data.strategies.map((s, i): [string, string, string] => {
        const share = rows[i + 1].share;
        return [
          `#${s.position} ${s.name ?? ""} ${s.address}`.trim(),
          s.currentDebt ? assetText(s.currentDebt, ad) : "not read",
          share == null ? "" : pctText(share),
        ];
      }),
    ],
  };

  const alloc = allocationBar(rows, { asset, venue: { one: "strategy", many: "strategies" } });
  const vaultName = y.name ?? y.censusName;
  const config = yearnConfigTile({ data, coords, release: v.releaseLabel, createdAt });

  return (
    <ProvReceiptsScope registry={registry}>
      <VaultFinder />
      <Tile id="summary" flush>
        <div className={VAULT_CARD_TILE}>
          <VaultCard
            vault={v}
            yieldFigure={yieldFigure}
            holdersHref={null}
            receipts={{
              name: yearnVaultNameProv(coords),
              totalAssets: yearnVaultTotalAssetsProv(coords),
              sharePrice: yearnVaultSharePriceProv(coords),
              standing: { endorsed: yearnVaultEndorsedProv(coords, true), "shut-down": yearnVaultShutdownProv(coords) },
            }}
            status={status}
            stats={stats}
            links={links}
            explanation={explanation}
            learnMore={yearnVaultCardContent()}
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
                        name: vaultName,
                        address: y.address,
                        reads:
                          "totalAssets(), totalSupply(), convertToAssets(), totalIdle(), totalDebt(), profitMaxUnlockTime(), role_manager(), accountant(), isShutdown(), get_default_queue(), strategies(strategy)",
                      },
                      { name: "Yearn V3 Registry", address: YEARN_REGISTRY, reads: "isEndorsed(vault)" },
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
          <VaultStrip vault={v} strip={strip} yieldFigure={yieldFigure} />
        </Tile>

        <Tile id="allocation" segScope={ALLOCATION_SCOPE} left>
          <VaultAssets
            rows={alloc.rows}
            assetSymbol={unit}
            assetAddress={asset.address}
            assetDecimals={ad}
            chart={alloc.chart}
            keyColours={alloc.keyColours}
            look="index"
            line={
              <>
                The idle balance and the{" "}
                <Prov info={yearnVaultQueueProv(coords, data.strategies.length)}>
                  {n(data.strategies.length)} {data.strategies.length === 1 ? "strategy" : "strategies"}
                </Prov>{" "}
                of the default queue, in its order.
              </>
            }
            shareTip="The row's amount over the vault's total assets."
            learnMore={yearnVaultAssetsContent()}
            menu={{ exports: vaultAssetsExports(v, exportModel) }}
          />
        </Tile>

        <Tile id="holders" segScope={HOLDERS_SCOPE} right>
          <VaultWhoHolds
            chainId={CHAIN_ID}
            vault={y.address}
            vaultName={vaultName}
            shareSymbol={y.symbol ?? vaultName}
            shareDecimals={y.shareDecimals ?? null}
            holders={holders}
            holderHref={(h) => yearnVaultHref(y.address, h)}
            listingHref={null}
          />
        </Tile>

        {/* What protects it and The protocol underneath stream in as two
            sections: one wide tile, split in two from lg by a hairline. */}
        <Tile id="risk" wide flush>
          <div className="grid grid-cols-1 lg:grid-cols-2 [&>section]:!px-0 [&>section]:!py-5 sm:[&>section]:!p-5">
            <i aria-hidden className={`pointer-events-none absolute inset-y-5 left-1/2 hidden w-px lg:block ${RULE}`} />
            {protects}
          </div>
        </Tile>

        <Tile id="configuration" wide last>
          <VaultConfiguration
            chainId={CHAIN_ID}
            vault={y.address}
            vaultName={vaultName}
            block={data.blockNumber}
            readBy={coords.readBy}
            {...config}
          />
        </Tile>
      </div>
      <ColourNote />
    </ProvReceiptsScope>
  );
}

"use client";

// One Yearn V3 vault's page on Ethereum (rails-ops ui-jobs 407): the vault card
// (V2), where the assets are (V3) and the holder finder (V4). One block's read
// of the vault and of the Yearn V3 Registry (lib/sources/chain/
// yearn-ethereum-vault.ts); Yield is the daily store's. There is no census, so
// Holders is empty.

import { ProvReceiptsScope, Prov, useReceiptRegistry } from "@/components/shared/provenance";
import { BlockRef } from "@/components/shared/block-ref";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import type { PositionPanelRow } from "@/components/shared/position-card-panel";
import { NotLoaded } from "@/components/shared/not-loaded";
import { VaultCard, YieldBullets, type VaultMenuLink } from "@/components/vaults/vault-card";
import { VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { VaultFinder } from "@/components/vaults/vault-finder";
import { explorerUrl } from "@/lib/shared/chains";
import { assetText, pctText, shareText, shortAddress } from "@/lib/shared/vault-amount-text";
import { yearnVaultPageSummary } from "@/lib/vaults/summary";
import { vaultVenueShareProv } from "@/lib/vaults/card-provenance";
import {
  SHARES_ISSUED_TIP,
  STEWARD_TIP,
  yearnVaultAssetsContent,
  yearnVaultCardContent,
} from "@/lib/vaults/card-words";
import type { VaultYield } from "@/lib/vaults/yield";
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

export function YearnVaultPage({ data, yieldFigure }: { data: YearnVaultResponse; yieldFigure?: VaultYield }) {
  const registry = useReceiptRegistry();
  const y = data.vault;
  const v = yearnVaultPageSummary(data);
  const unit = y.asset.symbol;
  const ad = y.asset.decimals;
  const asset = { symbol: unit, address: y.asset.address };
  const coords: YearnVaultCoords = {
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
  const address = (a: string, role: "role manager" | "accountant") => (
    <a href={eth("address", a)} target="_blank" rel="noopener noreferrer" className="font-mono text-sm hover:underline">
      <Prov info={yearnVaultRoleProv(coords, role)}>{shortAddress(a)}</Prov>
    </a>
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
          <Prov info={yearnVaultTotalSupplyProv(coords)}>{shareText(y.totalSupply, y.shareDecimals ?? ad)}</Prov>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "idle",
      label: "Idle",
      tip: "The vault's totalIdle(): the part of its assets in the vault contract, which a withdrawal takes first.",
      asset,
      value: fig(
        "total-idle",
        y.totalIdle?.raw,
        y.totalIdle ? <Prov info={yearnVaultIdleProv(coords)}>{assetText(y.totalIdle, ad)}</Prov> : UNREAD,
      ),
    },
    {
      id: "deployed",
      label: "Deployed",
      tip: "The vault's totalDebt(): what it records as lent to its strategies, updated when a strategy reports.",
      asset,
      value: fig(
        "total-debt",
        y.totalDebt?.raw,
        y.totalDebt ? <Prov info={yearnVaultDebtProv(coords)}>{assetText(y.totalDebt, ad)}</Prov> : UNREAD,
      ),
    },
    {
      id: "profit-unlock",
      label: "Profit unlock",
      tip: "profitMaxUnlockTime(): how long a reported gain takes to reach the share price. A loss lands at once.",
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
      tip: "The vault's accountant(): the contract that charges its fees when a strategy reports.",
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
      shareProv: vaultVenueShareProv(v, "totalIdle()", "totalAssets()"),
      hooks: { "data-idle": "vault" },
    },
    ...data.strategies.map((s) => ({
      key: s.address,
      venue: s.name ?? shortAddress(s.address),
      links: (
        <a href={eth("address", s.address)} target="_blank" rel="noopener noreferrer" className="link-external text-xs">
          strategy
        </a>
      ),
      sub: (
        <>
          #{s.position} · cap{" "}
          {s.maxDebt ? (
            <Prov info={yearnVaultStrategyCapProv(coords, s.address)}>{assetText(s.maxDebt, ad)}</Prov>
          ) : (
            "not read"
          )}{" "}
          · <span className="font-mono">{shortAddress(s.address)}</span>
        </>
      ),
      amount: s.currentDebt,
      amountProv: yearnVaultStrategyDebtProv(coords, s.address),
      share: fraction(s.currentDebt, y.totalAssets),
      shareProv: vaultVenueShareProv(v, "this strategy's current_debt", "totalAssets()"),
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
      shareProv: vaultVenueShareProv(v, "totalDebt() less the queue's debt", "totalAssets()"),
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
    { item: "venue-page", title: "On Yearn's site", subtitle: "yearn.fi", href: `https://yearn.fi/v3/1/${y.address}` },
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
        <ExplainBullet>
          Created at block <Fig>{n(y.createdBlock)}</Fig> by the Yearn V3 {y.apiVersion} factory.
        </ExplainBullet>
      </ExplainGroup>
    </div>
  );

  const status = y.shutdown
    ? {
        word: "Shut down",
        tone: "muted" as const,
        tip: "The vault answers isShutdown() true at this block: it takes no deposits, and holders can still withdraw.",
      }
    : null;

  return (
    <ProvReceiptsScope registry={registry}>
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
        readAt={
          <>
            Read at <BlockRef block={data.blockNumber} chainId={CHAIN_ID} />, on the vault and the Yearn V3 Registry
          </>
        }
        exports={{
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
        }}
      />
      <VaultAssets
        rows={rows}
        assetSymbol={unit}
        assetDecimals={ad}
        line={
          <>
            The idle balance and the{" "}
            <Prov info={yearnVaultQueueProv(coords, data.strategies.length)}>
              {n(data.strategies.length)} strategies
            </Prov>{" "}
            of the default queue, in its order.
          </>
        }
        shareTip="The row's amount over the vault's totalAssets(), both read at this block."
        learnMore={yearnVaultAssetsContent()}
      />
      <VaultFinder />
    </ProvReceiptsScope>
  );
}

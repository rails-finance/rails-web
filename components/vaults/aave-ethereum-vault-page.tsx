"use client";

// One Aave vault's page on Ethereum (rails-ops ui-jobs 407; the grid of tiles,
// ui-jobs 584), for savings GHO, a static aToken or an Umbrella stake token:
// the holder finder (V4), the vault card (V2), then the grid
// (components/vaults/vault-tiles.tsx): the last 30 days (V5); where the
// assets are (V3) | who holds it (V11); what protects it (V9) | the protocol
// underneath (V10), streamed by the route; configuration and addresses (V12);
// the colour note at the foot. One block's read of the vault and of the
// contracts it hops to (lib/sources/chain/aave-ethereum-vault.ts); Holders and
// Who holds it are the census's, Yield the daily store's. No USD: every figure
// is a quantity of one named token.

import Link from "next/link";
import { ProvReceiptsScope, Prov, useReceiptRegistry } from "@/components/shared/provenance";
import { readStampProv, SectionReadStamp, type ReadContract } from "@/components/shared/read-stamp";
import type { SectionMenuLink } from "@/components/shared/section-menu";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { PanelFigure, type PositionPanelRow } from "@/components/shared/position-card-panel";
import { VaultCard, YieldBullets, type VaultMenuLink } from "@/components/vaults/vault-card";
import { ALLOCATION_SCOPE, allocationBar, VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { ColourNote, RULE, Tile, VAULT_CARD_TILE, VAULT_GRID } from "@/components/vaults/vault-tiles";
import { HOLDERS_SCOPE, VaultWhoHolds } from "@/components/vaults/vault-who-holds";
import { VaultConfiguration } from "@/components/vaults/vault-config";
import { aaveConfigTile } from "@/components/vaults/vault-config-columns";
import type { VaultHolders } from "@/lib/vaults/holders-read";
import { VaultFinder } from "@/components/vaults/vault-finder";
import { VaultStrip } from "@/components/vaults/vault-strip";
import type { VaultStripSeries } from "@/lib/vaults/yield-read";
import { durationText, utcInstant } from "@/components/vaults/aave-vault-format";
import { NotLoaded } from "@/components/shared/not-loaded";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { assetText, pctText, sharePriceText, shareText, shortAddress } from "@/lib/shared/vault-amount-text";
import { StatAmount } from "@/components/vaults/stat-amount";
import { ethereumVaultHref, ethereumVaultsListingHref } from "@/lib/vaults/routes";
import { aaveEthereumVaultPageSummary } from "@/lib/vaults/summary";
import { vaultVenueProv, vaultVenueShareProv } from "@/lib/vaults/card-provenance";
import { vaultAssetsExports } from "@/lib/vaults/card-export";
import { ethereumAaveV3Market, reserveHref } from "@/lib/shared/aave-market-configs";
import { aaveVaultAssetsContent, aaveVaultCardContent, SHARES_ISSUED_TIP, STEWARD_TIP } from "@/lib/vaults/card-words";
import { measuredYield, type VaultYield } from "@/lib/vaults/yield";
import type { AaveVaultAttestation } from "@/lib/aave-vaults/vault-catalog";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import type { AaveEthereumVaultResponse } from "@/lib/sources/chain/aave-ethereum-vault";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";
import { serverReadOf } from "@/lib/shared/server-head-read";
import {
  aaveSghoAssetHeldProv,
  aaveSghoCapacityProv,
  aaveSghoLastUpdateProv,
  aaveStataATokenBalanceProv,
  aaveUmbrellaCustodyProv,
  aaveUmbrellaMaxSlashableProv,
  aaveUmbrellaOwnerProv,
  aaveUmbrellaWrapperPriceProv,
  aaveVaultATokenProv,
  aaveVaultBackedByProv,
  aaveVaultBookProv,
  aaveVaultCooldownProv,
  aaveVaultNameProv,
  aaveVaultReserveHopProv,
  aaveVaultSharePriceProv,
  aaveVaultSlashableProv,
  aaveVaultSupplyCapProv,
  aaveVaultTargetRateProv,
  aaveVaultTotalAssetsProv,
  aaveVaultTotalSupplyProv,
  type AaveVaultCoords,
} from "@/lib/aave-vaults/vault-provenance";

const n = (v: number) => v.toLocaleString("en-US");
const eth = (kind: "address", v: string) => explorerUrl(MAINNET_CHAIN_ID, kind, v);
const UNREAD = <NotLoaded className="text-base font-normal text-rb-500" />;
const AAVE_V3_CORE = ethereumAaveV3Market(null);

/** A part over the vault's total, both raws read at one block. */
const fraction = (part: RawAmount | null, total: RawAmount | null): number | null =>
  part && total && BigInt(total.raw) > BigInt(0)
    ? Number((BigInt(part.raw) * BigInt(1e9)) / BigInt(total.raw)) / 1e9
    : null;

export function AaveEthereumVaultPage({
  protects,
  data,
  census,
  yieldFigure: storeYield,
  strip,
  attestation,
  holders,
}: {
  /** "What protects it" and "The protocol underneath" (V9, V10), streamed by the route. */
  protects?: React.ReactNode;
  data: AaveEthereumVaultResponse;
  census: VaultCensusRow | null;
  yieldFigure?: VaultYield;
  /** The store's three daily series for the strip (V5); null where it did not answer. */
  strip: VaultStripSeries | null;
  attestation: AaveVaultAttestation;
  /** Who holds it: the census's largest holders; null where it did not answer. */
  holders: VaultHolders | null;
}) {
  const registry = useReceiptRegistry();
  const { vault } = data;
  const family = vault.family;
  const v = aaveEthereumVaultPageSummary(data, attestation.kind === "book", census);
  // A figure on total assets under the dust floor is too small to measure (ui-jobs 542).
  const yieldFigure = measuredYield(storeYield, v.totalAssets?.raw);
  const unit = vault.asset.symbol;
  const ad = vault.asset.decimals;
  const sd = vault.shareDecimals;
  const asset = { symbol: unit, address: vault.asset.address };
  const coords: AaveVaultCoords = {
    blockNumber: data.blockNumber,
    readBy: serverReadOf(data),
    vault: vault.address,
    vaultName: vault.name ?? undefined,
    assetSymbol: unit,
    shareSymbol: vault.symbol ?? undefined,
    reserveSymbol: data.umbrella?.reserve?.symbol,
  };
  const fig = (name: string, value: React.ReactNode) => <span data-figure={name}>{value}</span>;

  const stats: PositionPanelRow[] = [
    {
      id: "shares-issued",
      label: "Shares issued",
      tip: SHARES_ISSUED_TIP,
      sub: vault.symbol ?? undefined,
      value: fig(
        "total-supply",
        data.totalSupply && sd != null ? (
          <Prov info={aaveVaultTotalSupplyProv(coords, sd)}>
            <StatAmount amount={data.totalSupply} decimals={sd} symbol={vault.symbol ?? undefined} shares />
          </Prov>
        ) : (
          UNREAD
        ),
      ),
    },
  ];
  const exportStats: [string, string][] = [
    ["Shares issued", data.totalSupply && sd != null ? shareText(data.totalSupply, sd) : "not read"],
  ];
  const rows: VaultAssetRow[] = [];
  /** The Rails pages "Where the assets are" opens from its ⋮. */
  const assetLinks: SectionMenuLink[] = [];
  const exportRows: [string, string, string][] = [];
  const links: VaultMenuLink[] = [
    {
      item: "vault-contract",
      title: "Vault contract",
      subtitle: `${shortAddress(vault.address)} on Etherscan`,
      href: eth("address", vault.address),
    },
  ];
  let explanation: React.ReactNode = null;
  const holdersBullet = v.census && (
    <ExplainBullet>
      <Fig>{n(v.census.holders)}</Fig> addresses have held a share; <Fig>{n(v.census.live)}</Fig> hold one at the last
      census.
    </ExplainBullet>
  );
  const sharePriceBullet = data.sharePrice && (
    <ExplainBullet>
      A share converts to{" "}
      <Fig>
        {sharePriceText(data.sharePrice, ad)} {unit}
      </Fig>
      .
    </ExplainBullet>
  );

  if (family === "sgho" && data.sgho) {
    const s = data.sgho;
    stats.push(
      {
        id: "asset-held",
        label: `${unit} the contract holds`,
        tip: "The contract's GHO balance. Withdrawals are clamped to it. Total assets is what the index says the shares are worth; no order between the two is asserted.",
        asset,
        value: fig(
          "sgho-asset-held",
          s.assetHeld ? (
            <Prov info={aaveSghoAssetHeldProv(coords)}>
              <StatAmount amount={s.assetHeld} decimals={ad} symbol={unit} />
            </Prov>
          ) : (
            UNREAD
          ),
        ),
      },
      {
        id: "deposit-cap",
        label: "Deposit cap",
        tip: "The most the vault takes in deposits.",
        asset,
        value: fig(
          "sgho-supply-cap",
          s.supplyCap ? (
            <Prov info={aaveVaultSupplyCapProv(coords)}>
              <StatAmount amount={s.supplyCap} decimals={ad} symbol={unit} />
            </Prov>
          ) : (
            UNREAD
          ),
        ),
      },
      {
        id: "remaining-capacity",
        label: "Remaining capacity",
        tip: "The room left under the deposit cap.",
        asset,
        value: fig(
          "sgho-capacity",
          s.remainingCapacity ? (
            <Prov info={aaveSghoCapacityProv(coords)}>
              <StatAmount amount={s.remainingCapacity} decimals={ad} symbol={unit} />
            </Prov>
          ) : (
            UNREAD
          ),
        ),
      },
      {
        id: "target-rate",
        label: "Target rate",
        sub: "basis points, a setting",
        tip: "The rate the index moves at, as governance set it, in the basis points the contract stores.",
        value: fig(
          "sgho-target-rate",
          s.targetRateBps != null ? (
            <Prov info={aaveVaultTargetRateProv(coords, s.targetRateBps)}>{n(s.targetRateBps)}</Prov>
          ) : (
            UNREAD
          ),
        ),
      },
      {
        id: "index-updated",
        label: "Index last updated",
        tip: "A timestamp the contract stores, the last time the index was written.",
        value: fig(
          "sgho-last-update",
          s.lastUpdate != null ? (
            <span className="text-sm">
              <Prov info={aaveSghoLastUpdateProv(coords)}>{utcInstant(s.lastUpdate)}</Prov>
            </span>
          ) : (
            UNREAD
          ),
        ),
      },
    );
    exportStats.push(
      [`${unit} the contract holds`, s.assetHeld ? assetText(s.assetHeld, ad) : "not read"],
      ["Deposit cap", s.supplyCap ? assetText(s.supplyCap, ad) : "not read"],
      ["Remaining capacity", s.remainingCapacity ? assetText(s.remainingCapacity, ad) : "not read"],
      ["Target rate (basis points)", s.targetRateBps != null ? String(s.targetRateBps) : "not read"],
      ["Index last updated", s.lastUpdate != null ? utcInstant(s.lastUpdate) : "not read"],
    );
    // One row: the GHO the contract holds, which is its idle balance. Beside
    // total assets it is a second figure, so no share is stated.
    rows.push({
      key: "held",
      venue: "Idle in the contract",
      sub: `${unit} balance; withdrawals are clamped to it`,
      amount: s.assetHeld,
      amountProv: aaveSghoAssetHeldProv(coords),
      share: null,
      hooks: { "data-asset-row": "held" },
    });
    exportRows.push(["Idle in the contract", s.assetHeld ? assetText(s.assetHeld, ad) : "not read", ""]);
    links.push(
      { item: "venue-page", title: "On Aave's app", subtitle: "app.aave.com/sgho", href: "https://app.aave.com/sgho/" },
      {
        item: "docs",
        title: "Aave's documentation",
        subtitle: "aave.com: Savings GHO",
        href: "https://aave.com/docs/ecosystem/gho/sgho",
      },
    );
    explanation = (
      <div data-vault-explanation="">
        <ExplainGroup title="Holdings">
          <ExplainBullet>
            Savings GHO holds <Fig>{s.assetHeld ? `${assetText(s.assetHeld, ad)} ${unit}` : "an unread amount of"}</Fig>{" "}
            in the contract for the holders of its shares.
          </ExplainBullet>
          {sharePriceBullet}
        </ExplainGroup>
        <ExplainGroup title="Risk">
          <ExplainBullet>Withdrawals are clamped to the GHO the contract holds.</ExplainBullet>
          {s.remainingCapacity && (
            <ExplainBullet>
              Deposits stop at the cap:{" "}
              <Fig>
                {assetText(s.remainingCapacity, ad)} {unit}
              </Fig>{" "}
              of room remains.
            </ExplainBullet>
          )}
        </ExplainGroup>
        <ExplainGroup title="Rate">
          {s.targetRateBps != null && (
            <ExplainBullet>
              The target rate is <Fig>{n(s.targetRateBps)}</Fig> basis points, a setting governance can change.
            </ExplainBullet>
          )}
          <YieldBullets yieldFigure={yieldFigure} rewards="rewards paid outside the share" />
        </ExplainGroup>
        {holdersBullet && <ExplainGroup title="History">{holdersBullet}</ExplainGroup>}
      </div>
    );
  }

  if (family === "stata" && data.stata) {
    const s = data.stata;
    stats.push({
      id: "wraps",
      label: "Wraps",
      tip: "The aToken the wrapper holds: a supply position in the Aave V3 Core market.",
      value: s.aToken ? (
        <span className="font-mono text-sm" data-stata-atoken={s.aToken}>
          <Prov info={aaveVaultATokenProv(coords)}>{shortAddress(s.aToken)}</Prov>
        </span>
      ) : (
        UNREAD
      ),
    });
    exportStats.push(["Wraps (aToken)", s.aToken ?? "not read"]);
    const share = fraction(s.aTokenBalance, data.totalAssets);
    rows.push({
      key: "atoken",
      venue: "Aave V3 Core market",
      href: reserveHref(AAVE_V3_CORE, vault.asset.address),
      venueHooks: { "data-link": "aave-v3-market" },
      venueProv: vaultVenueProv(
        v,
        {
          venue: "Aave V3 Core market",
          what: `the ${unit} reserve of the Aave V3 Core market, where the wrapper holds its aToken as a supply position.`,
          via: "aToken() · balanceOf(wrapper)",
          ids: s.aToken ? [{ label: "aToken", value: s.aToken }] : [],
        },
        coords.readBy,
      ),
      sub: `a${unit}, a supply position`,
      amount: s.aTokenBalance,
      amountProv: aaveStataATokenBalanceProv(coords, s.aToken),
      amountFigure: "stata-atoken-balance",
      share,
      shareProv: vaultVenueShareProv(v, "the aToken held", "totalAssets()", coords.readBy),
      hooks: { "data-asset-row": "atoken" },
    });
    exportRows.push([
      "Aave V3 Core market (aToken)",
      s.aTokenBalance ? assetText(s.aTokenBalance, ad) : "not read",
      share == null ? "" : pctText(share),
    ]);
    if (s.aToken)
      links.push({
        item: "atoken",
        title: "aToken on Etherscan",
        subtitle: shortAddress(s.aToken),
        href: eth("address", s.aToken),
      });
    assetLinks.push({
      item: "reserve-page",
      title: `The ${unit} reserve on Aave V3 Core`,
      subtitle: "The reserve the wrapper supplies",
      href: reserveHref(AAVE_V3_CORE, vault.asset.address),
      internal: true,
    });
    links.push({
      item: "docs",
      title: "Aave's documentation",
      subtitle: "aave.com: Static aTokens",
      href: "https://aave.com/docs/aave-v3/smart-contracts/tokenization",
    });
    explanation = (
      <div data-vault-explanation="">
        <ExplainGroup title="Holdings">
          <ExplainBullet>
            This wrapper holds{" "}
            <Fig>{s.aTokenBalance ? `${assetText(s.aTokenBalance, ad)} ${unit}` : "an unread amount"}</Fig> as a supply
            position in the Aave V3 Core market.
          </ExplainBullet>
          {sharePriceBullet}
        </ExplainGroup>
        {data.backedBy.length > 0 && (
          <ExplainGroup title="Risk">
            {data.backedBy.map((b) => (
              <ExplainBullet
                key={b.address}
                data-figure="vault-backed-by"
                data-backed-by={b.address}
                data-backed-by-shares-raw={b.shares.raw}
              >
                <Link
                  href={ethereumVaultHref(b.address)}
                  className={PAGE_LINK}
                  prefetch={false}
                  data-link="backed-by-vault"
                >
                  {b.symbol ?? shortAddress(b.address)}
                </Link>{" "}
                holds{" "}
                <span data-figure="vault-backed-by-share">
                  <Prov info={aaveVaultBackedByProv(coords, b.symbol ?? shortAddress(b.address), b.address)}>
                    <Fig>{pctText(b.fraction)}</Fig>
                  </Prov>
                </span>{" "}
                of this vault as the stake behind{" "}
                <Link
                  href={ethereumVaultsListingHref({ vault: b.address })}
                  className={PAGE_LINK}
                  prefetch={false}
                  data-link="backed-by-holders"
                  data-backed-by-holders={b.address}
                >
                  its own holders
                </Link>
                .
              </ExplainBullet>
            ))}
          </ExplainGroup>
        )}
        <ExplainGroup title="Rate">
          <YieldBullets yieldFigure={yieldFigure} rewards="incentives claimed outside the share" />
        </ExplainGroup>
        {holdersBullet && <ExplainGroup title="History">{holdersBullet}</ExplainGroup>}
      </div>
    );
  }

  if (family === "umbrella-stake" && data.umbrella) {
    const u = data.umbrella;
    const reserve = u.reserve;
    const owner = u.owner;
    stats.push(
      {
        id: "cooldown",
        label: "Cooldown",
        tip: "How long a holder waits after starting a cooldown before redeeming.",
        value: fig(
          "umbrella-cooldown",
          u.cooldownSeconds != null && u.unstakeWindowSeconds != null ? (
            <Prov info={aaveVaultCooldownProv(coords, u.cooldownSeconds, u.unstakeWindowSeconds)}>
              {durationText(u.cooldownSeconds)}
            </Prov>
          ) : (
            UNREAD
          ),
        ),
      },
      {
        id: "unstake-window",
        label: "Unstake window",
        tip: "How long a holder has to redeem once the cooldown has run. After it closes, the cooldown starts again.",
        value: fig(
          "umbrella-unstake-window",
          u.cooldownSeconds != null && u.unstakeWindowSeconds != null ? (
            <Prov info={aaveVaultCooldownProv(coords, u.cooldownSeconds, u.unstakeWindowSeconds)}>
              {durationText(u.unstakeWindowSeconds)}
            </Prov>
          ) : (
            UNREAD
          ),
        ),
      },
      {
        id: "steward",
        label: "Steward",
        sub: "owner",
        tip: STEWARD_TIP.umbrella,
        value: owner ? (
          <span
            className="font-mono text-sm"
            data-umbrella-owner={owner}
            data-steward={owner}
            data-steward-role="owner"
          >
            <Prov info={aaveUmbrellaOwnerProv(coords, owner)}>{shortAddress(owner)}</Prov>
          </span>
        ) : (
          UNREAD
        ),
      },
      {
        id: "reserve",
        label: "Reserve",
        tip: "The Aave V3 reserve this token stands behind, and whether Umbrella reports a slashable deficit on it: one the stake can be slashed for, when part of the stake is taken to cover a shortfall.",
        sub:
          u.reserveSlashable == null ? (
            "deficit not read"
          ) : reserve ? (
            <Prov info={aaveVaultSlashableProv(coords, reserve.symbol, u.reserveSlashable)}>
              {u.reserveSlashable ? "slashable deficit reported" : "no slashable deficit"}
            </Prov>
          ) : undefined,
        value: fig(
          "umbrella-reserve",
          reserve ? <Prov info={aaveVaultReserveHopProv(coords, reserve.symbol)}>{reserve.symbol}</Prov> : UNREAD,
        ),
      },
      {
        id: "slashable",
        label: "Slashable",
        tip: "The most a slashing may take, from the contract's configuration.",
        asset,
        value: fig(
          "umbrella-max-slashable",
          u.maxSlashable ? (
            <Prov info={aaveUmbrellaMaxSlashableProv(coords)}>
              <StatAmount amount={u.maxSlashable} decimals={ad} symbol={unit} />
            </Prov>
          ) : (
            UNREAD
          ),
        ),
      },
    );
    exportStats.push(
      ["Cooldown", u.cooldownSeconds != null ? durationText(u.cooldownSeconds) : "not read"],
      ["Unstake window", u.unstakeWindowSeconds != null ? durationText(u.unstakeWindowSeconds) : "not read"],
      ["Steward (owner)", owner ?? "not read"],
      [
        "Reserve",
        reserve
          ? `${reserve.symbol}${u.reserveSlashable == null ? "" : u.reserveSlashable ? ", slashable deficit reported" : ", no slashable deficit"}`
          : "not read",
      ],
      ["Slashable", u.maxSlashable ? `${assetText(u.maxSlashable, ad)} ${unit}` : "not read"],
    );
    const share = fraction(u.assetHeld, data.totalAssets);
    const assetVault = vault.assetVault;
    rows.push({
      key: "held",
      venue: unit,
      ...(assetVault
        ? { href: ethereumVaultHref(assetVault.address), venueHooks: { "data-catalogue-member": assetVault.address } }
        : {}),
      venueProv: vaultVenueProv(
        v,
        {
          venue: unit,
          what: `the ${unit} the stake token holds${reserve ? `, staked behind the ${reserve.symbol} reserve` : ""}.`,
          via: "asset() · balanceOf(stake token)",
          contract: { name: unit, address: vault.asset.address },
          ids: [{ label: "token", value: vault.asset.address }],
        },
        coords.readBy,
      ),
      sub: reserve ? `staked behind the ${reserve.symbol} reserve` : "the stake",
      amount: u.assetHeld,
      amountProv: aaveUmbrellaCustodyProv(coords),
      amountFigure: "umbrella-asset-held",
      share,
      shareProv: vaultVenueShareProv(v, `the ${unit} the token holds`, "totalAssets()", coords.readBy),
      hooks: { "data-asset-row": "held" },
    });
    exportRows.push([
      `${unit} the token holds`,
      u.assetHeld ? assetText(u.assetHeld, ad) : "not read",
      share == null ? "" : pctText(share),
    ]);
    if (u.wrapper) {
      const w = u.wrapper;
      rows.push({
        key: "hop",
        venue: <>&rarr; {reserve?.symbol ?? "the reserve"}</>,
        ...(reserve ? { icon: { symbol: reserve.symbol, address: reserve.address } } : {}),
        href: ethereumVaultHref(w.address),
        sub:
          w.sharePrice && w.decimals != null ? (
            <span>
              one {w.symbol ?? "wrapper share"} is{" "}
              <span data-figure="umbrella-wrapper-price">
                <Prov info={aaveUmbrellaWrapperPriceProv(coords, w.symbol ?? "the wrapper", w.decimals)}>
                  {sharePriceText(w.sharePrice, reserve?.decimals ?? ad)}
                </Prov>
              </span>{" "}
              {reserve?.symbol ?? ""}
            </span>
          ) : (
            "the wrapper's price was not read"
          ),
        amount: null,
        share: null,
        offBand: true,
        hooks: { "data-wrapper-hop": w.address },
      });
      exportRows.push([
        `hop to ${reserve?.symbol ?? "the reserve"}: one ${w.symbol ?? "wrapper share"} = ${w.sharePrice ? sharePriceText(w.sharePrice, reserve?.decimals ?? ad) : "not read"}`,
        "",
        "",
      ]);
    }
    if (owner)
      links.push({
        item: "steward",
        title: "Owner on Etherscan",
        subtitle: shortAddress(owner),
        href: eth("address", owner),
      });
    if (reserve)
      assetLinks.push({
        item: "reserve-page",
        title: `The ${reserve.symbol} reserve on Aave V3 Core`,
        subtitle: "The reserve this stake covers",
        href: reserveHref(AAVE_V3_CORE, reserve.address),
        internal: true,
      });
    links.push(
      {
        item: "venue-page",
        title: "On Aave's app",
        subtitle: "app.aave.com/staking",
        href: "https://app.aave.com/staking/",
      },
      {
        item: "docs",
        title: "Aave's documentation",
        subtitle: "aave.com: Umbrella",
        href: "https://aave.com/docs/aave-v3/umbrella",
      },
    );
    explanation = (
      <div data-vault-explanation="">
        <ExplainGroup title="Holdings">
          <ExplainBullet>
            This token holds <Fig>{u.assetHeld ? `${assetText(u.assetHeld, ad)} ${unit}` : "an unread amount"}</Fig>{" "}
            staked behind the {reserve?.symbol ?? "covered"} reserve.
          </ExplainBullet>
          {sharePriceBullet}
        </ExplainGroup>
        <ExplainGroup title="Risk">
          {u.maxSlashable && owner && (
            <ExplainBullet>
              Up to{" "}
              <Fig>
                {assetText(u.maxSlashable, ad)} {unit}
              </Fig>{" "}
              can be slashed by the owner <Fig>{shortAddress(owner)}</Fig> to cover a deficit.
            </ExplainBullet>
          )}
          {u.cooldownSeconds != null && u.unstakeWindowSeconds != null && (
            <ExplainBullet>
              Leaving takes a <Fig>{durationText(u.cooldownSeconds)}</Fig> cooldown, then a{" "}
              <Fig>{durationText(u.unstakeWindowSeconds)}</Fig> window to redeem.
            </ExplainBullet>
          )}
        </ExplainGroup>
        <ExplainGroup title="Rate">
          <YieldBullets yieldFigure={yieldFigure} rewards="Umbrella's rewards, paid outside the share," />
        </ExplainGroup>
        {holdersBullet && <ExplainGroup title="History">{holdersBullet}</ExplainGroup>}
      </div>
    );
  }

  const vaultName = vault.name ?? vault.symbol ?? "the vault";
  const readContracts: ReadContract[] = [
    {
      name: vaultName,
      address: vault.address,
      reads:
        family === "sgho"
          ? "totalAssets(), totalSupply(), convertToAssets(), supplyCap(), maxDeposit(), targetRate(), lastUpdate(), paused()"
          : family === "stata"
            ? "totalAssets(), totalSupply(), convertToAssets(), aToken()"
            : "totalAssets(), totalSupply(), convertToAssets(), owner(), getCooldown(), getUnstakeWindow(), getMaxSlashableAssets()",
    },
    ...(vault.asset.address
      ? [{ name: unit, address: vault.asset.address, reads: `balanceOf(${shortAddress(vault.address)})` }]
      : []),
    ...(data.stata?.aToken
      ? [{ name: `a${unit}`, address: data.stata.aToken, reads: `balanceOf(${shortAddress(vault.address)})` }]
      : []),
  ];

  const status = data.sgho?.paused
    ? {
        word: "Paused",
        tone: "caution" as const,
        tip: "The vault is paused: it takes no deposits and pays out no withdrawals.",
      }
    : null;

  const holdersHref = ethereumVaultsListingHref({ vault: vault.address });
  const alloc = allocationBar(rows, { asset, venue: { one: "venue", many: "venues" } });
  const config = aaveConfigTile({ data, coords, kind: v.releaseLabel });

  return (
    <ProvReceiptsScope registry={registry}>
      <VaultFinder />
      <Tile id="summary" flush>
        <div className={VAULT_CARD_TILE}>
          <VaultCard
            vault={v}
            yieldFigure={yieldFigure}
            holdersHref={holdersHref}
            receipts={{
              name: aaveVaultNameProv(coords, attestation),
              totalAssets: aaveVaultTotalAssetsProv(coords, family),
              sharePrice: sd != null ? aaveVaultSharePriceProv(coords, sd) : undefined,
              standing: { "address-book": aaveVaultBookProv(coords, attestation) },
            }}
            pillHooks={{ "address-book": { "data-vault-attestation": attestation.kind } }}
            hooks={{ "data-mechanic": family, "data-vault-attestation-kind": attestation.kind }}
            status={status}
            stats={stats}
            links={links}
            explanation={explanation}
            learnMore={aaveVaultCardContent(family)}
            stamp={
              <SectionReadStamp
                chainId={MAINNET_CHAIN_ID}
                block={data.blockNumber}
                blockTime={data.blockTimestamp || null}
                readBy={coords.readBy}
                info={(at) =>
                  readStampProv({
                    chainId: MAINNET_CHAIN_ID,
                    block: data.blockNumber,
                    at,
                    readBy: coords.readBy,
                    what: "Every figure on this card and in where the assets are",
                    contracts: readContracts,
                  })
                }
              />
            }
            exports={{ stats: exportStats, rows: exportRows }}
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
              family === "sgho" ? (
                <>The GHO the contract holds, beside its total assets.</>
              ) : family === "stata" ? (
                <>One supply position in the Aave V3 Core market.</>
              ) : (
                <>
                  The stake, and the hop to the <PanelFigure>{data.umbrella?.reserve?.symbol ?? "reserve"}</PanelFigure>{" "}
                  it covers.
                </>
              )
            }
            shareTip="The row's amount over the vault's total assets."
            learnMore={aaveVaultAssetsContent(family)}
            menu={{
              links: [
                ...assetLinks,
                {
                  item: "holders",
                  title: "This vault's holders",
                  subtitle: "Every address that holds a share",
                  href: holdersHref,
                  internal: true,
                },
              ],
              exports: vaultAssetsExports(v, { stats: exportStats, rows: exportRows }),
            }}
          />
        </Tile>

        <Tile id="holders" segScope={HOLDERS_SCOPE} right>
          <VaultWhoHolds
            chainId={MAINNET_CHAIN_ID}
            vault={vault.address}
            vaultName={vaultName}
            shareSymbol={vault.symbol ?? vaultName}
            shareDecimals={sd}
            holders={holders}
            holderHref={(h) => ethereumVaultHref(vault.address, h)}
            listingHref={holdersHref}
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
            chainId={MAINNET_CHAIN_ID}
            vault={vault.address}
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

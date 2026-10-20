"use client";

// One Aave vault's page on Ethereum (rails-ops ui-jobs 407): the vault card
// (V2), where the assets are (V3) and the holder finder (V4), for savings GHO,
// a static aToken or an Umbrella stake token. One block's read of the vault
// and of the contracts it hops to (lib/sources/chain/aave-ethereum-vault.ts);
// Holders is the census's, Yield the daily store's. No USD: every figure is a
// quantity of one named token.

import Link from "next/link";
import { ProvReceiptsScope, Prov, useReceiptRegistry } from "@/components/shared/provenance";
import { BlockRef } from "@/components/shared/block-ref";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { PanelFigure, type PositionPanelRow } from "@/components/shared/position-card-panel";
import { VaultCard, YieldBullets, type VaultMenuLink } from "@/components/vaults/vault-card";
import { VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { VaultFinder } from "@/components/vaults/vault-finder";
import { durationText, utcInstant } from "@/components/vaults/aave-vault-format";
import { NotLoaded } from "@/components/shared/not-loaded";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { assetText, pctText, sharePriceText, shareText, shortAddress } from "@/lib/shared/vault-amount-text";
import { ethereumVaultHref, ethereumVaultsListingHref } from "@/lib/vaults/routes";
import { aaveEthereumVaultPageSummary } from "@/lib/vaults/summary";
import { vaultVenueShareProv } from "@/lib/vaults/card-provenance";
import { aaveVaultAssetsContent, aaveVaultCardContent, SHARES_ISSUED_TIP, STEWARD_TIP } from "@/lib/vaults/card-words";
import type { VaultYield } from "@/lib/vaults/yield";
import type { AaveVaultAttestation } from "@/lib/aave-vaults/vault-catalog";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import type { AaveEthereumVaultResponse } from "@/lib/sources/chain/aave-ethereum-vault";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";
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
const AAVE_V3_MARKET_HREF = "/ethereum/aave-v3/market";

/** A part over the vault's total, both raws read at one block. */
const fraction = (part: RawAmount | null, total: RawAmount | null): number | null =>
  part && total && BigInt(total.raw) > BigInt(0)
    ? Number((BigInt(part.raw) * BigInt(1e9)) / BigInt(total.raw)) / 1e9
    : null;

export function AaveEthereumVaultPage({
  data,
  census,
  yieldFigure,
  attestation,
}: {
  data: AaveEthereumVaultResponse;
  census: VaultCensusRow | null;
  yieldFigure?: VaultYield;
  attestation: AaveVaultAttestation;
}) {
  const registry = useReceiptRegistry();
  const { vault } = data;
  const family = vault.family;
  const v = aaveEthereumVaultPageSummary(data, attestation.kind === "book", census);
  const unit = vault.asset.symbol;
  const ad = vault.asset.decimals;
  const sd = vault.shareDecimals;
  const asset = { symbol: unit, address: vault.asset.address };
  const coords: AaveVaultCoords = {
    blockNumber: data.blockNumber,
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
          <Prov info={aaveVaultTotalSupplyProv(coords, sd)}>{shareText(data.totalSupply, sd)}</Prov>
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
      <Fig>{n(v.census.holders)}</Fig> addresses have held a share; <Fig>{n(v.census.live)}</Fig> hold one at the census
      block.
    </ExplainBullet>
  );
  const sharePriceBullet = data.sharePrice && (
    <ExplainBullet>
      A share converts to{" "}
      <Fig>
        {sharePriceText(data.sharePrice, ad)} {unit}
      </Fig>{" "}
      at this block.
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
          s.assetHeld ? <Prov info={aaveSghoAssetHeldProv(coords)}>{assetText(s.assetHeld, ad)}</Prov> : UNREAD,
        ),
      },
      {
        id: "deposit-cap",
        label: "Deposit cap",
        tip: "The most the vault takes in deposits, its supplyCap().",
        asset,
        value: fig(
          "sgho-supply-cap",
          s.supplyCap ? <Prov info={aaveVaultSupplyCapProv(coords)}>{assetText(s.supplyCap, ad)}</Prov> : UNREAD,
        ),
      },
      {
        id: "remaining-capacity",
        label: "Remaining capacity",
        tip: "What the vault answers to maxDeposit at this block: the room left under the cap.",
        asset,
        value: fig(
          "sgho-capacity",
          s.remainingCapacity ? (
            <Prov info={aaveSghoCapacityProv(coords)}>{assetText(s.remainingCapacity, ad)}</Prov>
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
      tip: "The aToken the wrapper holds, asked of the wrapper: a supply position in the Aave V3 Core market.",
      value: s.aToken ? (
        <a
          href={eth("address", s.aToken)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm hover:underline"
          data-stata-atoken={s.aToken}
        >
          <Prov info={aaveVaultATokenProv(coords)}>{shortAddress(s.aToken)}</Prov>
        </a>
      ) : (
        UNREAD
      ),
    });
    exportStats.push(["Wraps (aToken)", s.aToken ?? "not read"]);
    const share = fraction(s.aTokenBalance, data.totalAssets);
    rows.push({
      key: "atoken",
      venue: (
        <Link href={AAVE_V3_MARKET_HREF} className={PAGE_LINK} prefetch={false} data-link="aave-v3-market">
          Aave V3 Core market
        </Link>
      ),
      sub: s.aToken ? (
        <span className="font-mono">
          a{unit} {shortAddress(s.aToken)}
        </span>
      ) : undefined,
      amount: s.aTokenBalance,
      amountProv: aaveStataATokenBalanceProv(coords, s.aToken),
      amountFigure: "stata-atoken-balance",
      share,
      shareProv: vaultVenueShareProv(v, "the aToken held", "totalAssets()"),
      links: s.aToken ? (
        <a href={eth("address", s.aToken)} target="_blank" rel="noopener noreferrer" className="link-external text-xs">
          aToken
        </a>
      ) : undefined,
      hooks: { "data-asset-row": "atoken" },
    });
    exportRows.push([
      "Aave V3 Core market (aToken)",
      s.aTokenBalance ? assetText(s.aTokenBalance, ad) : "not read",
      share == null ? "" : pctText(share),
    ]);
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
          <a
            href={eth("address", owner)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm hover:underline"
            data-umbrella-owner={owner}
            data-steward={owner}
            data-steward-role="owner"
          >
            <Prov info={aaveUmbrellaOwnerProv(coords, owner)}>{shortAddress(owner)}</Prov>
          </a>
        ) : (
          UNREAD
        ),
      },
      {
        id: "reserve",
        label: "Reserve",
        tip: "The Aave V3 reserve this token stands behind, and whether Umbrella reports a slashable deficit on it at this block.",
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
        tip: "The most a slashing may take at this block, read from the contract's configuration.",
        asset,
        value: fig(
          "umbrella-max-slashable",
          u.maxSlashable ? (
            <Prov info={aaveUmbrellaMaxSlashableProv(coords)}>{assetText(u.maxSlashable, ad)}</Prov>
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
      venue: assetVault ? (
        <Link
          href={ethereumVaultHref(assetVault.address)}
          className={PAGE_LINK}
          prefetch={false}
          data-catalogue-member={assetVault.address}
        >
          {unit}
        </Link>
      ) : (
        unit
      ),
      sub: reserve ? `staked behind the ${reserve.symbol} reserve` : "the stake",
      amount: u.assetHeld,
      amountProv: aaveUmbrellaCustodyProv(coords),
      amountFigure: "umbrella-asset-held",
      share,
      shareProv: vaultVenueShareProv(v, `the ${unit} the token holds`, "totalAssets()"),
      links: (
        <a
          href={eth("address", vault.asset.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-external text-xs"
        >
          {unit}
        </a>
      ),
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
        links: (
          <Link href={ethereumVaultHref(w.address)} className={PAGE_LINK} prefetch={false}>
            the wrapper
          </Link>
        ),
        hooks: { "data-wrapper-hop": w.address },
      });
      exportRows.push([
        `hop to ${reserve?.symbol ?? "the reserve"}: one ${w.symbol ?? "wrapper share"} = ${w.sharePrice ? sharePriceText(w.sharePrice, reserve?.decimals ?? ad) : "not read"}`,
        "",
        "",
      ]);
    }
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

  const status = data.sgho?.paused
    ? {
        word: "Paused",
        tone: "caution" as const,
        tip: "The vault answers paused() true at this block, which zeroes every one of its max-* answers.",
      }
    : null;

  return (
    <ProvReceiptsScope registry={registry}>
      <VaultCard
        vault={v}
        yieldFigure={yieldFigure}
        holdersHref={ethereumVaultsListingHref({ vault: vault.address })}
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
        readAt={
          <>
            Read at <BlockRef block={data.blockNumber} chainId={MAINNET_CHAIN_ID} />, on this vault and the contracts it
            names
          </>
        }
        exports={{ stats: exportStats, rows: exportRows }}
      />
      <VaultAssets
        rows={rows}
        assetSymbol={unit}
        assetDecimals={ad}
        line={
          family === "sgho" ? (
            <>The GHO the contract holds, beside its total assets.</>
          ) : family === "stata" ? (
            <>One supply position in the Aave V3 Core market.</>
          ) : (
            <>
              The stake, and the hop to the <PanelFigure>{data.umbrella?.reserve?.symbol ?? "reserve"}</PanelFigure> it
              covers.
            </>
          )
        }
        shareTip="The row's amount over the vault's totalAssets(), both read at this block."
        learnMore={aaveVaultAssetsContent(family)}
      />
      <VaultFinder />
    </ProvReceiptsScope>
  );
}

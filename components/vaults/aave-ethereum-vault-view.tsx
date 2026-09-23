"use client";

// One Aave vault on Ethereum — its market view, and one address's position in it.
// ----------------------------------------------------------------------------
// TWO VIEWS, TWO ROUTES, one file because they share a family's vocabulary:
//
//   • `AaveEthereumVaultView` — /ethereum/aave/vaults/<vault>, the MARKET VIEW: what
//     the vault is and what it holds, as deep as its family goes, with the two
//     ways on from it (an address's own position, and every address that has
//     ever held it).
//   • `AaveEthereumVaultPositionView` — /ethereum/aave/vaults/<vault>/<holder>, ONE
//     POSITION: the listing's own card for the pair — which now carries what is
//     redeemable now, the exit and the cooldown on its own context strip — what
//     the holding address is, and the lifetime flows and timeline beneath.
//
// A position has a path rather than a query because it is a subject, not a
// filter — the same grammar as a trove's own page.
//
// THE PAGE IS ORGANISED BY FAMILY BECAUSE THE FAMILIES ARE DIFFERENT MACHINES.
// A savings vault, a wrapper over a supply position and a stake that can be
// slashed answer "what is this worth" in three different ways, and a layout
// that printed the same six cards for all three would be telling a reader they
// are the same kind of thing. So the middle of this page is one section per
// family, each stating its own mechanic from its own contract's reads.
//
// THREE THINGS THIS PAGE REFUSES TO DO, and each is a rule rather than an
// oversight:
//
//  1. NO USD, ANYWHERE. Every figure is a quantity of one named token. A stake
//     token publishes a USD oracle price (`latestAnswer()`); it is not read.
//  2. NO RATE OF RETURN. sGHO's target rate renders in the basis points the
//     contract stores, and its rate per second in the RAY it stores. Neither is
//     compounded out, annualised, or turned into what a holder earns — that
//     would be a forecast of a setting the risk council can change tomorrow.
//  3. NO HOLDER'S SHARE OF A SLASHABLE AMOUNT. The slashing figures are the
//     contract's own configuration and its own readings, in native units. What
//     one holder would lose in a slashing that has not happened is a
//     projection, and the way to keep refusing it is not to compute it.
//
// AND TWO THINGS IT INSISTS ON:
//
//  • A ZERO IS A READING; AN UNREAD CALL IS NOT. `maxRedeem()` answering zero
//    beside a positive balance is the state an Umbrella holder is in, and the
//    cooldown line beside it says which state. A call that did not answer is
//    stated as unread — never a dash, never a zero.
//  • THE LAST HOP'S SYMBOL NEVER STANDS AGAINST THE FIRST HOP'S AMOUNT. Three
//    of the four stake tokens hold a static aToken rather than the reserve
//    asset, so a stake holder is three hops from USDC. Every hop is a separate
//    read with its own unit named beside it.
//
// A CLIENT COMPONENT: the receipts scope, the <Prov> registrations and the
// Learn-More machinery are client machinery. The lookup is a NATIVE GET form —
// no handler, no hydration needed — so a submit made before React attaches is a
// normal navigation rather than a click dropped on the floor.
//
// Colour: house neutrals only. A slashable stake and a savings vault are the
// same KIND of fact, and tinting one as a warning would be this page choosing
// the stops rather than the chain choosing them.

import { Fragment } from "react";
import Link from "next/link";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { AaveVaultIntroDrawer } from "@/components/vaults/aave-vault-intro-drawer";
import { CatalogueMemberLink, HolderShapeLine, addressLink } from "@/components/vaults/aave-vault-holder-parts";
import {
  StatCard,
  assetText,
  pctText,
  shareText,
  shortAddress,
} from "@/components/protocol/morpho-base/vault-exposure-parts";
import { durationText, sharePriceText, signedText, utcInstant } from "@/components/vaults/aave-vault-format";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { ethereumVaultHref, ethereumVaultsListingHref } from "@/lib/vaults/routes";
import {
  aaveSghoAssetGapProv,
  aaveSghoAssetHeldProv,
  aaveSghoCapacityProv,
  aaveSghoLastUpdateProv,
  aaveSghoRatePerSecondProv,
  aaveSghoYieldIndexProv,
  aaveStataATokenBalanceProv,
  aaveStataCustodyGapProv,
  aaveStataLiquidityIndexProv,
  aaveStataRewardTokensProv,
  aaveUmbrellaCustodyProv,
  aaveUmbrellaDeficitOffsetProv,
  aaveUmbrellaMaxSlashableProv,
  aaveUmbrellaMinRemainingProv,
  aaveUmbrellaOwnerProv,
  aaveUmbrellaPendingDeficitProv,
  aaveUmbrellaWrapperClaimProv,
  aaveUmbrellaWrapperPriceProv,
  aaveVaultATokenProv,
  aaveVaultBackedByProv,
  aaveVaultCooldownProv,
  aaveVaultHolderClaimProv,
  aaveVaultHolderFractionProv,
  aaveVaultHolderSharesProv,
  aaveVaultReserveHopProv,
  aaveVaultSharePriceProv,
  aaveVaultSlashableProv,
  aaveVaultSupplyCapProv,
  aaveVaultTargetRateProv,
  aaveVaultTotalAssetsProv,
  aaveVaultTotalSupplyProv,
  type AaveVaultCoords,
} from "@/lib/aave-vaults/vault-provenance";
import type { AaveEthereumVaultResponse } from "@/lib/sources/chain/aave-ethereum-vault";

const n = (v: number) => v.toLocaleString("en-US");
const ZERO = BigInt(0);
const AAVE_V3_MARKET_HREF = "/ethereum/aave-v3/market";
const UNREAD = <span className="text-base font-normal text-rb-500">not read</span>;

/** THE MARKET VIEW — /ethereum/aave/vaults/<vault>. What the vault is, what it
 *  holds, and the two ways on from it: one address's own position (the form,
 *  which navigates to that position's own path) and every address that has ever
 *  held it (the listing, filtered to this vault). */
export function AaveEthereumVaultView({ data }: { data: AaveEthereumVaultResponse }) {
  const registry = useReceiptRegistry();
  const { vault } = data;
  const unit = vault.asset.symbol;
  const ad = vault.asset.decimals;
  const sd = vault.shareDecimals;
  const coords: AaveVaultCoords = {
    blockNumber: data.blockNumber,
    vault: vault.address,
    vaultName: vault.name ?? undefined,
    assetSymbol: unit,
    shareSymbol: vault.symbol ?? undefined,
    reserveSymbol: data.umbrella?.reserve?.symbol,
  };

  return (
    <ProvReceiptsScope registry={registry}>
      {/* ── how this vault works, off the face ───────────────────────────── */}
      {/* The family's whole mechanic, and the statement of what these figures
          are, both stood between the reader and the first number. They are in
          the drawer now, in full; what an individual figure is rides that
          figure's own receipt. */}
      <AaveVaultIntroDrawer
        family={vault.family}
        assetSymbol={unit}
        wrapperSymbol={data.umbrella?.wrapper?.symbol ?? null}
      />

      {/* ── what the vault holds ─────────────────────────────────────────── */}
      <section className="mb-6" data-skel-section="vault-figures">
        <div
          className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
          data-vault-figures
          data-total-assets-raw={data.totalAssets?.raw ?? ""}
          data-total-supply-raw={data.totalSupply?.raw ?? ""}
          data-share-price-raw={data.sharePrice?.raw ?? ""}
        >
          <StatCard label={`Total assets · ${unit}`} figure="total-assets">
            {data.totalAssets ? (
              <Prov info={aaveVaultTotalAssetsProv(coords, vault.family)}>{assetText(data.totalAssets, ad)}</Prov>
            ) : (
              UNREAD
            )}
          </StatCard>
          <StatCard label={`Shares issued · ${vault.symbol ?? "shares"}`} figure="total-supply">
            {data.totalSupply && sd != null ? (
              <Prov info={aaveVaultTotalSupplyProv(coords, sd)}>{shareText(data.totalSupply, sd)}</Prov>
            ) : (
              UNREAD
            )}
          </StatCard>
          <StatCard
            label={`Share price · ${unit}`}
            figure="share-price"
            note={sd != null ? undefined : "The share token's decimals did not answer, so no price is stated."}
          >
            {data.sharePrice && sd != null ? (
              <Prov info={aaveVaultSharePriceProv(coords, sd)}>{sharePriceText(data.sharePrice, ad)}</Prov>
            ) : (
              UNREAD
            )}
          </StatCard>
        </div>
        <BackedBySentence data={data} coords={coords} />
      </section>

      {vault.family === "sgho" && data.sgho && <SghoSection data={data} coords={coords} />}
      {vault.family === "stata" && data.stata && <StataSection data={data} coords={coords} />}
      {vault.family === "umbrella-stake" && data.umbrella && <UmbrellaSection data={data} coords={coords} />}

      {/* ── the two ways on ──────────────────────────────────────────────
          One address's own position, and every address that has ever held this
          vault. The form is a NATIVE GET — no handler, no hydration needed, so
          a submit made before React attaches is a normal navigation — and the
          route it submits to sends the reader on to that position's own path
          (/ethereum/aave/vaults/<vault>/<holder>), where every outcome of the input
          is stated. */}
      <section className="mb-6" data-skel-section="vault-lookup">
        <h2 className="text-sm font-semibold text-foreground">One address&rsquo;s position in this vault</h2>
        <form method="get" className="mt-3 flex max-w-xl flex-wrap items-center gap-2">
          <input
            type="text"
            name="holder"
            placeholder="Address or ENS name"
            aria-label="Address or ENS name"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg bg-raised px-3 py-2 text-[13px] text-foreground placeholder:text-rb-500 focus-ring"
          />
          <button
            type="submit"
            className="rounded-lg bg-rb-200 px-3.5 py-2 text-[13px] font-medium text-foreground focus-ring dark:bg-rb-500/30"
          >
            Open position
          </button>
        </form>
        <p className="mt-3">
          <Link
            href={ethereumVaultsListingHref({ vault: vault.address })}
            className={PAGE_LINK}
            prefetch={false}
            data-link="vault-positions"
            data-positions-vault={vault.address}
          >
            Every address that has held this vault &rarr;
          </Link>
        </p>
      </section>
    </ProvReceiptsScope>
  );
}

/** WHOSE BACKING THESE SHARES ARE — one sentence, under the figures it is about.
 *
 *  A static aToken's largest position is the Umbrella stake token staked on it,
 *  and a reader arriving at that position page met a $58M holding whose whole
 *  life was share transfers with nothing saying why. Both halves of the
 *  relationship are reads this page already makes: the stake token's own
 *  `asset()` returned this vault, and `balanceOf` says how much of it the token
 *  holds (lib/sources/chain/aave-ethereum-vault.ts, `backedBy`).
 *
 *  A SENTENCE AND A LINK, NEVER A TABLE. The listing filtered to the stake token
 *  IS the view of who is behind it, so the sentence goes there rather than
 *  growing a holders table on this page (memory `market-views-link-not-list`).
 *  The link sits on the phrase that names the destination rather than on the
 *  percentage: inside a receipts scope a <Prov> value is itself a click target
 *  while the inspector is armed, and one click cannot mean two things.
 *
 *  It states a share and stops — no ranking, no ordering word, no risk reading,
 *  no colour. What the figure must not be added to is in the receipt and, once,
 *  in the section's own `(i)` page.
 *
 *  Nothing renders where nothing was read: `backedBy` is empty on every stake
 *  token's own page and on sGHO's, which is a reading and not a gap. */
function BackedBySentence({ data, coords }: { data: AaveEthereumVaultResponse; coords: AaveVaultCoords }) {
  if (data.chainStale || data.backedBy.length === 0) return null;
  return (
    <>
      {data.backedBy.map((b) => {
        const name = b.symbol ?? shortAddress(b.address);
        return (
          <p
            key={b.address}
            className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500"
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
              {name}
            </Link>{" "}
            holds{" "}
            <span className="tabular-nums text-foreground" data-figure="vault-backed-by-share">
              <Prov info={aaveVaultBackedByProv(coords, name, b.address)}>{pctText(b.fraction)}</Prov>
            </span>{" "}
            of this vault at block {n(data.blockNumber)} — its own <code>asset()</code> is this vault, so these shares
            are the backing for{" "}
            <Link
              href={ethereumVaultsListingHref({ vault: b.address })}
              className={PAGE_LINK}
              prefetch={false}
              data-link="backed-by-holders"
              data-backed-by-holders={b.address}
            >
              that stake token&rsquo;s own holders &rarr;
            </Link>
          </p>
        );
      })}
    </>
  );
}

/** ONE POSITION — /ethereum/aave/vaults/<vault>/<holder>.
 *
 *  The card is the one statement of what is held: shares, what the vault's own
 *  `convertToAssets` says they convert to, the share of the vault, and — on the
 *  strip riding its heading row — what is redeemable at this block, the exit
 *  and the cooldown that decides the first of those. What the card does not
 *  carry is stated under it and nowhere twice: what the holding address is, and
 *  the wrapper's own conversion where the family has one.
 *
 *  The family's whole mechanic is in the intro drawer, as it is on the market
 *  view: a reader who arrived on a position did not ask to be taught the family
 *  first. */
export function AaveEthereumVaultPositionView({
  data,
  positionCard,
  timeline,
}: {
  data: AaveEthereumVaultResponse;
  /** The SAME card the listing draws for this `(vault, holder)` pair, rendered
   *  upstream on the server (its census lane is a store read) and streamed in.
   *  Null when the census has no row for this address — which is a fact about
   *  the census, not about the address, and the reading below is unaffected. */
  positionCard?: React.ReactNode;
  /** The holder's own events in this vault and the lifetime flows above them,
   *  rendered upstream on the server and handed in as a node. It is a slot
   *  rather than a prop of data because the loader behind it is server-only and
   *  its reads are slower than this page's: the page streams it into place
   *  behind a Suspense boundary while everything else is already painted. */
  timeline?: React.ReactNode;
}) {
  const registry = useReceiptRegistry();
  const { vault, holder } = data;
  const coords: AaveVaultCoords = {
    blockNumber: data.blockNumber,
    vault: vault.address,
    vaultName: vault.name ?? undefined,
    assetSymbol: vault.asset.symbol,
    shareSymbol: vault.symbol ?? undefined,
    reserveSymbol: data.umbrella?.reserve?.symbol,
    holder: holder?.address,
  };

  return (
    <ProvReceiptsScope registry={registry}>
      <AaveVaultIntroDrawer
        family={vault.family}
        assetSymbol={vault.asset.symbol}
        wrapperSymbol={data.umbrella?.wrapper?.symbol ?? null}
      />

      {holder && <HolderSection data={data} coords={coords} positionCard={positionCard} />}

      {/* Server-rendered upstream and streamed in: the reading above is calls
          at one block and paints immediately, while the timeline's log sweeps
          take their own moment. It arrives as a node rather than as data so
          this client component never learns the loader.

          THE KEYED FRAGMENT IS LOAD-BEARING. What arrives here is not an
          element but the streamed reference React resolves when the server has
          spoken, and it sits in this scope's children beside two elements —
          a list, which React asks keys of and cannot take one from a reference
          that is not an element yet. Wrapping it in a fragment gives the list
          an element to key, and adds nothing to the DOM. */}
      {holder && <Fragment key="history">{timeline}</Fragment>}
    </ProvReceiptsScope>
  );
}

// ── sGHO ─────────────────────────────────────────────────────────────────────

function SghoSection({ data, coords }: { data: AaveEthereumVaultResponse; coords: AaveVaultCoords }) {
  const s = data.sgho!;
  const unit = data.vault.asset.symbol;
  const ad = data.vault.asset.decimals;
  return (
    <section className="mb-6" data-skel-section="vault-mechanic" data-mechanic="sgho">
      <h2 className="text-sm font-semibold text-foreground">Savings GHO at this block</h2>
      {s.paused != null && (
        <p className="mt-1 text-[12px] text-rb-500" data-figure="sgho-paused">
          {s.paused
            ? "The vault is paused at this block, which zeroes every one of its max-* answers."
            : "The vault is not paused at this block."}
        </p>
      )}
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Target rate · basis points" figure="sgho-target-rate" note="A setting, not a return.">
          {s.targetRateBps != null ? (
            <Prov info={aaveVaultTargetRateProv(coords, s.targetRateBps)}>{n(s.targetRateBps)}</Prov>
          ) : (
            UNREAD
          )}
        </StatCard>
        <StatCard label={`Deposit cap · ${unit}`} figure="sgho-supply-cap">
          {s.supplyCap ? <Prov info={aaveVaultSupplyCapProv(coords)}>{assetText(s.supplyCap, ad)}</Prov> : UNREAD}
        </StatCard>
        <StatCard label={`Remaining capacity · ${unit}`} figure="sgho-capacity">
          {s.remainingCapacity ? (
            <Prov info={aaveSghoCapacityProv(coords)}>{assetText(s.remainingCapacity, ad)}</Prov>
          ) : (
            UNREAD
          )}
        </StatCard>
        <StatCard label={`${unit} the contract holds`} figure="sgho-asset-held" note="What withdrawals are clamped to.">
          {s.assetHeld ? <Prov info={aaveSghoAssetHeldProv(coords)}>{assetText(s.assetHeld, ad)}</Prov> : UNREAD}
        </StatCard>
        <StatCard
          label={`Balance minus index total · ${unit}`}
          figure="sgho-asset-gap"
          note="Two reads, stated rather than reconciled."
        >
          {s.assetHeldGap ? (
            <Prov info={aaveSghoAssetGapProv(coords)}>{signedText(s.assetHeldGap, assetText(s.assetHeldGap, ad))}</Prov>
          ) : (
            UNREAD
          )}
        </StatCard>
        <StatCard
          label="Index last updated"
          figure="sgho-last-update"
          note="A timestamp the contract stores, not this block's own."
        >
          {s.lastUpdate != null ? (
            <span className="text-sm">
              <Prov info={aaveSghoLastUpdateProv(coords)}>{utcInstant(s.lastUpdate)}</Prov>
            </span>
          ) : (
            UNREAD
          )}
        </StatCard>
      </div>
      <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-rb-500">
        The two slots the conversions run on, RAY-scaled (10
        <sup data-prov-exempt="">27</sup>): the yield index{" "}
        {s.yieldIndex ? (
          <span className="font-mono" data-figure="sgho-yield-index">
            <Prov info={aaveSghoYieldIndexProv(coords)}>{s.yieldIndex}</Prov>
          </span>
        ) : (
          <span>not read</span>
        )}{" "}
        and the rate per second{" "}
        {s.ratePerSecond ? (
          <span className="font-mono" data-figure="sgho-rate-per-second">
            <Prov info={aaveSghoRatePerSecondProv(coords)}>{s.ratePerSecond}</Prov>
          </span>
        ) : (
          <span>not read</span>
        )}
        .
      </p>
    </section>
  );
}

// ── static aTokens ───────────────────────────────────────────────────────────

function StataSection({ data, coords }: { data: AaveEthereumVaultResponse; coords: AaveVaultCoords }) {
  const s = data.stata!;
  const unit = data.vault.asset.symbol;
  const ad = data.vault.asset.decimals;
  // The link, proved from both ends: the wrapper says which aToken it wraps and
  // the Pool says which aToken belongs to the reserve. Equal is the claim; not
  // equal would be the finding, and it is stated rather than hidden.
  const linkAgrees = s.aToken != null && s.poolAToken != null ? s.aToken === s.poolAToken : null;
  return (
    <section className="mb-6" data-skel-section="vault-mechanic" data-mechanic="stata">
      <h2 className="text-sm font-semibold text-foreground">The wrapped position at this block</h2>
      <p className="mt-1 text-[12px] text-rb-500">
        A non-rebasing claim on a supply position in the{" "}
        <Link href={AAVE_V3_MARKET_HREF} className={PAGE_LINK} prefetch={false} data-link="aave-v3-market">
          Aave V3 Core market
        </Link>
        .
      </p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Wrapped aToken" figure="stata-atoken" note="Asked of the wrapper itself.">
          {s.aToken ? (
            <span className="font-mono text-sm" data-stata-atoken={s.aToken}>
              <Prov info={aaveVaultATokenProv(coords)}>{shortAddress(s.aToken)}</Prov>
            </span>
          ) : (
            UNREAD
          )}
        </StatCard>
        <StatCard label={`aToken held · ${unit}`} figure="stata-atoken-balance">
          {s.aTokenBalance ? (
            <Prov info={aaveStataATokenBalanceProv(coords, s.aToken)}>{assetText(s.aTokenBalance, ad)}</Prov>
          ) : (
            UNREAD
          )}
        </StatCard>
        <StatCard
          label={`aToken held minus total assets · ${unit}`}
          figure="stata-custody-gap"
          note="Floor rounding, stated rather than reconciled away."
        >
          {s.custodyGap ? (
            <Prov info={aaveStataCustodyGapProv(coords)}>{signedText(s.custodyGap, assetText(s.custodyGap, ad))}</Prov>
          ) : (
            UNREAD
          )}
        </StatCard>
      </div>
      <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-rb-500">
        The reserve&rsquo;s liquidity index in the Pool is{" "}
        {s.liquidityIndex ? (
          <span className="font-mono" data-figure="stata-liquidity-index">
            <Prov info={aaveStataLiquidityIndexProv(coords, s.pool)}>{s.liquidityIndex}</Prov>
          </span>
        ) : (
          <span>not read</span>
        )}{" "}
        — a RAY. The Pool is {s.pool ? addressLink(s.pool) : <span>not read</span>}.{" "}
        {linkAgrees === true && (
          <span data-stata-link-agrees="true">
            That Pool answers the same aToken for this reserve as the wrapper does — read from both ends.
          </span>
        )}
        {linkAgrees === false && (
          <span data-stata-link-agrees="false">
            The Pool answers a different aToken for this reserve than the wrapper does ({shortAddress(s.poolAToken!)}),
            which is a disagreement between two reads at one block and is stated here rather than resolved.
          </span>
        )}
      </p>
      <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-rb-500" data-figure="stata-reward-tokens">
        <Prov info={aaveStataRewardTokensProv(coords, s.rewardTokens?.length ?? 0)}>
          {s.rewardTokens == null
            ? "The wrapper's reward-token registry did not answer at this block."
            : s.rewardTokens.length === 0
              ? "The wrapper's own rewardTokens() returned an empty list at this block."
              : `The wrapper's own rewardTokens() returned ${n(s.rewardTokens.length)} address${s.rewardTokens.length === 1 ? "" : "es"} at this block.`}
        </Prov>{" "}
        It is a registry, so it can under-report: a reward the Pool started paying since the wrapper was deployed has to
        be registered before it appears there.
      </p>
    </section>
  );
}

// ── Umbrella stake tokens ────────────────────────────────────────────────────

function UmbrellaSection({ data, coords }: { data: AaveEthereumVaultResponse; coords: AaveVaultCoords }) {
  const u = data.umbrella!;
  const unit = data.vault.asset.symbol;
  const ad = data.vault.asset.decimals;
  const reserve = u.reserve;
  const rd = reserve?.decimals ?? ad;
  return (
    <section className="mb-6" data-skel-section="vault-mechanic" data-mechanic="umbrella-stake">
      <h2 className="text-sm font-semibold text-foreground">The stake at this block</h2>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Cooldown, then window" figure="umbrella-cooldown">
          {u.cooldownSeconds != null && u.unstakeWindowSeconds != null ? (
            <span className="text-sm">
              <Prov info={aaveVaultCooldownProv(coords, u.cooldownSeconds, u.unstakeWindowSeconds)}>
                {durationText(u.cooldownSeconds)}, then {durationText(u.unstakeWindowSeconds)}
              </Prov>
            </span>
          ) : (
            UNREAD
          )}
        </StatCard>
        <StatCard
          label={`Slashable amount · ${unit}`}
          figure="umbrella-max-slashable"
          note="Not a claim that it will be."
        >
          {u.maxSlashable ? (
            <Prov info={aaveUmbrellaMaxSlashableProv(coords)}>{assetText(u.maxSlashable, ad)}</Prov>
          ) : (
            UNREAD
          )}
        </StatCard>
        <StatCard
          label={`Minimum left behind · ${unit}`}
          figure="umbrella-min-remaining"
          note="The floor a slashing may not cross."
        >
          {u.minAssetsRemaining ? (
            <Prov info={aaveUmbrellaMinRemainingProv(coords)}>{assetText(u.minAssetsRemaining, ad)}</Prov>
          ) : (
            UNREAD
          )}
        </StatCard>
        <StatCard label={`${unit} the token holds`} figure="umbrella-asset-held">
          {u.assetHeld ? <Prov info={aaveUmbrellaCustodyProv(coords)}>{assetText(u.assetHeld, ad)}</Prov> : UNREAD}
        </StatCard>
        {reserve && (
          <StatCard
            label={`Deficit offset · ${reserve.symbol}`}
            figure="umbrella-deficit-offset"
            note="The buffer a deficit must exceed."
          >
            {u.deficitOffset ? (
              <Prov info={aaveUmbrellaDeficitOffsetProv(coords)}>{assetText(u.deficitOffset, rd)}</Prov>
            ) : (
              UNREAD
            )}
          </StatCard>
        )}
        {reserve && (
          <StatCard
            label={`Pending deficit · ${reserve.symbol}`}
            figure="umbrella-pending-deficit"
            note="A zero is a reading."
          >
            {u.pendingDeficit ? (
              <Prov info={aaveUmbrellaPendingDeficitProv(coords)}>{assetText(u.pendingDeficit, rd)}</Prov>
            ) : (
              UNREAD
            )}
          </StatCard>
        )}
      </div>

      <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-rb-500" data-figure="umbrella-reserve">
        {reserve ? (
          <>
            <Prov info={aaveVaultReserveHopProv(coords, reserve.symbol)}>This token covers {reserve.symbol}</Prov>, and{" "}
            {u.reserveSlashable != null ? (
              <Prov info={aaveVaultSlashableProv(coords, reserve.symbol, u.reserveSlashable)}>
                {u.reserveSlashable
                  ? "Umbrella reports a slashable deficit on that reserve at this block"
                  : "Umbrella reports no slashable deficit on that reserve at this block"}
              </Prov>
            ) : (
              <span>Umbrella&rsquo;s answer about that reserve was not read</span>
            )}
            .
          </>
        ) : (
          <>The reserve this token covers could not be reached at this block, so nothing is stated about it.</>
        )}
        {u.owner && (
          <>
            {" "}
            Slashable only by its <code>owner()</code>,{" "}
            <span data-umbrella-owner={u.owner}>
              <Prov info={aaveUmbrellaOwnerProv(coords, u.owner)}>{shortAddress(u.owner)}</Prov>
            </span>
            .
          </>
        )}
      </p>

      {u.wrapper && (
        <div className="mt-3 rounded-xl bg-raised px-4 py-3.5" data-wrapper-hop={u.wrapper.address}>
          <h3 className="text-[13px] font-semibold text-foreground">The hop to {reserve?.symbol ?? "the reserve"}</h3>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-rb-500">
            This token&rsquo;s <code>asset()</code> is{" "}
            <CatalogueMemberLink
              vault={{ address: u.wrapper.address, family: "stata", symbol: u.wrapper.symbol }}
              coords={coords}
              what="This vault's asset"
            />
            &rarr; {reserve ? reserve.symbol : "not read"}, via{" "}
            {u.wrapper.aToken && (
              <>
                {addressLink(u.wrapper.aToken)} at index{" "}
                <span className="font-mono" data-figure="umbrella-wrapper-index">
                  {u.wrapper.liquidityIndex ? (
                    <Prov info={aaveStataLiquidityIndexProv({ ...coords, assetSymbol: reserve?.symbol }, null)}>
                      {u.wrapper.liquidityIndex}
                    </Prov>
                  ) : (
                    "not read"
                  )}
                </span>
                .
              </>
            )}
          </p>
          {u.wrapper.sharePrice && u.wrapper.decimals != null && (
            <p className="mt-2 text-[12px] text-rb-500">
              One {u.wrapper.symbol ?? "wrapper share"} is{" "}
              <span className="tabular-nums text-foreground" data-figure="umbrella-wrapper-price">
                <Prov
                  info={aaveUmbrellaWrapperPriceProv(coords, u.wrapper.symbol ?? "the wrapper", u.wrapper.decimals)}
                >
                  {sharePriceText(u.wrapper.sharePrice, rd)}
                </Prov>
              </span>{" "}
              {reserve?.symbol ?? ""}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ── the holder ───────────────────────────────────────────────────────────────

function HolderSection({
  data,
  coords,
  positionCard,
}: {
  data: AaveEthereumVaultResponse;
  coords: AaveVaultCoords;
  positionCard?: React.ReactNode;
}) {
  const holder = data.holder!;
  const { vault } = data;
  const unit = vault.asset.symbol;
  const ad = vault.asset.decimals;
  const reserve = data.umbrella?.reserve;
  const wrapper = data.umbrella?.wrapper;
  const holdsNothing = BigInt(holder.shares.raw) === ZERO;

  return (
    <section
      className="mb-6"
      data-skel-section="vault-holder"
      data-holder={holder.address}
      data-holder-shares-raw={holder.shares.raw}
      data-holder-claim-raw={holder.claim?.raw ?? ""}
      data-max-redeem-raw={holder.maxRedeem?.raw ?? ""}
      data-holder-shape-kind={holder.shape?.kind ?? ""}
      data-holder-cooldown-state={holder.cooldown?.state ?? ""}
    >
      <h2 className="text-sm font-semibold text-foreground">What this address holds</h2>

      {/* The SAME card the listing draws for this pair — now carrying its
          receipts, so each figure on it traces the lane it came from. It sits
          at the top of this section because it is the summary the reader
          arrived from; the reads below it are the deeper ones. */}
      {positionCard && <div className="mt-3">{positionCard}</div>}

      {/* The holder's identity is stated ONCE, on the card above: its pill wears
          the name that was typed, and its foot carries the link out and the
          note that a name was resolved. This block used to restate the same
          pill forty pixels below the card that already carried it. */}

      {holder.catalogued && (
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="holder-catalogued">
          This address is itself <CatalogueMemberLink vault={holder.catalogued} coords={coords} what="This holder" /> —
          one vault in Aave&rsquo;s layer holding another. The shares are attributed to the address, not to whoever
          holds it.{" "}
          {/* THE WAY THROUGH, because the question this line raises is "held on
              whose behalf, then?" and the answer is a page that already exists:
              the listing filtered to that vault. A link rather than a list —
              the listing IS the view of its holders (memory
              `market-views-link-not-list`). */}
          <Link
            href={ethereumVaultsListingHref({ vault: holder.catalogued.address })}
            className={PAGE_LINK}
            prefetch={false}
            data-link="holder-vault-holders"
            data-holder-vault-holders={holder.catalogued.address}
          >
            The holders behind this balance are here &rarr;
          </Link>
        </p>
      )}

      {holder.shape && <HolderShapeLine shape={holder.shape} coords={coords} blockNumber={data.blockNumber} />}

      {holdsNothing ? (
        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="holder-no-shares">
          This address holds no shares of this vault at block {n(data.blockNumber)} — a reading of{" "}
          <code>balanceOf()</code> at that block.
        </p>
      ) : (
        <>
          {/* WHAT THE CARD DOES NOT SAY, and nothing it does.
              The card above states the shares, the claim and the share of the
              vault; restating them in a row of tiles under it would make the
              page say one thing twice and leave a reader wondering which is
              the statement.

              WHAT IS REDEEMABLE NOW, THE EXIT AND THE COOLDOWN LEFT THIS
              SECTION for the card's own context strip
              (components/vaults/vault-context-strip.tsx), which the page hands
              the card as `rowExtra`. They were three paragraphs of prose under
              a card that had already said everything else about this address;
              they are three labelled clusters on the card now, and the section
              keeps only the reads no card carries. The section's data
              attributes stay where they are — `data-max-redeem-raw` and
              `data-holder-cooldown-state` are the loader's own answers and are
              read by checks that never cared which element printed them. */}

          {wrapper && holder.claim && (
            <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500">
              Through the wrapper,{" "}
              {wrapper.holderClaim ? (
                <span className="tabular-nums text-foreground" data-figure="holder-wrapper-claim">
                  <Prov info={aaveUmbrellaWrapperClaimProv(coords, wrapper.symbol ?? "the wrapper")}>
                    {assetText(wrapper.holderClaim, reserve?.decimals ?? ad)}
                  </Prov>
                </span>
              ) : (
                <span>not read</span>
              )}{" "}
              {reserve?.symbol ?? ""} — a conversion at this block, not a redemption.
            </p>
          )}
        </>
      )}
    </section>
  );
}

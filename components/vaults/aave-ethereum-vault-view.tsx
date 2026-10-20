"use client";

// One address's position in one Aave vault on Ethereum —
// /ethereum/aave/vaults/<vault>/<holder>: the listing's own card for the pair,
// which carries what is redeemable now, the exit and the cooldown on its own
// context strip, what the holding address is, and the lifetime flows and
// timeline beneath. The vault's own page is components/vaults/
// aave-ethereum-vault-page.tsx (the vault card, ui-jobs 407).
//
// A position has a path rather than a query because it is a subject, not a
// filter — the same grammar as a trove's own page.
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
import { CatalogueMemberLink, HolderShapeLine } from "@/components/vaults/aave-vault-holder-parts";
import { assetText } from "@/components/protocol/morpho-base/vault-exposure-parts";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { ethereumVaultsListingHref } from "@/lib/vaults/routes";
import { aaveUmbrellaWrapperClaimProv, type AaveVaultCoords } from "@/lib/aave-vaults/vault-provenance";
import type { AaveEthereumVaultResponse } from "@/lib/sources/chain/aave-ethereum-vault";
import { NotLoaded } from "@/components/shared/not-loaded";

const n = (v: number) => v.toLocaleString("en-US");
const ZERO = BigInt(0);

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
                <NotLoaded inline className="" />
              )}{" "}
              {reserve?.symbol ?? ""} — a conversion at this block, not a redemption.
            </p>
          )}
        </>
      )}
    </section>
  );
}

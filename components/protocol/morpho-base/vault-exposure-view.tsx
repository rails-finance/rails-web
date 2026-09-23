"use client";

// One MetaMorpho vault on Base, and one address's attributed slice of it.
// ----------------------------------------------------------------------------
// The page's claim, stated once so every figure below can be read against it: a
// vault pools deposits and a curator allocates the pool across Morpho Blue
// markets, so what an address holds is a SHARE OF THE POOL, not a position in
// any one market. This view takes that share and applies it to each of the
// vault's own Blue positions. It is an attribution, not fund-tracing, and the
// prose, the modal and every attribution receipt each say so — a caveat carried
// in only one of the three would be missing wherever a reader started.
//
// THREE FIGURES THAT MUST NOT BE COLLAPSED INTO ONE:
//
//   • totalAssets()          the vault's own total, interest extrapolated to the
//                            block's timestamp;
//   • Σ legs                 the same holdings as Morpho Blue last SETTLED them
//                            (Blue accrues only when a market is touched);
//   • the gap between them   stated as its own card, never rounded away.
//
// The holder half has the same shape: `convertToAssets(shares)` is the VAULT's
// answer, Σ of the attributed rows is the holder's slice of the stored legs, and
// both are shown because they answer slightly different questions. They are NOT
// two roundings of one number — MetaMorpho converts against its extrapolated
// total AND against a supply that includes the performance-fee shares its next
// accrual would mint (about 7 parts per million on the case-study vault). The
// two adjustments pull opposite ways, so either figure can be the larger, and
// nothing here asserts an order between them.
//
// A CLIENT COMPONENT because the receipts scope, the <Prov> registrations and
// the Learn-More modal are client machinery, and because the lookup form lives
// here. The form is a NATIVE GET form: no handler, no hydration needed, so a
// submit made before React attaches is a normal navigation rather than a click
// dropped on the floor.
//
// Colour: house neutrals only. Nothing here is good or bad news — a large stake
// and a dust stake are the same kind of fact — so no figure is tinted.

import { Fragment } from "react";
import Link from "next/link";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { WalletPill } from "@/components/shared/wallet-pill";
import {
  HolderShapeLine,
  StatCard,
  VaultAttributionTable,
  assetText,
  pctText,
  shareText,
  shortId,
} from "@/components/protocol/morpho-base/vault-exposure-parts";
import { morphoVaultExposureContent } from "@/lib/shared/learn-more-content";
import { explorerUrl } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { morphoBasePositionHref } from "@/lib/morpho-base/routes";
import {
  vaultAllocatedProv,
  vaultGapProv,
  vaultHolderClaimProv,
  vaultHolderFractionProv,
  vaultHolderSharesProv,
  vaultLegAssetsProv,
  vaultLegLltvProv,
  vaultLegShareProv,
  vaultLostAssetsProv,
  vaultSharePriceProv,
  vaultTotalAssetsProv,
  vaultTotalSupplyProv,
  type MorphoVaultCoords,
} from "@/lib/morpho-base/vault-provenance";
import type { MorphoBaseVaultResponse } from "@/lib/sources/chain/morpho-base-vault";
import type { HolderLookup } from "@/lib/morpho-base/vault-holder";

// The formatting rules, the stat card, the shape sentence and the attributed
// table all live in ./vault-exposure-parts.tsx — the holder-first page draws the
// same ones, and a second copy of the amount rule would be a second place for
// the two pages to print the same wei differently.

/** A market's one rung. Only the allocation table below shows it, which is only
 *  on this page, so it stays here rather than in the shared parts. */
const lltvText = (lltv: number) => `${(lltv * 100).toFixed(1)}%`;

export function MorphoBaseVaultExposureView({
  data,
  lookup,
  timeline,
  positionCard,
  showLookup = true,
}: {
  data: MorphoBaseVaultResponse;
  /** What the reader typed and what it resolved to — three outcomes, kept
   *  apart: nothing typed, a reason there is no address, or an address. */
  lookup: HolderLookup;
  /** The address's own events in this vault, rendered upstream on the server
   *  and handed in as a node. It is a slot rather than a prop of data because
   *  the loader behind it is server-only and its reads are slower than this
   *  page's: the page streams it into place behind a Suspense boundary while
   *  everything else is already painted. Null when no holder resolved. */
  timeline?: React.ReactNode;
  /** THE POSITION PAGE'S OWN LEAD: the same card the section's listing draws
   *  for this `(vault, holder)` pair, now with receipts. A slot for the same
   *  reason the timeline is one — its census lane comes from the store, on the
   *  server, and it streams in behind its own boundary. Absent on the market
   *  view, which is about the vault and not about any address. */
  positionCard?: React.ReactNode;
  /** The market view carries the address lookup; the position page does not —
   *  its address is the subject in the path, and a form offering to replace it
   *  would be a second answer to a question already answered. */
  showLookup?: boolean;
}) {
  const { vault, legs, holder } = data;
  const coords: MorphoVaultCoords = {
    blockNumber: data.blockNumber,
    vault: vault.address,
    vaultName: vault.name,
    assetSymbol: vault.asset.symbol,
    shareSymbol: vault.symbol,
  };
  const unit = vault.asset.symbol;
  const ad = vault.asset.decimals;
  // ONE receipts scope for the whole surface: the vault figures, the allocation
  // rows and the exposure rows are one reading of one block, and the inspector
  // should list them as one roster in the order the page draws them.
  const registry = useReceiptRegistry();
  const funded = legs.filter((l) => BigInt(l.assets.raw) > BigInt(0)).length;

  return (
    <ProvReceiptsScope registry={registry}>
      {/* A keyed Fragment, and not decoration. Both of these are SERVER slots
          streamed into a client component beside sibling elements, and React
          reads such a slot as a list child: without a key the dev receipts
          tripwire reports "each child in a list should have a unique key" from
          this component's own render. */}
      {positionCard && <Fragment key="position-card">{positionCard}</Fragment>}

      {/* ── what the vault holds ─────────────────────────────────────────── */}
      <section className="mb-6" data-skel-section="vault-figures">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label={`Total assets · ${unit}`}
            figure="total-assets"
            note="The vault's own figure, with interest extrapolated to this block."
          >
            <Prov info={vaultTotalAssetsProv(coords)}>{assetText(data.totalAssets, ad)}</Prov>
          </StatCard>
          <StatCard
            label={`Allocated in Morpho Blue · ${unit}`}
            figure="allocated"
            note="The sum of the vault's supply positions, as Blue last settled them."
          >
            <Prov info={vaultAllocatedProv(coords)}>{assetText(data.allocated, ad)}</Prov>
          </StatCard>
          <StatCard
            label={`Unaccrued interest · ${unit}`}
            figure="gap"
            note="Total assets minus the allocated sum: interest the vault has extrapolated and the markets have not yet settled."
          >
            <Prov info={vaultGapProv(coords)}>{assetText(data.gap, ad)}</Prov>
          </StatCard>
          <StatCard
            label={`Total shares · ${vault.symbol}`}
            figure="total-shares"
            note="Every share of this vault in existence."
          >
            <Prov info={vaultTotalSupplyProv(coords)}>{shareText(data.totalSupply, vault.decimals)}</Prov>
          </StatCard>
          <StatCard
            label={`Share price · ${unit}`}
            figure="share-price"
            note="What one whole share converts to, answered by the vault."
          >
            <Prov info={vaultSharePriceProv(coords)}>
              {data.sharePrice.value.toLocaleString("en-US", {
                minimumFractionDigits: 4,
                maximumFractionDigits: 6,
              })}
            </Prov>
          </StatCard>
          {/* Absent, not zero, on a V1.0 vault: that family reverts on the call
              and keeps no such ledger. A zero here is a claim a V1.1 vault makes. */}
          {data.lostAssets && (
            <StatCard
              label={`Lost assets · ${unit}`}
              figure="lost-assets"
              note="The part of total assets that no market holds. The share price has not been lowered for it. A MetaMorpho V1.1 ledger."
            >
              <Prov info={vaultLostAssetsProv(coords)}>{assetText(data.lostAssets, ad)}</Prov>
            </StatCard>
          )}
        </div>
      </section>

      {/* ── where it sits ────────────────────────────────────────────────── */}
      <section className="mb-6" data-skel-section="vault-allocation">
        <h2 className="text-sm font-semibold text-foreground">Allocation</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-rb-500">
          Every market in the vault&rsquo;s withdraw queue — its own list of where the pool is allocated, in its own
          order. {funded} of {legs.length} carry a balance at this block. An idle market has no collateral token, no
          oracle and no interest-rate model; it is where a vault holds cash inside Blue rather than outside it.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-[12px]">
            <thead>
              <tr className="border-b border-rb-200 text-left text-[11px] uppercase tracking-wider text-rb-500 dark:border-rb-500/30">
                <th className="py-2 pr-3 font-normal">Market</th>
                <th className="py-2 pr-3 text-right font-normal">LLTV</th>
                <th className="py-2 pr-3 text-right font-normal">Supplied · {unit}</th>
                <th className="py-2 pr-3 text-right font-normal">Share</th>
                <th className="py-2 text-right font-normal">Links</th>
              </tr>
            </thead>
            <tbody>
              {legs.map((leg) => {
                const legCoords: MorphoVaultCoords = {
                  ...coords,
                  marketId: leg.id,
                  collateralSymbol: leg.collateralSymbol,
                };
                return (
                  <tr key={leg.id} data-leg={leg.id} className="border-b border-rb-200/60 dark:border-rb-500/20">
                    <td className="py-2 pr-3">
                      <span className={leg.collateralNamed ? "text-foreground" : "font-mono text-foreground"}>
                        {leg.isIdle ? "Idle market" : (leg.collateralSymbol ?? shortId(leg.id))}
                      </span>
                      <span className="ml-2 font-mono text-[11px] text-rb-500">{shortId(leg.id)}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {leg.isIdle ? (
                        <span className="text-rb-500">idle</span>
                      ) : (
                        <Prov info={vaultLegLltvProv(legCoords)}>{lltvText(leg.lltv)}</Prov>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground" data-cell="leg-assets">
                      <Prov info={vaultLegAssetsProv(legCoords)}>{assetText(leg.assets, ad)}</Prov>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-rb-500">
                      {leg.shareOfAllocated == null ? (
                        "—"
                      ) : (
                        <Prov info={vaultLegShareProv(legCoords)}>{pctText(leg.shareOfAllocated)}</Prov>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Link href={`/base/morpho/markets/${leg.loanToken}`} className={PAGE_LINK} prefetch={false}>
                        {unit} markets
                      </Link>
                      <span className="mx-1.5 text-rb-500">·</span>
                      <Link href={morphoBasePositionHref(vault.address, leg.id)} className={PAGE_LINK} prefetch={false}>
                        vault&rsquo;s position
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── the lookup ───────────────────────────────────────────────────── */}
      {showLookup && (
        <section className="mb-6" data-skel-section="vault-lookup">
          <h2 className="text-sm font-semibold text-foreground">Look up an address</h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-rb-500">
            An address&rsquo;s share of this vault, applied to each market above. The result is read at the block this
            page names and the address rides in the URL, so the reading is shareable.
          </p>
          {/* A native GET form: it submits to this same path with ?holder=…, needs
            no JavaScript, and therefore cannot lose a submit made before React
            attaches. */}
          <form method="get" className="mt-3 flex max-w-xl flex-wrap items-center gap-2">
            <input
              type="text"
              name="holder"
              defaultValue={lookup.typed}
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
              Look up
            </button>
          </form>
          {lookup.error === "invalid" && (
            <p className="mt-2 text-[12px] text-rb-500">
              That is neither of the two accepted forms. Enter a 20-byte address starting <code>0x</code>, or an ENS
              name ending <code>.eth</code>.
            </p>
          )}
          {lookup.error === "unresolved" && (
            <p className="mt-2 text-[12px] text-rb-500">No address is recorded for this name on Ethereum mainnet.</p>
          )}
          {lookup.error === "unresolved-basename" && (
            <p className="mt-2 text-[12px] text-rb-500">
              No address is recorded for {lookup.typed} on Basenames on Base at the time of this read.
            </p>
          )}
        </section>
      )}

      {/* ── one address's slice ──────────────────────────────────────────── */}
      {holder && (
        <section className="mb-6" data-skel-section="vault-exposure">
          <h2 className="text-sm font-semibold text-foreground">Attributed exposure</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <WalletPill wallet={holder.address} ensName={lookup.ensName} />
            {/* States which registry answered a typed NAME — nothing for a
                typed address, since there is no resolution to name there. */}
            {lookup.lane === "ens" && <span className="text-[11px] text-rb-500">resolved through mainnet ENS</span>}
            {lookup.lane === "basename" && (
              <span className="text-[11px] text-rb-500">resolved through Basenames on Base</span>
            )}
            <a
              href={explorerUrl(MORPHO_BASE_CHAIN_ID, "address", holder.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="link-external text-[11px]"
            >
              on Basescan
            </a>
          </div>

          {holder.shape && (
            <HolderShapeLine
              shape={holder.shape}
              blockNumber={data.blockNumber}
              coords={{ ...coords, holder: holder.address }}
            />
          )}

          {BigInt(holder.shares.raw) === BigInt(0) ? (
            <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="no-shares">
              This address holds no shares of this vault at block {data.blockNumber.toLocaleString("en-US")}.
            </p>
          ) : (
            <>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                <StatCard
                  label={`Shares held · ${vault.symbol}`}
                  figure="holder-shares"
                  note={
                    holder.dust ? (
                      <>
                        Exactly <Prov info={vaultHolderSharesProv(coords)}>{holder.shares.raw} wei</Prov> of shares —
                        less than 0.0001% of the vault, which is why no percentage is stated for it.
                      </>
                    ) : undefined
                  }
                >
                  <Prov info={vaultHolderSharesProv(coords)}>{shareText(holder.shares, vault.decimals)}</Prov>
                </StatCard>
                <StatCard
                  label="Share of the vault"
                  figure="holder-fraction"
                  note="This balance over every share in existence."
                >
                  {holder.dust ? (
                    <span className="text-base font-normal text-rb-500">less than 0.0001%</span>
                  ) : (
                    <Prov info={vaultHolderFractionProv(coords)}>{pctText(holder.fraction)}</Prov>
                  )}
                </StatCard>
                <StatCard
                  label={`Claim on the vault · ${unit}`}
                  figure="holder-claim"
                  note="The vault's own conversion of this balance. Not the same arithmetic as the rows below: it converts against the vault's extrapolated total and against the share count its next accrual would leave."
                >
                  <Prov info={vaultHolderClaimProv(coords)}>{assetText(holder.claim, ad)}</Prov>
                </StatCard>
              </div>

              <VaultAttributionTable
                legs={legs}
                coords={coords}
                holder={holder.address}
                unit={unit}
                assetDecimals={ad}
                attributedTotal={holder.attributedTotal}
              />
            </>
          )}
        </section>
      )}

      {/* ── and how it got there ─────────────────────────────────────────── */}
      {/* Server-rendered upstream and streamed in: the vault's own figures are
          calls at one block and paint immediately, while the timeline's log
          sweeps take their own moment. It arrives as a node rather than as data
          so this client component never learns the loader. */}
      {holder && <Fragment key="history">{timeline}</Fragment>}

      {/* ── what the figures are, and are not ────────────────────────────── */}
      <section className="rounded-xl bg-raised px-4 py-3.5" data-skel-section="vault-caveat">
        <div className="flex items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h2 className="text-sm font-semibold text-foreground">How the attribution is computed</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-rb-500">
              The attribution is proportional, not fund-tracing. Vault shares are fungible and deposits were pooled
              before the curator allocated them, so two addresses holding equal shares carry equal figures here whatever
              they deposited and whenever. Each row is the address&rsquo;s share of the vault applied to the
              vault&rsquo;s own supplied balance in that market, at the block this page names.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-rb-500">
              The vault&rsquo;s own total extrapolates each market&rsquo;s interest to this block&rsquo;s timestamp; the
              market totals the rows are built from are what Morpho Blue last settled, because Blue accrues only when a
              market is touched. An address with a computed stake is not an identified person unless it carries a name
              of its own.
            </p>
          </div>
          <LearnMore inline content={morphoVaultExposureContent()} />
        </div>
      </section>
    </ProvReceiptsScope>
  );
}

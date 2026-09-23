"use client";

// One vault POSITION as a card — the pair `(vault, holder)`.
// ----------------------------------------------------------------------------
// The same component draws the listing row and (with `receipts`) the position
// page's own card, exactly as every other position card in the tier does. The
// listing render is inert content inside the row <Link>; the detail render is
// its own receipts scope with the Explanation pane at its foot.
//
// TWO LANES ON ONE CARD, KEPT APART IN THE WORDS AS WELL AS THE CODE.
// The figures at the top — Shares, Claim, Share of vault — are read LIVE at the
// block the card names in its foot. The figures under them — Transfers, First
// seen, Last activity, and what the address is — come from the daily census at
// the census block, which the foot names separately. Each wears its own
// receipt, and no receipt is shared across the two.
//
// WHAT A CLOSED CARD DOES NOT DRAW. No Shares and no Claim: an address holding
// nothing has no share balance to state and no conversion to ask for, and a
// zero in those columns would read as a position worth nothing rather than as
// no position. It states the block it was last active in instead, and keeps
// every census figure.
//
// AN UNREAD FIGURE IS SAID. Where the live overlay did not answer for this card
// the shares fall back to the CENSUS's balance, labelled as the census's and at
// the census block; the claim and the share of the vault are simply not stated,
// because the vault answered neither.
//
// ONE USD FIGURE, AND IT NAMES ITS ORACLE AND ITS BLOCK. Shares are share units
// and a claim is the asset's units — the vault's own `convertToAssets` answer,
// never shares times a price this card divided out. The fourth column, Value ·
// USD, is the CENSUS's figure (mig 206): the balance at the census block through
// the vault's own conversion and the chain's Aave V3 oracle at that block,
// computed once by the daily census and carried on the row with every input its
// receipt states. It is a third lane on the card, and the foot names its block
// beside the other two. Where the oracle declined the asset the column prints
// "not priced" in words and its receipt says which oracle declined what —
// never a zero, never a dash, never a substitute feed. No rate, no yield, no
// P&L, no name: the shape line states a MECHANISM ("delegated account",
// "proxy") and never an app; an ENS name is the address's own reverse record.
//
// The frame is `OpenPositionStats` in both states: it is the shared stats grid,
// and its `statusPill` carries the lifecycle word. `ClosedPositionStats` is
// shaped around a peak collateral and debt a vault position has neither of.
//
// ONE CARD, TWO CHAINS. The row carries its own `chainId`, and the three things
// that follow from it — which family word sits beside the share symbol, which
// route the symbol links to, and which explorer the address opens on — are read
// off the row rather than baked in. Everything else about the card is the same
// reads on either chain: `balanceOf`, the vault's own `convertToAssets`, a
// share of `totalSupply`, and a census that swept every `Transfer` whole.
//
// THE VAULT LEADS, THE HOLDER FOLLOWS. The market a position is IN is the first
// thing on the card, the way a trove row leads with its collateral symbol: a
// reader scanning twenty cards is reading twenty markets, and the address is
// what distinguishes two cards inside one of them. The holder pill sits second,
// with the shape word beside it.
//
// ONE HEADLINE FORM, EVERYWHERE THE CARD IS DRAWN. Every headline figure —
// Shares, Claim, Value · USD — states the MAGNITUDE above a thousand ("60.9M",
// "$68.6M") and the exact figure below it, on the listing and on the position
// page alike (decision 2026-09-09). A headline is a reading of size; the
// STATEMENT of the figure is elsewhere and is never lost: the exact value rides
// `title=` on every stat, the receipt states it with its inputs, and the
// context strip under the card says it in words. Two reasons it is one form and
// not two. A 21-digit share balance printed to six decimals overflowed the
// 390px column on the position page — the card scrolled sideways on a phone —
// and six decimals in a headline reads as a different register from every
// reference position card in the tier, which print two and never six.
//
// THE ACTIVITY META IS THE SHARED CLUSTER. `PositionCardMeta` carries the
// time-since-last-activity and the census's transfer count, top-right, as it
// does on every other position card in the tier. That cluster is
// `data-prov-exempt` by construction — the house's "event numbers" class, index
// row counts rather than chain-state figures — so the count is stated there
// rather than as a receipted stat column, and the foot no longer restates the
// dates the cluster already reads out.

import Link from "next/link";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { LifecyclePill } from "@/components/shared/position-card-pills";
import { StatValue } from "@/components/shared/stat-value";
import { WalletPill } from "@/components/shared/wallet-pill";
import { assetText, pctText, shareText, shortAddress } from "@/components/protocol/morpho-base/vault-exposure-parts";
import { AAVE_FAMILY_SINGULAR } from "@/components/vaults/aave-vault-format";
import { VaultVenueMark } from "@/components/vaults/vault-venue-mark";
import { formatApproximate, formatUnitsExact } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { explorerUrl, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { baseVaultHref, ethereumVaultHref } from "@/lib/vaults/routes";
import type { BookmarkScope } from "@/lib/shared/sessions";
import { holderListingSegment } from "@/lib/shared/protocols";
import { attestedAddress, attestedShortName } from "@/lib/shared/attested-addresses";
import {
  VAULT_SHAPE_WORD,
  usdText,
  vaultPositionFraction,
  vaultPositionIsDust,
  vaultPositionStatus,
  vaultPositionUsd,
  type VaultPositionFamily,
  type VaultPositionRow,
} from "@/lib/aave-vaults/vault-position";
import {
  aaveVaultCensusBalanceProv,
  aaveVaultHolderClaimProv,
  aaveVaultHolderFractionProv,
  aaveVaultHolderSharesProv,
  aaveVaultPositionDivergenceProv,
  aaveVaultPositionSeenProv,
  aaveAttestedNameProv,
  aaveVaultPositionShapeProv,
  aaveVaultUnpricedProv,
  aaveVaultValueUsdProv,
  type AaveVaultCoords,
} from "@/lib/aave-vaults/vault-provenance";

const n = (v: number) => v.toLocaleString("en-US");

/** The family word beside the share symbol — the MECHANISM the vault runs as,
 *  in the singular. MetaMorpho is the vault standard on Base, not the name of
 *  an app or of whoever curates a given vault: the curator is a name and stays
 *  off every row. */
const FAMILY_SINGULAR: Record<VaultPositionFamily, string> = {
  ...AAVE_FAMILY_SINGULAR,
  morpho: "MetaMorpho vault",
};

/** Where a row's holder is bookmarked. A vault belongs to the protocol whose
 *  factory deployed it (rails-ops decision 0028), so the bookmark goes in that
 *  EXPLORER's namespace — MetaMorpho's in Morpho Blue Base's, Aave's three
 *  families in the vault layer's. Keyed on the family the row already states,
 *  not on the chain: a chain holds several vault protocols and the next one is
 *  Yearn. */
const FAMILY_BOOKMARK_SCOPE: Record<VaultPositionFamily, BookmarkScope> = {
  morpho: "morpho-base",
  sgho: "aave-vaults",
  stata: "aave-vaults",
  "umbrella-stake": "aave-vaults",
};

/** Which chain a row was censused on, and the two routes that follow from it. */
const chainOf = (row: VaultPositionRow): ChainId => (row.chainId === BASE_CHAIN_ID ? BASE_CHAIN_ID : MAINNET_CHAIN_ID);
const marketHref = (row: VaultPositionRow) =>
  chainOf(row) === BASE_CHAIN_ID ? baseVaultHref(row.vault) : ethereumVaultHref(row.vault);

/** THE headline form of a figure this file already knows how to print exactly —
 *  the same form on the listing and on the position page, because a headline is
 *  the magnitude and the exact figure is stated elsewhere (`title=` on the stat,
 *  the receipt, and the context strip beside the card). Above a thousand the
 *  approximation ("80.8k") is a real reading of the size; below it the section's
 *  own print rule stands, because `formatApproximate` rounds to two decimals
 *  there and a share balance of 0.000004 would state a zero the chain did not. */
const headline = (exact: string, value: number) => (Math.abs(value) >= 1000 ? formatApproximate(value) : exact);

/** The figure a card prints where nothing was read. Never a dash and never a
 *  zero — the words say which of the two absences this is. */
const Unread = ({ what }: { what: string }) => <span className="text-base font-normal text-rb-500">{what}</span>;

/** A block, as a date and a number. The date is the block's own timestamp read
 *  at that block; with no timestamp the block number stands alone rather than
 *  a date being inferred from it. */
function BlockStamp({ block, at }: { block: number; at: number | null }) {
  return (
    <>
      {at != null ? `${formatDate(at)} · ` : ""}block {n(block)}
    </>
  );
}

export function VaultPositionCard({
  row,
  receipts = false,
  holderIdentity,
  learnMore,
  rowExtra,
  explanation,
}: {
  row: VaultPositionRow;
  receipts?: boolean;
  /** THE DETAIL CARD'S OWN IDENTITY LINE. The position page used to restate the
   *  holder under this card — the same pill, forty pixels below the one the
   *  card already carries, with the explorer link beside it. The card is the
   *  page's one statement of who this is, so the two things the block below it
   *  actually added come in here instead: the name that was typed, if one was,
   *  and the link out. Absent (the listing), the card states neither: twenty
   *  rows would carry twenty explorer links, and each row is already a link.
   *
   *  NOT the note that a name was RESOLVED. That is a fact about how the page's
   *  subject was reached, and this card is not always drawn — the census has no
   *  row for an address it has never seen — so the note lives on the page
   *  header, which is. */
  holderIdentity?: { ensName: string | null };
  /** The card's "?" cell — what a vault position IS, what each figure on this
   *  card is a reading of, and what the section refuses to state. Only
   *  meaningful with `receipts`: it sits at the foot of the Explanation pane,
   *  which the listing render has none of. */
  learnMore?: LearnMoreContent | null;
  rowExtra?: React.ReactNode;
  explanation?: React.ReactNode;
}) {
  const status = vaultPositionStatus(row);
  const chainId = chainOf(row);
  const shareDecimals = row.shareDecimals ?? 18;
  const shareSymbol = row.symbol ?? shortAddress(row.vault);
  const fraction = vaultPositionFraction(row);
  const dust = vaultPositionIsDust(row);

  // Two coord sets, because the card draws two lanes: one anchored to the block
  // the overlay read at, one to the block the census swept to. A receipt takes
  // whichever names the block ITS figure was read at.
  const coords: AaveVaultCoords = {
    blockNumber: row.live?.blockNumber,
    censusBlock: row.census.block,
    chainId,
    vault: row.vault,
    vaultName: row.symbol ?? undefined,
    shareSymbol: row.symbol ?? undefined,
    assetSymbol: row.asset?.symbol,
    holder: row.holder,
  };

  // ── THE NAME, WHERE A PUBLISHED REGISTRY CARRIES ONE ──────────────────────
  // Rung 1 of the naming ladder is a table, not a read (lib/shared/attested-addresses.ts),
  // so a listing row can name an address without making a call — which is the
  // only reason this can be on a card at all. It REPLACES the shape word rather
  // than sitting beside it: the card's register is one mechanism phrase, and
  // "GSM_USDT in Aave's address book" is the more useful of the two for the same
  // space. The position page still states the shape sentence in full under the
  // card, so nothing is lost by the swap. The shape FACET is untouched — a name
  // is not a shape.
  const attested = attestedAddress(row.holder);
  const shapeWord = row.census.shape ? VAULT_SHAPE_WORD[row.census.shape] : null;
  const codeSize = typeof row.census.shapeDetail?.codeSize === "number" ? row.census.shapeDetail.codeSize : null;

  // ── the figure columns ──────────────────────────────────────────────────
  // Open: what is held, what the vault says it converts to, and how much of the
  // vault it is. Closed: none of the three — the card says when it closed.
  // ON THE DETAIL CARD each figure carries the name the vault page's own
  // sections used to hang on their tiles. Those tiles are gone — the card is
  // the one statement of shares, claim and share of the vault — and the name
  // travels with the statement so anything that read a figure by name still
  // reads THE figure rather than a second copy of it. The listing's rows carry
  // no such marker: twenty cards would make twenty of each name.
  const figureName = (name: string) => (receipts ? name : undefined);

  const censusShares = { raw: row.census.balance, value: Number(row.census.balance) / 10 ** shareDecimals };

  const sharesColumn = {
    label: `Shares · ${shareSymbol}`,
    value: row.live ? (
      <StatValue
        figure={figureName("holder-shares")}
        title={`${formatUnitsExact(row.live.shares.raw, shareDecimals)} ${shareSymbol}`}
      >
        <Prov info={aaveVaultHolderSharesProv(coords)}>
          {headline(shareText(row.live.shares, shareDecimals), row.live.shares.value)}
        </Prov>
      </StatValue>
    ) : (
      <StatValue
        figure={figureName("holder-shares")}
        title={`${formatUnitsExact(row.census.balance, shareDecimals)} ${shareSymbol}`}
      >
        <Prov info={aaveVaultCensusBalanceProv(coords)}>
          {headline(shareText(censusShares, shareDecimals), censusShares.value)}
        </Prov>
      </StatValue>
    ),
    // The one footnote this column ever draws, and it exists because the figure
    // above it changed lanes: without a live read the card falls back to the
    // census's balance, and a reader must be told which block that is.
    footnote: row.live ? undefined : (
      <div className="text-xs mt-0.5 text-rb-500">the census&rsquo;s reading at block {n(row.census.block)}</div>
    ),
  };

  const claimColumn = {
    label: `Claim · ${row.asset?.symbol ?? "the vault's asset"}`,
    value:
      row.live?.claim && row.asset ? (
        <StatValue
          figure={figureName("holder-claim")}
          title={`${formatUnitsExact(row.live.claim.raw, row.asset.decimals)} ${row.asset.symbol}`}
        >
          <Prov info={aaveVaultHolderClaimProv(coords)}>
            {headline(assetText(row.live.claim, row.asset.decimals), row.live.claim.value)}
          </Prov>
        </StatValue>
      ) : (
        <StatValue>
          <Unread what="not read" />
        </StatValue>
      ),
    footnote: <div className="text-xs mt-0.5 text-rb-500">the vault&rsquo;s own convertToAssets()</div>,
  };

  const fractionColumn = {
    label: "Share of the vault",
    value: (
      <StatValue figure={figureName("holder-fraction")}>
        {dust ? (
          <span className="text-base font-normal text-rb-500">less than 0.0001%</span>
        ) : fraction != null ? (
          <Prov info={aaveVaultHolderFractionProv(coords)}>{pctText(fraction)}</Prov>
        ) : (
          <Unread what="not read" />
        )}
      </StatValue>
    ),
    footnote: dust ? (
      <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
        exactly {row.live ? row.live.shares.raw : row.census.balance} wei of shares
      </div>
    ) : undefined,
  };

  // The third lane: the census's USD figure at the priced block, or the words
  // for its absence. It approximates above a thousand dollars the way the share
  // columns do; the exact dollars-and-cents ride `title=`, with the block and
  // the oracle that answered.
  const usd = vaultPositionUsd(row);
  const priced = row.value.usdE8 != null && usd != null;
  const pricedBlock = row.value.pricedBlock ?? row.census.block;
  const valueColumn = {
    label: "Value · USD",
    value: priced ? (
      <StatValue
        figure={figureName("holder-value-usd")}
        title={`${usdText(row.value.usdE8!)} at census block ${n(pricedBlock)}, via the chain's Aave V3 oracle`}
      >
        <Prov info={aaveVaultValueUsdProv(coords, row.value, shareDecimals)}>
          {usd >= 1000 ? `$${formatApproximate(usd)}` : usdText(row.value.usdE8!)}
        </Prov>
      </StatValue>
    ) : (
      <StatValue figure={figureName("holder-value-usd")}>
        <Prov info={aaveVaultUnpricedProv(coords, row.value)}>
          <Unread what="not priced" />
        </Prov>
      </StatValue>
    ),
    footnote: (
      <div className="text-xs mt-0.5 text-rb-500">
        {priced
          ? `Aave V3 oracle at census block ${n(pricedBlock)}`
          : row.value.pricedBlock == null
            ? "the census has not priced this vault yet"
            : `the oracle declined ${row.value.assetSymbol ?? "the asset"}`}
      </div>
    ),
  };

  const closedColumn = {
    label: "Closed by",
    value: (
      <StatValue>
        <Prov info={aaveVaultPositionSeenProv(coords, "last", row.census.lastBlock)}>
          <span className="text-base font-normal">
            <BlockStamp block={row.census.lastBlock} at={row.lastActivityAt} />
          </span>
        </Prov>
      </StatValue>
    ),
    footnote: (
      <div className="text-xs mt-0.5 text-rb-500">
        nothing is held at {status.at === row.census.block ? "the census block" : `block ${n(status.at)}`}
      </div>
    ),
  };

  // The Transfers column is gone: the count is the activity cluster's, top
  // right, beside the time since the last of them.
  const columns = status.live ? [sharesColumn, claimColumn, fractionColumn, valueColumn] : [closedColumn];

  return (
    <PositionCardShell receipts={receipts} rowExtra={rowExtra} explanation={explanation} learnMore={learnMore}>
      <div
        data-position-card={`${row.vault}:${row.holder}`}
        data-vault={row.vault}
        data-holder={row.holder}
        data-status={status.live ? "live" : "closed"}
        data-shares-raw={row.live?.shares.raw ?? ""}
        data-claim-raw={row.live?.claim?.raw ?? ""}
        data-total-supply-raw={row.live?.totalSupply?.raw ?? ""}
        data-census-balance-raw={row.census.balance}
        data-census-block={row.census.block}
        data-live-block={row.live?.blockNumber ?? ""}
        data-transfer-count={row.census.transferCount}
        data-first-block={row.census.firstBlock}
        data-last-block={row.census.lastBlock}
        data-shape={row.census.shape ?? ""}
        data-value-usd-e8={row.value.usdE8 ?? ""}
        data-priced-block={row.value.pricedBlock ?? ""}
        data-share-ppm={row.census.sharePpm ?? ""}
      >
        <OpenPositionStats
          statusPill={<LifecyclePill status={status.live ? "open" : "closed"} />}
          leadingIdentity={
            <span className="flex flex-wrap items-center gap-2">
              {/* The MARKET this position is in leads, the way a trove row
                  leads with its collateral symbol. On the listing the row is
                  already a <Link>, so this is plain text there — a nested
                  anchor is invalid HTML — and a real link on the detail card. */}
              <span className="text-sm font-semibold text-foreground" data-card-vault-symbol={shareSymbol}>
                {receipts ? (
                  <Link href={marketHref(row)} className="hover:underline" prefetch={false}>
                    {shareSymbol}
                  </Link>
                ) : (
                  <span>{shareSymbol}</span>
                )}
                {/* The venue that deployed this vault, beside the mechanism
                    word it already prints — a fact about ONE vault, never
                    about the section (components/vaults/vault-venue-mark.tsx). */}
                <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-normal text-rb-500">
                  <span>·</span>
                  <VaultVenueMark family={row.family} />
                  <span>{FAMILY_SINGULAR[row.family]}</span>
                </span>
              </span>
              {/* The bookmark rides the pill, as it does on every position
                  card. Its scope is the vault's own protocol's, read off the
                  family (FAMILY_BOOKMARK_SCOPE above). On the listing the whole
                  row is a <Link>; the toggle stops the click from bubbling, so
                  bookmarking never navigates. */}
              <WalletPill
                wallet={row.holder}
                ensName={holderIdentity?.ensName ?? null}
                bookmarkProtocol={FAMILY_BOOKMARK_SCOPE[row.family]}
                // …and WHICH of that rail's listings it was taken on. This row
                // is a vault holding wherever the card is drawn, so it belongs
                // to the rail's holder listing; the roster names the segment,
                // so no path text is restated here (§42 item 1).
                bookmarkListing={holderListingSegment(FAMILY_BOOKMARK_SCOPE[row.family])}
              />
              {attested ? (
                <Prov info={aaveAttestedNameProv(coords, attested)}>
                  <span className="text-xs text-rb-500" data-attested-constant={attested.constant}>
                    <span className="font-mono">{attestedShortName(attested)}</span> in Aave&rsquo;s address book
                  </span>
                </Prov>
              ) : (
                shapeWord && (
                  <Prov info={aaveVaultPositionShapeProv(coords, row.census.shape ?? "", codeSize)}>
                    <span className="text-xs text-rb-500">{shapeWord}</span>
                  </Prov>
                )
              )}
            </span>
          }
          identity={
            <PositionCardMeta
              lastActivityAt={row.lastActivityAt}
              eventCount={row.census.transferCount}
              eventCountTitle={`Transfers of this vault naming this address, counted by the census at block ${n(row.census.block)}`}
            />
          }
          columns={columns}
        />

        {/* ── the card's foot: where the position starts, and the blocks ───
            The last-activity date left this row for the activity cluster
            top-right, which states the same fact as a time since. First seen
            has no counterpart up there and stays. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-rb-500">
          <span>
            First seen{" "}
            <Prov info={aaveVaultPositionSeenProv(coords, "first", row.census.firstBlock)}>
              <span>
                <BlockStamp block={row.census.firstBlock} at={row.firstSeenAt} />
              </span>
            </Prov>
          </span>
          {receipts && (
            <span>
              <a
                href={explorerUrl(chainId, "address", row.holder)}
                target="_blank"
                rel="noopener noreferrer"
                className="link-external"
              >
                {chainId === BASE_CHAIN_ID ? "on Basescan" : "on Etherscan"}
              </a>
            </span>
          )}
          <span data-card-blocks>
            {row.live
              ? `Read at block ${n(row.live.blockNumber)}; membership${status.live && priced ? " and value" : ""} at block ${n(row.census.block)}`
              : `Membership and figures at census block ${n(row.census.block)}; the live read did not answer`}
          </span>
        </div>

        {status.divergent && (
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-rb-500" data-card-divergence>
            <Prov info={aaveVaultPositionDivergenceProv(coords)}>
              <span>
                {row.census.live
                  ? `Held at block ${n(row.census.block)}, closed by block ${n(row.live?.blockNumber ?? row.census.block)}`
                  : `Held nothing at block ${n(row.census.block)}, holding shares again at block ${n(row.live?.blockNumber ?? row.census.block)}`}
              </span>
            </Prov>
            . Both are readings of <code>balanceOf()</code>, each at its own block.
          </p>
        )}
      </div>
    </PositionCardShell>
  );
}

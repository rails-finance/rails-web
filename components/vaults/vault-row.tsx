"use client";

// The vault row (V1, rails-ops ui-jobs 407; survey 2026-10-20 §6): one vault on
// a roster, and on the cross-protocol index of ui-jobs 39, drawn as the shared
// card's listing surface (decision 0040, position-card 324).
// ----------------------------------------------------------------------------
// Identity: the asset's icon with the venue mark, the vault's name, its short
// address, and pills for family and release and for what the chain or the
// venue states about its standing (a chain pill on the index only). Pills are
// neutral (standards/color-grammar.md).
//
// Headlines, in this order: Total assets · Share price · Yield · Holders. The
// first two are in the vault's asset. Yield is decision 0047's figure where the
// store's series measures 30 days, else no figure and a subline. Holders is the census's floor,
// linked to the positions listing filtered to this vault, and a dash where
// there is no census. The steward is not on the row.
//
// The whole card is one link to the vault's page. The link lies under the
// card, which takes no pointer events, so a press anywhere reaches it; the
// Holders figure is the one control above it. Figures keep their family's
// receipts.

import Link from "next/link";
import type { ReactNode } from "react";
import { PositionCard, type PositionCardHead } from "@/components/shared/position-card";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { VaultVenueMark, type VaultVenue } from "@/components/vaults/vault-venue-mark";
import { formatCompact } from "@/lib/shared/format-compact";
import { formatUnitsExact } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { sharePriceText, shortAddress } from "@/lib/shared/vault-amount-text";
import type { VaultStanding, VaultSummary } from "@/lib/vaults/summary";
import type { VaultFamily } from "@/lib/vaults/families";
import { changeText, yieldText, type VaultYield } from "@/lib/vaults/yield";
import { vaultHoldersProv, vaultYieldProv } from "@/lib/vaults/row-provenance";

const n = (v: number) => v.toLocaleString("en-US");

/** The family's own receipts for the row's figures. */
export interface VaultRowReceipts {
  name?: Provenance;
  totalAssets?: Provenance;
  sharePrice?: Provenance;
  standing?: Partial<Record<VaultStanding, Provenance>>;
}

const STANDING_WORD: Record<VaultStanding, string> = {
  endorsed: "endorsed",
  "shut-down": "shut down",
  paused: "paused",
  "address-book": "in Aave’s address book",
};

const VENUE: Record<VaultFamily, VaultVenue> = {
  metamorpho: "morpho",
  sgho: "sgho",
  stata: "stata",
  "umbrella-stake": "umbrella-stake",
  "yearn-v3": "yearn",
};

const PILL = "rounded-sm bg-rb-300 px-1.5 py-0.5 text-[11px] text-foreground/80 dark:bg-rb-700 dark:text-foreground/60";

export const YIELD_LABEL_TIP =
  "Rails's figure: the share price's growth over 30 days from the daily store, annualised simply. Net of the fees the vault takes inside the share; rewards paid outside the share are not in it.";

/** A figure in the vault's asset: the compact number, the ticker small beside it. */
function InAsset({ v, children, exact }: { v: VaultSummary; children: ReactNode; exact: string }) {
  return (
    // Wraps inside its column: a share price can run to twenty digits (a BRZ
    // vault on Base answers 2,008,056,384,921,425,400.00) and must not push the
    // page sideways at 390.
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <span className="break-all" data-prov-exact={exact} data-prov-symbol={v.asset.symbol}>
        {children}
      </span>
      <span className={`text-[0.5em] font-medium text-rb-500 ${v.asset.named ? "" : "font-mono"}`}>
        {v.asset.symbol}
      </span>
    </span>
  );
}

export function VaultRow({
  vault: v,
  yieldFigure,
  href,
  holdersHref,
  receipts,
  chain,
  hooks,
}: {
  vault: VaultSummary;
  /** The store's measure for this vault; absent means the store was not read. */
  yieldFigure?: VaultYield;
  /** The vault's page under its protocol. */
  href: string;
  /** The positions listing filtered to this vault; null where there is none. */
  holdersHref: string | null;
  receipts: VaultRowReceipts;
  /** The chain's name, for the pill the cross-protocol index draws. */
  chain?: string;
  /** The family's `data-*` hooks on the row, which its verifier reads. */
  hooks?: Record<string, string>;
}) {
  const name = v.name ?? v.catalogName ?? v.symbol;
  const venue = VENUE[v.family];
  // Yearn's mark is earned by the Registry's endorsement (decision 0027 call 1).
  const marked = v.family !== "yearn-v3" || v.standing.includes("endorsed");
  const raw = v.totalAssets?.raw ?? "";

  const lead = (
    // The icon is decoration (the group heading names the asset): a fallback
    // glyph's letters and digits are no figure, so the tripwire skips it.
    <span className="relative inline-flex shrink-0 items-center" data-vault-asset={v.asset.address} data-prov-exempt>
      <TokenChipIcon symbol={v.asset.symbol} address={v.asset.address} size={28} filterable={false} untitled />
      {marked && (
        <span className="absolute -bottom-0.5 -right-1.5 inline-flex rounded-full bg-raised p-px" data-venue-mark>
          <VaultVenueMark family={venue} />
        </span>
      )}
    </span>
  );

  const identity = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-sm font-semibold text-foreground" data-vault-name>
        {v.name != null && receipts.name ? (
          <Prov info={receipts.name}>{v.name}</Prov>
        ) : name != null ? (
          <span title={v.name == null ? "name not loaded at this block; the catalogue's snapshot is shown" : undefined}>
            {name}
          </span>
        ) : (
          <span className="font-mono">{shortAddress(v.address)}</span>
        )}
      </span>
      <span className="font-mono text-[11px] text-rb-500" data-vault-address={v.address}>
        {shortAddress(v.address)}
      </span>
      {chain && (
        <span className={PILL} data-pill="chain">
          {chain}
        </span>
      )}
      <span className={PILL} data-pill="family">
        {v.releaseLabel}
      </span>
      {v.standing.map((s) => (
        <span
          key={s}
          className={PILL}
          data-pill={s}
          {...(s === "endorsed"
            ? { "data-endorsed-badge": "" }
            : s === "shut-down"
              ? { "data-shutdown-badge": "" }
              : {})}
        >
          {receipts.standing?.[s] ? <Prov info={receipts.standing[s]}>{STANDING_WORD[s]}</Prov> : STANDING_WORD[s]}
        </span>
      ))}
    </span>
  );

  const heads: PositionCardHead[] = [
    {
      id: "total-assets",
      label: "Total assets",
      value: v.totalAssets ? (
        <span data-cell="total-assets">
          <InAsset v={v} exact={formatUnitsExact(v.totalAssets.raw, v.asset.decimals)}>
            {receipts.totalAssets ? (
              <Prov info={receipts.totalAssets}>{formatCompact(v.totalAssets.value)}</Prov>
            ) : (
              formatCompact(v.totalAssets.value)
            )}
          </InAsset>
        </span>
      ) : null,
    },
    {
      id: "share-price",
      label: "Share price",
      value: v.sharePrice ? (
        <span data-cell="share-price">
          <InAsset v={v} exact={formatUnitsExact(v.sharePrice.raw, v.asset.decimals)}>
            {receipts.sharePrice ? (
              <Prov info={receipts.sharePrice}>{sharePriceText(v.sharePrice, v.asset.decimals)}</Prov>
            ) : (
              sharePriceText(v.sharePrice, v.asset.decimals)
            )}
          </InAsset>
        </span>
      ) : null,
    },
  ];

  // The slot draws on every row so the four headlines align down a roster
  // (decision 0047 point 4): a figure where the store measures 30 days, else
  // no figure and a subline saying why. The interpretation tip goes with a figure.
  if (yieldFigure && "yearly" in yieldFigure) {
    heads.push({
      id: "yield",
      label: "Yield",
      labelTip: YIELD_LABEL_TIP,
      labelTipOnListing: true,
      value: (
        <span
          data-cell="yield"
          data-yield-from-block={yieldFigure.from.block}
          data-yield-to-block={yieldFigure.to.block}
          data-yield-days={yieldFigure.days}
        >
          <Prov info={vaultYieldProv(v, yieldFigure)}>{yieldText(yieldFigure.yearly)}</Prov>
        </span>
      ),
      sub: `share price ${changeText(yieldFigure.change)} over the ${yieldFigure.days} days to block ${n(yieldFigure.to.block)}`,
    });
  } else {
    const none = yieldFigure == null ? "unread" : yieldFigure.none;
    heads.push({
      id: "yield",
      label: "Yield",
      value: null,
      sub: (
        <span data-yield-none={none}>
          {yieldFigure != null && "firstDay" in yieldFigure
            ? `series from ${formatDate(new Date(yieldFigure.firstDay * 86_400_000))}`
            : yieldFigure == null
              ? "daily series not read"
              : "no daily series yet"}
        </span>
      ),
    });
  }

  const c = v.census;
  heads.push({
    id: "holders",
    label: "Holders",
    value:
      c == null ? null : c.holders > 0 && holdersHref ? (
        <Link
          href={holdersHref}
          prefetch={false}
          className="pointer-events-auto hover:text-blue-500"
          data-cell="holders"
          data-positions-link={v.address}
          data-link="vault-positions"
          data-positions-vault={v.address}
        >
          <Prov info={vaultHoldersProv(v, c)}>{n(c.holders)}</Prov>
        </Link>
      ) : (
        <span data-cell="holders" data-positions-none="">
          <Prov info={vaultHoldersProv(v, c)}>{n(c.holders)}</Prov>
        </span>
      ),
    sub:
      c == null ? (
        "no census"
      ) : c.holders === 0 ? (
        "no holder yet"
      ) : (
        <Prov info={vaultHoldersProv(v, c)}>{`${n(c.live)} open`}</Prov>
      ),
  });

  return (
    <div
      className="group/listing-row relative"
      data-vault-row={v.address}
      data-group={raw === "" ? "unread" : BigInt(raw) > BigInt(0) ? "funded" : "empty"}
      data-asset={v.asset.address}
      data-total-assets-raw={raw}
      data-share-price-raw={v.sharePrice?.raw ?? ""}
      {...hooks}
    >
      <Link
        href={href}
        prefetch={false}
        className="absolute inset-0 rounded-2xl focus-ring"
        aria-label={`${name ?? shortAddress(v.address)}, ${v.releaseLabel}`}
        data-vault-link={v.address}
      />
      {/* The Yield label keeps its tip: that is how the figure is marked as
          Rails's interpretation. */}
      <div className="pointer-events-none relative [&_[data-card-head='yield']>div:first-child]:pointer-events-auto">
        <PositionCard
          slots={{
            surface: "listing",
            anatomy: "V1",
            status: null,
            lead,
            identity,
            heads,
            counters: null,
            menu: null,
          }}
        />
      </div>
    </div>
  );
}

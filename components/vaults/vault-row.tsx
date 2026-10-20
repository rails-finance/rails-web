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
import { PositionCard } from "@/components/shared/position-card";
import { Prov } from "@/components/shared/provenance";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import type { VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";
import { VaultLead, VaultPills, vaultHeads, type VaultRowReceipts } from "@/components/vaults/vault-heads";

export type { VaultRowReceipts };

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
  const raw = v.totalAssets?.raw ?? "";

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
      <VaultPills vault={v} receipts={receipts} chain={chain} />
    </span>
  );

  const heads = vaultHeads({ vault: v, yieldFigure, holdersHref, receipts });

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
            lead: <VaultLead vault={v} />,
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

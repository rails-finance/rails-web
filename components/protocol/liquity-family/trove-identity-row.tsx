"use client";

import { useState } from "react";
import { Image as ImageIcon, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { WalletPill } from "@/components/shared/wallet-pill";
import { Facehash } from "@/components/shared/facehash";
import { useEnsName } from "@/lib/ens/use-ens-names";
import type { LiquityFamilyId } from "./types";

/**
 * Trove identifier — owner address + Trove ID label + NFT/OpenSea link,
 * rendered as inline text (no pill chrome) so it sits cleanly next to the
 * status pill in the summary-card header. The owner falls back to the last
 * known owner once a trove is closed/liquidated, and clicking it re-filters
 * the listing in place via `?q=` (the listing's tri-modal search — there's
 * no standalone address page).
 *
 * Generalised off Liquity V2's original (the retired
 * components/trove/trove-identity-row.tsx) to the whole family: `protocol` selects the
 * wallet pill's filter/bookmark scope, `nftUrl` is caller-supplied rather than
 * resolved internally (V2 knows a contract-address map; the forks currently
 * know none), and `shortId` lets a fork use its own asset-catalog formatter.
 */
export function TroveIdentityRow({
  protocol,
  troveId,
  owner,
  lastOwner,
  ownerEns,
  nftUrl = null,
  shortId = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`,
  showBookmark = true,
  showNftLink = true,
  showOwner = true,
  inert = false,
}: {
  protocol: LiquityFamilyId;
  troveId?: string;
  owner?: string | null;
  lastOwner?: string | null;
  ownerEns?: string | null;
  /** Marketplace link for the trove NFT (OpenSea), when the caller resolved
   *  one — omit for no link. */
  nftUrl?: string | null;
  /** Trove-id label formatter. Defaults to V2's slice form
   *  (`${id.slice(0,6)}…${id.slice(-4)}`); a fork with its own asset-catalog
   *  shortId passes it here instead. */
  shortId?: (id: string) => string;
  /** Bookmark-star toggle after the owner. On by default — every trove card
   *  (listing + detail, open/closed/liquidated) carries it. Pass false to
   *  suppress in a context that shouldn't offer bookmarking. */
  showBookmark?: boolean;
  /** OpenSea NFT icon-link after the trove-id chip. On by default for listing
   *  cards. The open detail card passes false — its footnote carries the NFT
   *  link in plain language, so the header chip would be a redundant second
   *  copy. */
  showNftLink?: boolean;
  /** The owner's pill. The detail card passes false: the page's wallet row
   *  above the card names the owner (ui-jobs 228). */
  showOwner?: boolean;
  /** The listing card under the header set (ui-jobs 246): the owner, or the
   *  Trove ID where there is none, as text with its facehash and no
   *  controls; the whole card is the link. */
  inert?: boolean;
}) {
  const [copiedTrove, setCopiedTrove] = useState(false);
  const troveLabel = troveId ? shortId(troveId) : null;

  // Current owner when open; the preserved last owner once closed/liquidated.
  const ownerAddress = showOwner ? (owner ?? lastOwner ?? null) : null;
  const isLastOwner = !owner && !!lastOwner;

  const resolved = useEnsName(inert && ownerAddress && !ownerEns ? ownerAddress : null);
  if (!troveLabel && !nftUrl && !ownerAddress) return null;

  if (inert) {
    const name = ownerEns ?? resolved;
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-rb-500">
        {ownerAddress ? (
          <>
            {isLastOwner && <span className="text-rb-400">last owner</span>}
            <Facehash address={ownerAddress} size={16} />
            <span
              className={name ? "max-w-[15ch] truncate" : "font-mono"}
              title={name ? `${name} · ${ownerAddress}` : ownerAddress}
            >
              {name ?? `${ownerAddress.slice(0, 6)}…${ownerAddress.slice(-4)}`}
            </span>
          </>
        ) : (
          troveLabel && (
            <>
              <Icon name="trove-id" size={12} />
              <span className="font-mono">{troveLabel}</span>
            </>
          )
        )}
      </span>
    );
  }

  const copy = (value: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(value);
    setter(true);
    setTimeout(() => setter(false), 1500);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-rb-500">
      {ownerAddress && (
        // WalletPill carries its own facehash, ENS-or-short-address label,
        // copy button and (via bookmarkProtocol) bookmark star — the same
        // identity chrome every other explorer's cards use. Routing to the
        // owner-filtered listing is its `filterProtocol` link.
        <span className={`inline-flex items-center gap-1 ${isLastOwner ? "opacity-70" : ""}`}>
          {isLastOwner && (
            <span className="text-rb-400" title="Last owner (trove closed)">
              last owner
            </span>
          )}
          <WalletPill
            wallet={ownerAddress}
            ensName={ownerEns ?? null}
            filterProtocol={protocol}
            bookmarkProtocol={showBookmark ? protocol : undefined}
          />
        </span>
      )}
      {troveLabel && troveId && (
        <span className="inline-flex items-center gap-1">
          <Icon name="trove-id" size={12} />
          <span className="font-mono">{troveLabel}</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              copy(troveId, setCopiedTrove);
            }}
            aria-label={copiedTrove ? "Copied trove id" : "Copy trove id"}
            title={copiedTrove ? "Copied!" : "Copy"}
            className="text-rb-500 hover:text-foreground cursor-pointer"
          >
            <Icon name={copiedTrove ? "check" : "copy"} size={12} />
          </button>
        </span>
      )}
      {nftUrl && showNftLink && (
        // <button> instead of <a> because this row renders inside cards that
        // are wrapped in a Next <Link> on the listing pages — nested anchors
        // are invalid HTML and trigger a hydration warning. window.open with
        // noopener,noreferrer matches what target="_blank" + rel did.
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(nftUrl, "_blank", "noopener,noreferrer");
          }}
          aria-label="View NFT on OpenSea"
          title="View NFT on OpenSea"
          className="inline-flex items-center gap-1 text-rb-500 hover:text-pink-500 transition-colors cursor-pointer"
        >
          <ImageIcon size={12} />
          <Link2 size={12} className="-rotate-45" />
        </button>
      )}
    </span>
  );
}

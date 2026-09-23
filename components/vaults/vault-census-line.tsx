// The one line under the section rail on both vault listings: how many
// positions the census holds, across how many vaults, how many of them are
// still holding shares, the block membership was swept to, and the block the
// cards' live figures were read at.
//
// IT STATES ONLY WHAT THE PAGE READ. Everything a reader needs in order to
// trust the line — the completeness proof, what the value sort orders, the
// vaults nobody has ever held, what a search does and does not do — is on the
// section's own about page (`/<chain>/vaults/info`, the (i) in the rail), so
// nothing stacks between this line and the toolbar.
//
// NO RECEIPTS SCOPE AND NO <Prov> HERE. The listing face mounts no provenance
// inspector — a <Prov> without one is inert (components/shared/provenance.tsx)
// — and the census figures it would trace are stated again on the about page
// and on every card, where the inspector does run.
//
// THE FIGURES COME FROM THE CENSUS HEADER, never from the rows on screen: the
// header travels with every response, one row per catalogued vault, so the line
// is about the whole census whatever page is being looked at (memory
// `listing-truncation-and-timeline-axes`).

import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";

const n = (v: number) => v.toLocaleString("en-US");

export function VaultCensusLine({
  census,
  blockNumber,
  countHeldOnly = false,
}: {
  census: readonly VaultCensusRow[];
  /** The block the live chain overlay answered at for this page's cards, or
   *  null when the overlay did not answer — which the line states in words
   *  rather than leaving the sentence half-said. */
  blockNumber: number | null;
  /** Count the vaults the census found a holder in, rather than every
   *  catalogued vault. Base's catalogue holds hundreds that have never had a
   *  single `Transfer`, so "positions across N vaults" there is a count of the
   *  vaults those positions are actually in; Ethereum's eighteen are all
   *  stated. Either way the count is the census's, not the page's. */
  countHeldOnly?: boolean;
}) {
  if (census.length === 0) return null;
  const blocks = Array.from(new Set(census.map((c) => c.censusBlock))).sort((a, b) => a - b);
  const blockLine =
    blocks.length === 1 ? `block ${n(blocks[0])}` : `blocks ${n(blocks[0])} to ${n(blocks[blocks.length - 1])}`;
  const participants = census.reduce((s, c) => s + c.participants, 0);
  const liveCount = census.reduce((s, c) => s + c.liveCount, 0);
  const vaultCount = countHeldOnly ? census.filter((c) => c.participants > 0).length : census.length;

  return (
    <div className="mb-6" data-stance>
      <p className="text-[11px] leading-relaxed text-rb-500" data-stance-census>
        <span className="tabular-nums">{n(participants)}</span> positions across{" "}
        <span className="tabular-nums">{n(vaultCount)}</span> vaults,{" "}
        <span className="tabular-nums">{n(liveCount)}</span> holding shares · census at{" "}
        <span className="tabular-nums" data-census-block>
          {blockLine}
        </span>
        {blockNumber != null ? (
          <>
            {" · "}cards read live at{" "}
            <span className="tabular-nums" data-live-block>
              block {n(blockNumber)}
            </span>
          </>
        ) : (
          <>
            {" · "}the live chain read did not answer for this page, so each card states its census figures and says so
          </>
        )}
      </p>
    </div>
  );
}

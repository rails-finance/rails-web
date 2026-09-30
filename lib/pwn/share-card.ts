// PWN position → share-card model. The bridge between
// `loadPwnPositionTail`'s `summaries` array (the same server tail the loan
// page itself awaits) and the shared card renderer — no second read, no
// fetched prices of our own.
//
// A PWN "position" is one discrete fixed-term loan, and a wallet can be party
// to several — the page renders exactly one, the `?loan=` id if it resolves
// else the wallet's most recently created loan (see position-view.tsx). The
// image-route file convention receives no search params (Next hands its
// handler only `{ params }`), so this mapper always states the wallet's most
// recently created loan — the same loan a bare link to the wallet (no
// `?loan=`) would render.
//
// PWN's terms are fixed at creation, not a running balance — there is no
// "highest recorded" concept the way a pooled position has peaks (the memory
// of this project keeps PWN's figure as-is for the same reason), so both the
// open and the closed card state the loan's own struck values.

import type { PwnPositionSummary, PwnAsset } from "@/lib/sources/api/pwn-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import { shortTokenId } from "@/lib/pwn/asset-catalog";
import type { PositionCardModel } from "@/lib/share/position-card";
import { loanCost, pwnLoanState, viewFromSummary } from "@/lib/pwn/economics";

const STATUS_WORD: Record<ReturnType<typeof pwnLoanState>, string> = {
  running: "Open",
  unclaimed: "Defaulted, not yet claimed",
  repaid: "Repaid",
  defaulted: "Defaulted",
};

/** "SYMBOL #id" for an NFT, "amount SYMBOL" for a fungible token — mirrors
 *  `AssetValue` in pwn-position-card.tsx. */
function assetValue(asset: PwnAsset): string {
  const isNft = asset.category === "ERC721" || asset.category === "ERC1155";
  if (isNft && asset.tokenId != null) return `${asset.symbol} #${shortTokenId(asset.tokenId)}`;
  if (asset.decimalsUnread) return `Not loaded ${asset.symbol}`;
  return `${formatCompact(asset.amount)} ${asset.symbol}`;
}

/** The wallet's most recently created loan — the page's own default when
 *  `?loan=` is absent or unresolved. */
function latestLoan(summaries: PwnPositionSummary[]): PwnPositionSummary | null {
  if (summaries.length === 0) return null;
  return [...summaries].sort((a, b) => (b.createdBlock ?? 0) - (a.createdBlock ?? 0))[0];
}

export function pwnShareCardModel(summaries: PwnPositionSummary[] | null, wallet: string): PositionCardModel | null {
  const loan = summaries ? latestLoan(summaries) : null;
  // No loan this wallet is a party to — `positionImage` degrades to the
  // static roster card rather than rendering an empty one.
  if (!loan) return null;

  const stats: PositionCardModel["stats"] = [];
  if (loan.status === "open") {
    // Mirrors the open card's three leading columns (Collateral,
    // Principal, Repay or Owed at deadline) — the fourth, "Due", is a date
    // rather than a value stat and sits outside the three-stat cap here.
    if (loan.collateral) stats.push({ label: CARD_VOCAB.collateral, value: assetValue(loan.collateral) });
    if (loan.credit) stats.push({ label: "Principal", value: assetValue(loan.credit) });
    const cost = loanCost(viewFromSummary(loan));
    if (cost && loan.credit) {
      stats.push({
        label: cost.shape === "accruing" ? "Owed at deadline" : "Repay",
        value: `${formatCompact(cost.total)} ${loan.credit.symbol}`,
      });
    }
  } else {
    // Repaid/defaulted: the struck collateral and credit terms, same as the
    // open card's own figures — a settled loan's terms don't change.
    if (loan.collateral) stats.push({ label: CARD_VOCAB.collateral, value: assetValue(loan.collateral) });
    if (loan.credit) stats.push({ label: "Principal", value: assetValue(loan.credit) });
  }

  return {
    session: "pwn",
    subject: shortSubject(wallet),
    status: STATUS_WORD[pwnLoanState({ ...loan, extendedDueAt: loan.latestDefaultAt })],
    stats,
    asOf: new Date(),
  };
}

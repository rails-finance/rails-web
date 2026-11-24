"use client";

// One Compound V3 Comet account on Optimism as the wallet view lists it (W3;
// rails-ops decision 0071): Collateral, the base supplied or owed, and
// Borrowing capacity used, the figures and receipts of the explorer's wallet
// rows (U3), from its wallet read at the head block. Lent's receipt also states
// the collateral the wallet total sums. The Comet is the tag.

import { PositionCard, type PositionCardHead } from "@/components/shared/position-card";
import { ListingTag } from "@/components/shared/listing-tag";
import { Prov } from "@/components/shared/provenance";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { accountFigures } from "@/lib/compound-v3-optimism/position";
import {
  opcBaseProv,
  opcCardProv,
  opcWalletLentProv,
  type OpcReceiptContext,
} from "@/lib/compound-v3-optimism/provenance";
import type { OpcWalletRead } from "@/lib/compound-v3-optimism/types";
import { CARD_WORDS, pctText, usd } from "@/lib/compound-v3-optimism/words";

/** `read`: the wallet read holding this Comet alone. */
export function CompoundV3OptimismWalletCard({ read }: { read: OpcWalletRead }) {
  const a = read.comets[0];
  if (!a) return null;
  const f = accountFigures(a, read.ethUsd);
  const c: OpcReceiptContext = { a, f, head: read.head, ethUsd: read.ethUsd };
  const lend = f.supplied > 0;
  const baseUsd = lend ? f.suppliedUsd : f.borrowedUsd;
  const heads: PositionCardHead[] = [
    {
      id: "collateral",
      label: CARD_WORDS.collateral,
      labelTip: CARD_WORDS.collateralTip(a.baseSymbol),
      tier: "amount",
      value:
        f.collateral.length > 0 && f.collateralUsd != null ? (
          <Prov info={opcCardProv("collateral-total", c)}>{usd(f.collateralUsd)}</Prov>
        ) : null,
    },
    {
      id: lend ? "supplied" : "debt",
      label: lend ? CARD_WORDS.lent : CARD_VOCAB.debt,
      labelTip: lend ? CARD_WORDS.lentTip(a.baseSymbol) : CARD_WORDS.debtTip(a.baseSymbol),
      tier: "amount",
      value:
        (f.supplied > 0 || f.borrowed > 0) && baseUsd != null ? (
          <Prov info={lend ? opcWalletLentProv(c) : opcBaseProv("usd", c)}>{usd(baseUsd)}</Prov>
        ) : null,
    },
    {
      id: "limit",
      label: CARD_WORDS.limit,
      labelTip: CARD_WORDS.limitTip,
      value:
        f.limitUsed != null ? (
          <Prov info={opcCardProv("limit", c)}>{pctText(f.limitUsed, 1)}</Prov>
        ) : (
          <span className="text-rb-500">{CARD_WORDS.noDebt}</span>
        ),
    },
  ];
  return (
    <div data-position-card={`compound-v3-optimism:${a.key}:${read.wallet}`} data-comet={a.comet}>
      <PositionCard
        slots={{
          surface: "listing",
          status: a.isLiquidatable ? { word: "Liquidatable", tone: "caution" } : null,
          heads,
          tag: <ListingTag market={a.label} />,
          counters: null,
          menu: null,
        }}
      />
    </div>
  );
}

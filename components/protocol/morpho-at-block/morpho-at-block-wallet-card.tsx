"use client";

// One Morpho Blue position on Optimism or Arc as the wallet view lists it (W3;
// rails-ops decision 0071): Collateral, Debt or Supplied, and Health factor,
// the figures and receipts of the explorer's wallet rows (U3), each in dollars
// where the chain prices the loan asset and in tokens where it does not, from
// the explorer's wallet read at the head block. The market's pair is the tag.

import { PositionCard, type PositionCardHead } from "@/components/shared/position-card";
import { ListingTag } from "@/components/shared/listing-tag";
import { Prov } from "@/components/shared/provenance";
import { morphoAtBlockFigures } from "@/lib/morpho-at-block/position";
import { morphoAtBlockProv, type MorphoAtBlockReceiptContext } from "@/lib/morpho-at-block/provenance";
import { MORPHO_ARC, MORPHO_OPTIMISM, type MorphoAtBlockWalletRead } from "@/lib/morpho-at-block/types";
import { amount, CARD_WORDS, pairName, usd } from "@/lib/morpho-at-block/words";
import { MORPHO_TERMS } from "@/lib/morpho/terms";

type Usd = "usd-collateral" | "usd-debt" | "usd-supplied";
type Unit = "collateral" | "debt" | "supplied";

/** `read`: the wallet read holding this market alone. */
export function MorphoAtBlockWalletCard({
  dep: key,
  read,
}: {
  dep: "optimism" | "arc";
  read: MorphoAtBlockWalletRead;
}) {
  const m = read.positions[0];
  if (!m) return null;
  const dep = key === "arc" ? MORPHO_ARC : MORPHO_OPTIMISM;
  const f = morphoAtBlockFigures(m, m.position, read.head.time, read.tokens, read.usdFeeds);
  const c: MorphoAtBlockReceiptContext = { dep, f, m, p: m.position, head: read.head };
  // In dollars where the loan asset is priced, else in its tokens.
  const figure = (usdKey: Usd, unitKey: Unit, value: number, valueUsd: number | null, unit: string) =>
    valueUsd != null ? (
      <Prov info={morphoAtBlockProv(usdKey, c)}>{usd(valueUsd)}</Prov>
    ) : (
      <Prov info={morphoAtBlockProv(unitKey, c)}>{amount(value, unit)}</Prov>
    );
  const heads: PositionCardHead[] = [];
  if (f.collateralToken)
    heads.push({
      id: "collateral",
      label: CARD_WORDS.collateral,
      labelTip: CARD_WORDS.collateralTip,
      tier: "amount",
      value:
        f.collateral > 0
          ? figure("usd-collateral", "collateral", f.collateral, f.collateralUsd, f.collateralToken.symbol)
          : null,
    });
  if (f.debt > 0 || f.supplied === 0)
    heads.push({
      id: "debt",
      label: CARD_WORDS.debt,
      labelTip: CARD_WORDS.debtTip,
      tier: "amount",
      value: f.debt > 0 ? figure("usd-debt", "debt", f.debt, f.debtUsd, f.loan.symbol) : null,
    });
  if (f.supplied > 0)
    heads.push({
      id: "supplied",
      label: CARD_WORDS.supplied,
      labelTip: CARD_WORDS.suppliedTip,
      tier: "amount",
      value: figure("usd-supplied", "supplied", f.supplied, f.suppliedUsd, f.loan.symbol),
    });
  if (f.collateralToken)
    heads.push({
      id: "health-factor",
      label: MORPHO_TERMS.healthFactor,
      value:
        f.healthFactor != null ? (
          <Prov info={morphoAtBlockProv("health", c)}>{f.healthFactor.toFixed(2)}</Prov>
        ) : (
          <span className="text-rb-500">{CARD_WORDS.noDebt}</span>
        ),
    });
  return (
    <div data-position-card={`${dep.session}:${f.id}:${read.wallet}`}>
      <PositionCard
        slots={{
          surface: "listing",
          status: f.healthFactor != null && f.healthFactor < 1 ? { word: "Liquidatable", tone: "caution" } : null,
          heads,
          tag: <ListingTag market={pairName(f)} />,
          counters: null,
          menu: null,
        }}
      />
    </div>
  );
}

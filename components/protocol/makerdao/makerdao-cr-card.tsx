"use client";

// Stated collateral-ratio readout for the Maker vault detail — the text
// companion to the always-on liquidation runway in the card's risk slot, the
// vault-shaped analog of the Liquity V1 CR lines. Where the runway answers
// "how far can the collateral price fall?", these lines state where current
// borrowing sits against the ilk's liquidation ratio (mat). Maker has no
// recovery mode; the ilk-level context on the right is the debt ceiling
// instead (Art × rate vs line).
//
// Rendered ON the card face (the risk slot), so its receipts are the card's
// own figures.

import { Prov } from "@/components/shared/provenance";
import {
  collateralRatioProv,
  matProv,
  borrowHeadroomProv,
  ilkCeilingProv,
  dustProv,
} from "@/lib/makerdao/event-provenance";
import { pct } from "@/components/shared/ratio-bar";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { formatCompact, formatNumber } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import type { MakerVaultView } from "./makerdao-vault-card";

export function MakerdaoCrCard({ v }: { v: MakerVaultView }) {
  // Meaningful only for an open vault with debt and the live overlay landed
  // (the replay summary can't supply mat) — decline, never guess.
  if (
    v.source !== "chain" ||
    v.status !== "open" ||
    v.debtDai == null ||
    v.debtDai <= 0 ||
    v.collateralUsd == null ||
    v.collateralUsd <= 0 ||
    v.matRatio == null
  )
    return null;

  const ratio = v.collateralUsd / v.debtDai;
  // DAI on CdpManager vaults, USDS on LockStake urns (asset-catalog).
  const dsym = ilkDebtSymbol(v.ilk);

  // Headroom to the mat line: how much more DAI the vault could draw before
  // crossing the ilk's minimum collateralization.
  const headroomDai = Math.max(0, v.collateralUsd / v.matRatio - v.debtDai);

  // Label-led clusters on the shared risk footer strip (design-grammar rule)
  // — CR/minimum · headroom [+ min-debt] · [ilk ceiling], every <Prov> moved
  // verbatim from the stacked layout: same info builder, same format call,
  // same value text. A long composition wraps BETWEEN clusters.
  return (
    <>
      <RiskFigure label="Collateral ratio">
        <Prov info={collateralRatioProv(formatUsd(v.collateralUsd), `${formatNumber(v.debtDai)} ${dsym}`)}>
          <RiskStrong>{pct(ratio)}</RiskStrong>
        </Prov>{" "}
        · minimum <Prov info={matProv(v.ilk)}>{pct(v.matRatio)}</Prov>
      </RiskFigure>
      <RiskFigure>
        <Prov info={borrowHeadroomProv(pct(v.matRatio))}>
          {formatCompact(headroomDai)} {dsym}
        </Prov>{" "}
        more to the {pct(v.matRatio)} minimum
        {v.dustDai != null && v.dustDai > 0 ? (
          <>
            {" "}
            · min debt{" "}
            <Prov info={dustProv(v.ilk)}>
              {formatCompact(v.dustDai)} {dsym}
            </Prov>
          </>
        ) : null}
      </RiskFigure>
      {v.ilkDebtDai != null && v.lineDai != null && v.lineDai > 0 ? (
        <RiskFigure>
          {v.ilk} ceiling{" "}
          <Prov info={ilkCeilingProv(v.ilk)}>
            {formatCompact(v.ilkDebtDai)} of {formatCompact(v.lineDai)} {dsym}
          </Prov>
        </RiskFigure>
      ) : null}
    </>
  );
}

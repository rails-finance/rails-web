// MakerDAO vault → share-card model. The bridge between `loadMakerVaultTail`
// (the same server tail the vault page itself awaits) and the shared card
// renderer — no second read, no second source of truth for what this vault
// currently states.
//
// Mirrors `components/protocol/makerdao/makerdao-vault-card.tsx`'s own
// `mergeView`: the live Vat read (`tail.chain`) is the authoritative ink/art
// when it landed server-side, the replay summary (`tail.summary`) is the
// fallback and the only source for the lifetime peaks (a slot read has no
// memory of a past high). The peak DAI figure is the summary's own —
// each historic event repriced at ITS OWN rate, not today's — so this mapper
// states it as given rather than recomputing a rate of its own.

import type { loadMakerVaultTail } from "./position-page-data";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";

type MakerTail = Awaited<ReturnType<typeof loadMakerVaultTail>>;

const STATUS_WORD: Record<string, string> = { open: "Open", closed: "Closed", liquidated: "Liquidated" };

export function makerShareCardModel(tail: MakerTail, vault: string): PositionCardModel | null {
  const { chain, summary } = tail;
  // Neither leg landed — `positionImage` degrades to the static roster card
  // rather than rendering an empty one.
  if (!chain && !summary) return null;

  const ilk = chain?.ilk ?? summary!.ilk;
  const collateralSymbol = chain?.collateralSymbol ?? summary!.collateralSymbol;
  const debtSym = ilkDebtSymbol(ilk);
  // The card's own status merge: the slot read alone can't tell "closed" apart
  // from "never opened", so a live chain leg still defers to the replay
  // summary's status where one exists.
  const status = summary?.status ?? (chain && (chain.ink > 0 || chain.art > 0) ? "open" : "closed");
  const ink = chain?.ink ?? summary?.collateral.amount ?? 0;
  const debtDai = chain?.debtDai ?? summary?.debt.dai ?? null;
  const collateralUsd = chain?.collateralUsd ?? summary?.collateral.valueUsd ?? null;
  // Peak is a whole-life aggregate a slot read can't infer — the replay
  // summary's own figures, falling back to the live values only when there is
  // no summary at all (matches the card's `mergeView`).
  const peakInk = summary?.peak.collateral ?? ink;
  const peakDebtDai = summary?.peak.debtDai ?? debtDai;

  const stats: PositionCardModel["stats"] = [];

  if (status === "open") {
    // The card's own gate: DAI only renders once art × rate has resolved to a
    // debt figure; otherwise it states raw art rather than a clean number, and
    // this mapper omits the stat rather than restate that fallback.
    if (debtDai != null) {
      stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(debtDai)} ${debtSym}` });
    }
    stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(ink)} ${collateralSymbol}` });
    const ratio = debtDai != null && debtDai > 0 && collateralUsd != null ? (collateralUsd / debtDai) * 100 : null;
    if (ratio != null) {
      stats.push({ label: ratioLabel("cdp"), value: `${ratio.toFixed(0)}%` });
    }
  } else {
    // Closed/liquidated: ink and art have settled to 0 — the headline is what
    // the vault held at its height, the same lifetime maxima the card falls
    // back to.
    if (peakDebtDai != null && peakDebtDai > 0) {
      stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatCompact(peakDebtDai)} ${debtSym}` });
    }
    if (peakInk > 0) {
      stats.push({ label: CARD_VOCAB.peakCollateral, value: `${formatCompact(peakInk)} ${collateralSymbol}` });
    }
  }

  return {
    session: "makerdao",
    subject: shortSubject(vault),
    status: STATUS_WORD[status] ?? status,
    stats,
    asOf: new Date(),
  };
}

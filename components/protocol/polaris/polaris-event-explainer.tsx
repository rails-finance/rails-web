"use client";

// The Explanation pane (zone Z2) of a Polaris event: the generator's sentences
// (lib/polaris/event-prose.ts, its strings in content/polaris/event-prose.yaml),
// one bullet each. The card shows the first as its teaser and this pane the
// rest; a grouped explanation has no teaser, every bullet sits under its
// group's heading. Each moved amount the header or the detail grid also prints
// echoes that receipt.

import type { PolarisContext } from "@/lib/shared/types/event-shape";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { ProseSentenceText, type ProseEcho } from "@/components/shared/prose-sentence-text";
import { formatNumber } from "@/lib/utils/format";
import { ledgerFieldProv, type PolarisCoords } from "@/lib/polaris/event-provenance";
import {
  polarisEventProse,
  polarisExplanationRuns,
  type PolarisEchoKey,
  type PolarisEventProse,
} from "@/lib/polaris/event-prose";

export interface PolarisEventExplainerProps {
  ctx: PolarisContext;
  txHash?: string;
  blockNumber?: number;
}

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

/** The coords every figure cites: the same subset the header and detail build,
 *  so an explainer echo collapses onto their primary receipt. */
export function polarisEchoCoords(ctx: PolarisContext, txHash?: string, blockNumber?: number): PolarisCoords {
  return { txHash, blockNumber, market: ctx.market, cdpId: ctx.cdpId };
}

/** The receipt each echoed figure registers against: the header's per-axis
 *  amounts (a bare magnitude on a labelled axis, signed on a close) and the
 *  detail grid's settled-to-zero row. */
export function polarisEchoFor(key: PolarisEchoKey, ctx: PolarisContext, coords: PolarisCoords): ProseEcho | null {
  const labeled = ctx.eventType !== "close";
  switch (key) {
    case "coll":
      return {
        info: ledgerFieldProv("collChange", coords, ctx.raw?.collChange),
        value: chainTruthDeltaValue(num(ctx.collChange), labeled),
        symbol: "pETH",
      };
    case "debt":
      return {
        info: ledgerFieldProv("debtChange", coords, ctx.raw?.debtChange),
        value: chainTruthDeltaValue(num(ctx.debtChange), labeled),
        symbol: ctx.stableSymbol,
      };
    case "zero":
      return {
        info: ledgerFieldProv("stablesMintedToEnsureZeroDebt", coords, ctx.raw?.stablesMintedToEnsureZeroDebt),
        value: formatNumber(Math.abs(num(ctx.stablesMintedToEnsureZeroDebt))),
      };
  }
}

/** The explanation draws its groups' headings. */
export const isGroupedExplanation = (prose: PolarisEventProse) => prose.L4.some((s) => s.group);

/** The card's teaser: the first sentence. */
export function PolarisExplainerTeaser({
  prose,
  echo,
}: {
  prose: PolarisEventProse;
  echo: (key: PolarisEchoKey) => ProseEcho | null;
}) {
  const lead = prose.L4[0];
  return lead ? <ProseSentenceText s={lead} echo={echo} /> : null;
}

export function PolarisEventExplainer({ ctx, txHash, blockNumber }: PolarisEventExplainerProps) {
  const prose = polarisEventProse({ ctx });
  const coords = polarisEchoCoords(ctx, txHash, blockNumber);
  const echo = (key: PolarisEchoKey) => polarisEchoFor(key, ctx, coords);
  const sentence = (s: PolarisEventProse["L4"][number]) => <ProseSentenceText key={s.sentence_id} s={s} echo={echo} />;

  if (isGroupedExplanation(prose))
    return (
      <ProseExplainer
        items={polarisExplanationRuns(prose).flatMap((run) =>
          run.sentences.map((s) => ({ group: run.heading ?? "", node: sentence(s) })),
        )}
      />
    );
  return <ProseExplainer items={prose.L4.slice(1).map(sentence)} />;
}

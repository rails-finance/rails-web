"use client";

// A Pendle market token's icon: the mark of the yield token it is built on (no
// CDN hosts a mark for a market's own tokens). From 20px a PT or YT wears the
// spine's ring (KindRing) in Pendle's PT green or YT blue; LP and SY draw the
// bare mark, and the cell's label names them.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { KindRing, kindRingInner, type TokenKindRing } from "@/components/shared/token-kind-ring";
import type { PendleMarketTokens } from "@/lib/pendle/types";

export type PendleTokenKind = "pt" | "yt" | "lp" | "sy" | "yield";

const NAME: Record<Exclude<PendleTokenKind, "yield">, string> = { pt: "PT", yt: "YT", lp: "LP", sy: "SY" };

/** The ring a market token's kind wears: PT and YT. */
export const KIND_RING: Partial<Record<PendleTokenKind, TokenKindRing>> = { pt: "pt", yt: "yt" };

export function PendleTokenIcon({
  kind,
  tokens,
  size = 16,
}: {
  kind: PendleTokenKind;
  tokens: Pick<PendleMarketTokens, "yieldToken">;
  size?: number;
}) {
  const base = tokens.yieldToken;
  const ring = size >= 20 ? KIND_RING[kind] : undefined;
  const markSize = ring ? kindRingInner(size) : size;
  // Where the yield token has no mark either, a plain disc stands in.
  const disc = (
    <span
      className="block rounded-full bg-rb-200 dark:bg-rb-700"
      style={{ width: markSize, height: markSize }}
      aria-hidden
    />
  );
  const mark = (
    <TokenChipIcon
      symbol={base.symbol ?? ""}
      address={base.address}
      size={markSize}
      filterable={false}
      untitled
      fallback={disc}
    />
  );
  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size }}
      data-pendle-icon={kind}
      title={kind === "yield" ? undefined : NAME[kind]}
    >
      {ring ? (
        <KindRing ring={ring} size={size}>
          {mark}
        </KindRing>
      ) : (
        mark
      )}
    </span>
  );
}

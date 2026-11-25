"use client";

// A Pendle market token's icon: the mark of the yield token it is built on,
// with a small stamp naming what it is (PT, YT, LP, SY) from 20px up. No CDN
// hosts a mark for a market's own tokens, and the shared chip's letter glyph
// under a "PT" stamp read as overlapping letters; where the yield token has no
// mark either, a plain disc stands in, so the stamp is the one text. The stamp
// is the spine's (KindStamp), PT and YT in Pendle's hues.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { KindStamp, type TokenKindStamp } from "@/components/shared/token-kind-stamp";
import type { PendleMarketTokens } from "@/lib/pendle/types";

export type PendleTokenKind = "pt" | "yt" | "lp" | "sy" | "yield";

export const STAMP: Record<Exclude<PendleTokenKind, "yield">, TokenKindStamp> = {
  pt: "PT",
  yt: "YT",
  lp: "LP",
  sy: "SY",
};

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
  const disc = (
    <span className="block rounded-full bg-rb-200 dark:bg-rb-700" style={{ width: size, height: size }} aria-hidden />
  );
  const stamp = kind !== "yield" && size >= 20 ? STAMP[kind] : null;
  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size }}
      data-pendle-icon={kind}
      title={kind === "yield" ? undefined : STAMP[kind]}
    >
      <TokenChipIcon
        symbol={base.symbol ?? ""}
        address={base.address}
        size={size}
        filterable={false}
        untitled
        fallback={disc}
      />
      {stamp && <KindStamp stamp={stamp} size={size} />}
    </span>
  );
}

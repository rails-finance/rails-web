"use client";

// A Pendle market token's icon: the mark of the yield token it is built on,
// with a small stamp naming what it is (PT, YT, LP, SY) from 20px up. No CDN
// hosts a mark for a market's own tokens, and the shared chip's letter glyph
// under a "PT" stamp read as overlapping letters; where the yield token has no
// mark either, a plain disc stands in, so the stamp is the one text.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { PendleMarketTokens } from "@/lib/pendle/types";

export type PendleTokenKind = "pt" | "yt" | "lp" | "sy" | "yield";

const STAMP: Record<Exclude<PendleTokenKind, "yield">, string> = { pt: "PT", yt: "YT", lp: "LP", sy: "SY" };

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
      {stamp && (
        <span
          className="absolute -top-px -right-px inline-flex items-center justify-center rounded-[3px] bg-background font-semibold leading-none text-rb-600 ring-1 ring-rb-300 dark:text-rb-300 dark:ring-rb-600"
          style={{
            height: Math.round(size * 0.44),
            paddingInline: Math.max(1, Math.round(size * 0.07)),
            fontSize: Math.round(size * 0.3),
          }}
          aria-hidden
        >
          {stamp}
        </span>
      )}
    </span>
  );
}

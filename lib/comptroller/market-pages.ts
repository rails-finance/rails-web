// The market pages a token has under a Comptroller explorer (Compound V2,
// Moonwell on Ethereum and Base; ui-jobs 786): one per market lending it, each
// at `markets/<cToken or mToken>`, which ComptrollerMarketPage resolves for
// every market (lib/comptroller/product.tsx matches `market` as well as `key`).
// Keying by the underlying alone reaches nothing for cETH (no underlying) and
// for WBTC's two markets (lib/comptroller/markets.ts, `keyed`).

import type { ChipUse } from "@/lib/shared/asset-uses";
import { COMPOUND_V2_MARKETS } from "@/lib/compound-v2/asset-catalog";
import { MOONWELL_MARKETS } from "@/lib/moonwell/asset-catalog";
import { NATIVE } from "@/lib/shared/asset-roster";

const ADDRESS = /^0x[0-9a-f]{40}$/;

/** The token's markets as links, "Market" where there is one, else each named
 *  by its market token ("cWBTC", "cWBTC2"); null for an explorer this does not
 *  cover. `chipHref` carries Moonwell on Base's markets (`?supply=<mToken>,…`),
 *  whose roster is read live. */
export function comptrollerMarketLinks(
  explorer: string,
  explorerHref: string,
  token: string,
  chipHref: string,
): ChipUse[] | null {
  const t = token.toLowerCase();
  const link = (markets: { market: string; name: string }[]): ChipUse[] =>
    markets.map((m) => ({
      label: markets.length === 1 ? "Market" : `${m.name} market`,
      href: `${explorerHref}/markets/${m.market}`,
    }));
  if (explorer === "compound-v2")
    return link(
      COMPOUND_V2_MARKETS.filter((m) => (m.underlying ?? NATIVE) === t).map((m) => ({
        market: m.ctoken,
        name: m.cSymbol,
      })),
    );
  if (explorer === "moonwell")
    return link(MOONWELL_MARKETS.filter((m) => m.underlying === t).map((m) => ({ market: m.mtoken, name: m.mSymbol })));
  if (explorer === "moonwell-base") {
    const supply = new URL(chipHref, "https://x").searchParams.get("supply") ?? "";
    const markets = supply
      .split(",")
      .map((v) => v.toLowerCase())
      .filter((v) => ADDRESS.test(v));
    return link(markets.map((m) => ({ market: m, name: `${m.slice(0, 6)}…${m.slice(-4)}` })));
  }
  return null;
}

// Run by scripts/test/linked-value.test.mjs through tsx (LinkedValue is .tsx
// and imports through `@/`): renders each case server-side, and the tooltip's
// words and the href for each, and prints them as JSON.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LinkedValue, linkedValueHref, linkedValueTip } from "@/components/shared/linked-value";

const TX = "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060";
const CASES = {
  ethereum: { explorer: { chainId: 1, kind: "tx", value: TX }, label: "0x5c50…2060" },
  context: {
    explorer: { chainId: 1, kind: "address", value: "0x1" },
    context: "Went to the Curve pETH/fpETH/vpETH pool",
    label: "4.2K pETH",
  },
  base: { explorer: { chainId: 8453, kind: "tx", value: TX }, label: "0x5c50…2060" },
  arbitrum: { explorer: { chainId: 42161, kind: "tx", value: TX }, label: "0x5c50…2060" },
  rails: {
    href: "/ethereum/liquity-v2/trove/123",
    tip: "Trove 123 →",
    label: "#123",
    className: "font-mono text-xs",
    align: "end",
    dataAttrs: { "data-trove-link": "123" },
  },
};
const out = {};
for (const [k, c] of Object.entries(CASES)) {
  out[k] = { html: renderToStaticMarkup(h(LinkedValue, c, c.label)), tip: linkedValueTip(c), href: linkedValueHref(c) };
}
// A chain lib/shared/chains.ts does not name (Polygon) has no explorer.
try {
  linkedValueHref({ explorer: { chainId: 137, kind: "tx", value: TX } });
  out.unknownChain = null;
} catch (e) {
  out.unknownChain = e.message;
}
process.stdout.write(JSON.stringify(out));

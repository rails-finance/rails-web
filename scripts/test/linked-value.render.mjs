// Run by scripts/test/linked-value.test.mjs through tsx (LinkedValue is .tsx
// and imports through `@/`): renders each case server-side, and the tooltip's
// words for each, and prints them as JSON.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LinkedValue, linkedValueTip } from "@/components/shared/linked-value";

const TX = "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060";
const CASES = {
  ethereum: { href: `https://etherscan.io/tx/${TX}`, explorer: { chainId: 1 }, label: "0x5c50…2060" },
  context: {
    href: "https://etherscan.io/address/0x1",
    explorer: { chainId: 1 },
    context: "Went to the Curve pETH/fpETH/vpETH pool",
    label: "4.2K pETH",
  },
  base: { href: `https://basescan.org/tx/${TX}`, explorer: { chainId: 8453 }, label: "0x5c50…2060" },
  arbitrum: { href: `https://arbiscan.io/tx/${TX}`, explorer: { chainId: 42161 }, label: "0x5c50…2060" },
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
  out[k] = { html: renderToStaticMarkup(h(LinkedValue, c, c.label)), tip: linkedValueTip(c) };
}
process.stdout.write(JSON.stringify(out));

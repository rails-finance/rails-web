// Run by scripts/test/linked-value.test.mjs through tsx (LinkedValue is .tsx
// and imports through `@/`): renders each case server-side, and the tooltip's
// words and the href for each, and prints them as JSON.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LinkedValue, linkedValueHref, linkedValueTip, unlinkedClasses } from "@/components/shared/linked-value";
import { viaSiteName } from "@/components/shared/provenance";
import { CHAINS } from "@/lib/shared/chains";

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
// A chain lib/shared/chains.ts does not name (Polygon) renders the value
// plain, and warns once.
const warnings = [];
const warn = console.warn;
console.warn = (...a) => warnings.push(a.join(" "));
const polygon = {
  explorer: { chainId: 137, kind: "tx", value: TX },
  label: "0x5c50…2060",
  className: "link-external font-mono text-xs text-blue-600 dark:text-[var(--text-link)] hover:underline",
};
out.unknownChain = {
  html: [1, 2].map(() => renderToStaticMarkup(h(LinkedValue, polygon, polygon.label))),
  warnings,
};
console.warn = warn;
// Every chain the registry names, linked to its block.
out.everyChain = Object.fromEntries(
  Object.keys(CHAINS).map((id) => {
    const d = { explorer: { chainId: Number(id), kind: "block", value: 1 } };
    return [
      id,
      {
        href: linkedValueHref(d),
        tip: linkedValueTip(d),
        host: CHAINS[id].explorerBase,
        name: CHAINS[id].explorerName,
      },
    ];
  }),
);
// The link classes the plain form drops, behind a variant prefix or none.
out.unlinked = unlinkedClasses(
  "link font-mono dark:text-[var(--text-link)] group-hover:text-blue-600 sm:link-muted dark:hover:underline " +
    "md:decoration-dotted hover:bg-raised dark:bg-sunken text-xs [@media(hover:none)]:underline",
);
// The site a verify link elsewhere names.
out.sites = Object.fromEntries(
  [
    "https://github.com/liquity/bold",
    "HTTPS://WWW.GitHub.com/liquity/bold",
    "ipfs://bafybeigdyrzt/readme",
    "mailto:team@example.org",
    "not a url",
  ].map((href) => [href, viaSiteName(href)]),
);
process.stdout.write(JSON.stringify(out));

// Run by scripts/test/spine-amount-link.test.mjs through tsx (the spine is
// .tsx and imports through `@/`): renders each case of
// spine-amount-link.cases.mjs server-side, and the Liquity V2 adjust again
// with an `amountLink` on its BOLD row, to a Rails page and to one outside
// Rails, and prints the markup as JSON.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpineColumn } from "@/components/shared/spine-column";
import { CASES } from "./spine-amount-link.cases.mjs";

const out = Object.fromEntries(Object.entries(CASES).map(([k, c]) => [k, renderToStaticMarkup(h(SpineColumn, c))]));
const link = { href: "/sepolia/polaris/reserve-loans/28", tip: "Went to reserve loan #28 →", marked: true };
const linked = {
  ...CASES.liquityAdjust,
  tokens: CASES.liquityAdjust.tokens.map((t) => (t.symbol === "BOLD" ? { ...t, amountLink: link } : t)),
};
out.linked = renderToStaticMarkup(h(SpineColumn, linked));
// The same row linked to a place outside Rails (the block explorer).
const outside = { href: "https://sepolia.etherscan.io/address/0x1", tip: "Went to the splitter ↗", external: true };
const linkedExternal = {
  ...CASES.liquityAdjust,
  tokens: CASES.liquityAdjust.tokens.map((t) => (t.symbol === "BOLD" ? { ...t, amountLink: outside } : t)),
};
out.linkedExternal = renderToStaticMarkup(h(SpineColumn, linkedExternal));
process.stdout.write(JSON.stringify(out));

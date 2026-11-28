// Run by scripts/test/kind-rings.test.mjs through tsx (the icons are .tsx and
// import through `@/`): renders each case of kind-rings.cases.mjs server-side
// and prints the markup as JSON, the Pendle cases under `pendle` and the
// Polaris split tokens (ui-jobs 871) under `polaris`.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PendleTokenIcon } from "@/components/protocol/pendle/pendle-token-icon";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { SpineColumn } from "@/components/shared/spine-column";
import { OnSepolia } from "./kind-rings.sepolia.tsx";
import { FPETH, PETH, SVPETH, VPETH } from "@/lib/polaris/asset-catalog";
import { PENDLE_ICONS, PT_CHIPS, SPINES } from "./kind-rings.cases.mjs";

const render = (cases, C) => Object.entries(cases).map(([k, p]) => [k, renderToStaticMarkup(h(C, p))]);
const pendle = Object.fromEntries([
  ...render(PENDLE_ICONS, PendleTokenIcon),
  ...render(PT_CHIPS, TokenChipIcon),
  ...render(SPINES, SpineColumn),
]);

const onSepolia = (el) => renderToStaticMarkup(h(OnSepolia, null, el));
const polaris = {};
for (const t of [PETH, FPETH, VPETH, SVPETH])
  for (const size of [16, 20, 28]) {
    polaris[`${t.symbol}-${size}`] = onSepolia(
      h(TokenChipIcon, { symbol: t.symbol, address: t.address, size, filterable: false }),
    );
    polaris[`${t.symbol}-${size}-symbol-only`] = onSepolia(
      h(TokenChipIcon, { symbol: t.symbol, size, filterable: false }),
    );
  }
polaris["fpETH-symbol-off-sepolia"] = renderToStaticMarkup(
  h(TokenChipIcon, { symbol: FPETH.symbol, size: 28, filterable: false }),
);
polaris.spine = onSepolia(
  h(SpineColumn, {
    isLast: true,
    tokens: [{ symbol: SVPETH.symbol, address: SVPETH.address, direction: "right", value: 2 }],
  }),
);
process.stdout.write(JSON.stringify({ pendle, polaris, pethAddress: PETH.address }, null, 1));

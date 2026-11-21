// The holder strip's "Everything this wallet holds" link is drawn only for a
// protocol the /wallet page reads (WALLET_PROTOCOLS): Polaris on Sepolia is
// not read there (ui-jobs 691), so its strip draws no link to an empty page.
// The adapters import through `@/`, resolved here as
// polaris-holder-strip-kinds.test.mjs does.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\\.[a-z]+$/.test(url)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const { walletPageHref, WALLET_PROTOCOLS } = await import(ROOT + "lib/wallet/wallet-filters.ts");
const { polarisHolderStrip } = await import(ROOT + "lib/polaris/holder-strip.ts");
const { liquityV2HolderStrip } = await import(ROOT + "lib/liquity-v2/holder-strip.ts");
const { liquityV1HolderStrip } = await import(ROOT + "lib/liquity-v1/holder-strip.ts");

const cdp = (cdpId, status) => ({
  market: "usdp",
  cdpId,
  status,
  coll: status === "open" ? 1 : 0,
  debt: status === "open" ? 1000 : 0,
  stableSymbol: "USDp",
  collRaw: null,
  debtRaw: null,
  peakColl: 1,
  peakDebt: 1000,
  owner: "0x1",
  liquidated: status === "liquidated",
  eventCount: 1,
  liqCount: 0,
  transferCount: 0,
  lastTs: 0,
  lastBlock: 0,
});
const board = {
  blockNumber: 1,
  chainStale: false,
  markets: [
    {
      market: "usdp",
      mcr: 1.15,
      defensiveMcr: 1.5,
      defensiveMode: false,
      interestRate: 0.03,
      price: { pethInDebt: 6000, pethUsd: 6000, curve: 2, ethUsd: 3000, xauUsd: null },
    },
  ],
};
const W = "0x66fd591ae065dafc1c84c5bf6cda64f2f29d9c16";

test("a protocol the wallet page reads links it; one it leaves out does not", () => {
  for (const p of WALLET_PROTOCOLS) assert.equal(walletPageHref(p.slug, W), `/wallet/${W}`, p.slug);
  assert.equal(walletPageHref("polaris", W), null);
  assert.equal(walletPageHref(undefined, W), null);
  assert.equal(walletPageHref("liquity-v2", undefined), null);
  assert.equal(walletPageHref("liquity-v2", "vitalik.eth"), "/wallet/vitalik.eth");
});

test("each listing adapter names its protocol, and only Polaris's goes unlinked", () => {
  const polaris = polarisHolderStrip([cdp("1", "open"), cdp("2", "open")], 2, board, 20, 0, W);
  assert.equal(polaris.protocol, "polaris");
  assert.equal(walletPageHref(polaris.protocol, polaris.wallet), null);
  // Past one page too.
  const many = Array.from({ length: 20 }, (_, i) => cdp(String(i), "open"));
  const slice = polarisHolderStrip(many, 30, board, 20, 0, W);
  assert.equal(slice.truncated, true);
  assert.equal(walletPageHref(slice.protocol, slice.wallet), null);

  const v2 = liquityV2HolderStrip([], 0, { weth: 1, wsteth: 1, reth: 1 }, 20, 0, W);
  assert.equal(walletPageHref(v2.protocol, v2.wallet), `/wallet/${W}`);
  const v1 = liquityV1HolderStrip({ rows: [], total: 0 }, undefined, 20, W);
  assert.equal(walletPageHref(v1.protocol, v1.wallet), `/wallet/${W}`);
});

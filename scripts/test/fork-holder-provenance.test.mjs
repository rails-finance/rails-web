// The receipt on a fork Trove page's "last holder":
// the TroveNFT's wallet-to-wallet transfers. The builder imports through `@/`,
// resolved here as compound-arbitrum-holder-strip.test.mjs does.
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

const { forkLastHolderProv } = await import(ROOT + "lib/liquity-fork/holder-provenance.ts");

const T = [
  {
    block: 23125542,
    at: 1755008663,
    logIndex: 3,
    from: "0xf9f0a86fea7f5698e4fa03a8506878c24f8700af",
    to: "0x8d78a47274818e1c81e47cfece5bef5fecc4b5ec",
    tx: "0x5f98",
  },
  {
    block: 24629345,
    at: null,
    logIndex: 1,
    from: "0x8d78a47274818e1c81e47cfece5bef5fecc4b5ec",
    to: "0x25b85831da750c912ab7f0cf53b9d82f7894ed07",
    tx: "0x4b33",
  },
];

test("the receipt lists each wallet-to-wallet transfer with its transaction", () => {
  const p = forkLastHolderProv("ebisu", 1, T);
  assert.equal(
    p.summary,
    "The TroveNFT passed between wallets 2 times. The wallet named here held it when the Trove closed. The inputs list its Transfer logs, mint and burn left out.",
  );
  assert.equal(p.inputs[0].verify.text, "The transaction on Etherscan");
  assert.equal(p.verify.text, "Each transfer links its transaction on Etherscan.");
  assert.match(p.via, /\/api\/ebisu\/troves\?troveId=…&former=1 · ebisu_trove_nft_transfers/);
  assert.equal(p.inputs.length, 2);
  assert.equal(p.inputs[0].label, "Transfer, block 23,125,542 (12 Aug 2025)");
  assert.equal(p.inputs[0].value, "0xf9f0…00af → 0x8d78…b5ec");
  assert.equal(p.inputs[0].pclass, "emitted");
  assert.match(p.inputs[0].verify.href, /etherscan\.io\/tx\/0x5f98$/);
  assert.equal(p.inputs[1].label, "Transfer, block 24,629,345");
});

test("one transfer reads once; Basedollar's links go to the Base explorer", () => {
  const p = forkLastHolderProv("basedollar", 8453, T.slice(0, 1));
  assert.match(p.summary, /passed between wallets once/);
  assert.match(p.inputs[0].verify.href, /basescan\.org\/tx\/0x5f98$/);
  assert.equal(p.inputs[0].verify.text, "The transaction on Basescan");
});

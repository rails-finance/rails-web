// The /vaults index and IPOR Fusion's rosters (lib/vaults/index-rosters.ts;
// rails-ops TO-DO-ipor-scoping §6.3 phase C): while a roster page is
// unlaunched the index neither reads nor lists it, and an unlaunched IPOR
// roster never holds the index's own launch back. The modules import through
// `@/`, so this file resolves `@/` and extensionless paths as
// chain-launch.test.mjs does.
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

const R = await import("../../lib/vaults/index-rosters.ts");
const P = await import("../../lib/shared/protocols.ts");

const key = (r) => `${r.protocol}:${r.chainId}`;
const ungated = R.VAULT_INDEX_ROSTERS.filter((r) => r.protocol !== "ipor-fusion").map(key);

test("every IPOR Fusion entry is unlaunched today, so the index lists none of them", () => {
  for (const id of ["ipor-fusion", "ipor-fusion-arbitrum", "ipor-fusion-base"])
    assert.equal(P.PROTOCOLS.find((p) => p.id === id)?.unlaunched, true, id);
  assert.deepEqual(R.VAULT_INDEX_LISTED().map(key), ungated);
});

test("hidden mode: unlaunched IPOR rosters are neither read nor listed", () => {
  const listed = R.listedIndexRosters((href) => !href.includes("/ipor-fusion/"));
  assert.deepEqual(listed.map(key), ungated);
});

test("launched mode: the three IPOR rosters join after the others", () => {
  const listed = R.listedIndexRosters(() => true);
  assert.deepEqual(listed.map(key), [...ungated, "ipor-fusion:1", "ipor-fusion:42161", "ipor-fusion:8453"]);
});

test("an unlaunched IPOR roster never holds the index's launch back", () => {
  assert.equal(R.vaultIndexLaunched(), true);
});

test("an IPOR roster and vault resolve to their chain's pages", () => {
  assert.equal(R.vaultIndexRosterHref("ipor-fusion", 8453), "/base/ipor-fusion/vaults");
  assert.equal(R.vaultIndexRosterHref("ipor-fusion", 42161), "/arbitrum/ipor-fusion/vaults");
});

test("the holder label links nowhere while the IPOR Fusion pages are unlaunched", async () => {
  const { holderLabelHref } = await import("../../lib/ipor-fusion/label-href.ts");
  const R2 = await import("../../lib/vaults/routes.ts");
  const v = "0xb8a451107a9f87fde481d4d686247d6e43ed715e";
  assert.equal(R2.iporFusionVaultHref(1, v), `/ethereum/ipor-fusion/vaults/${v}`);
  for (const chainId of [1, 42161, 8453]) assert.equal(holderLabelHref(chainId, v), null);
  assert.equal(holderLabelHref(10, v), null);
});

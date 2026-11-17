// lib/polaris/search.ts parsePolarisSearch: a market name before a position
// number scopes it to that market ("usdp:34", "goldp #34"), from the catalog's
// market names in any case; a bare number still names both (rails-ops ui-jobs
// 694).
// Run: npm test
//
// The modules import through `@/`, so this file resolves `@/` and
// extensionless paths as head-snapshot.test.mjs does.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync, readFileSync } from "node:fs";
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
    if (url.endsWith(".tsx")) {
      const src = readFileSync(fileURLToPath(url), "utf8");
      const names = [...src.matchAll(/^export (?:async )?(?:function|const) (\\w+)/gm)].map((m) => m[1]);
      const body = names.map((n) => "export const " + n + " = () => null;").join("\\n");
      return { url: "data:text/javascript," + encodeURIComponent(body), shortCircuit: true };
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}`;
register("data:text/javascript," + encodeURIComponent(hook));

const { parsePolarisSearch, namesIdentity, namesHolder } = await import(ROOT + "lib/polaris/search.ts");

test("a market name scopes the number, in any case and separator", () => {
  for (const q of ["usdp:34", "USDp #34", "usdp#34", "usdp 34", "usdp: #34", " usdp34 "])
    assert.deepEqual(parsePolarisSearch(q), { market: "usdp", cdpId: "34" }, q);
  for (const q of ["goldp #34", "GOLDp 34", "GOLDP:34"])
    assert.deepEqual(parsePolarisSearch(q), { market: "goldp", cdpId: "34" }, q);
});

test("a bare number names both markets", () => {
  assert.deepEqual(parsePolarisSearch("34"), { cdpId: "34" });
});

test("an unknown market name, or a name with no number, names nothing", () => {
  assert.deepEqual(parsePolarisSearch("eurp:34"), {});
  assert.deepEqual(parsePolarisSearch("usdp"), {});
  assert.deepEqual(parsePolarisSearch("usdp:"), {});
  assert.deepEqual(parsePolarisSearch("usdp 3 4"), {});
});

test("addresses and names parse as before", () => {
  const a = "0x00000000000000000000000000000000000000Ab";
  assert.deepEqual(parsePolarisSearch(a), { ownerAddress: a });
  assert.deepEqual(parsePolarisSearch("vitalik.eth"), { ownerEns: "vitalik.eth" });
});

test("a scoped number is an identity, not a holder", () => {
  assert.equal(namesIdentity("goldp #34"), true);
  assert.equal(namesHolder("goldp #34"), false);
});

// lib/vaults/position-row.ts: a census row through /api/vaults/positions keeps
// its family word (rails-ops ui-jobs 584). Run: npm test
//
// The helper imports through `@/`, so this file registers a resolver for the
// alias (and the extensionless specifier) before loading it.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../", import.meta.url).href;
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = ${JSON.stringify(root)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = root + specifier.slice(2) + ext;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { toRow, isVaultPositionFamily } = await import("../../lib/vaults/position-row.ts");

const row = (family, chainId = 1) => ({
  chainId,
  vault: "0xBE53A109B494E5C9F97B9CD39FE969BE68BF6204",
  holder: "0xD5AA0000000000000000000000000000000BC68",
  family,
  symbol: "yvUSDC-1",
  shareDecimals: 6,
  balance: "4200000000000",
  live: true,
  transferCount: 3,
  firstBlock: 19419991,
  lastBlock: 26390000,
  shape: "eoa",
  shapeDetail: null,
  censusBlock: 26390577,
  valueUsdE8: null,
  sharePpm: "255600",
});

test("a yearn-v3 row keeps its family through toRow", () => {
  const r = toRow(row("yearn-v3"), 1, null);
  assert.equal(r.family, "yearn-v3");
  assert.equal(r.vault, "0xbe53a109b494e5c9f97b9cd39fe969be68bf6204");
  assert.equal(r.census.sharePpm, "255600");
});

test("every family word the census writes is kept", () => {
  for (const f of ["sgho", "stata", "umbrella-stake", "morpho", "yearn-v3"]) {
    assert.equal(isVaultPositionFamily(f), true, f);
    assert.equal(toRow(row(f), 1, null).family, f);
  }
});

test("a word the web tier does not know falls back to the chain's own family", () => {
  assert.equal(toRow(row("maple-pool"), 1, null).family, "stata");
  assert.equal(toRow(row("maple-pool", 8453), 8453, null).family, "morpho");
});

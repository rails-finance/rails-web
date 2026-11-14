// The census families (rails-ops ui-jobs 585): Yearn V3 has a census, read on
// the rosters, the index and /vaults/compare as the other census families'
// is. Covers lib/vaults/families.ts, the Yearn roster summaries
// (lib/vaults/summary.ts), the roster preset and compare's holder words.
// Run: npm test
//
// The modules import through `@/` and through extensionless relative
// specifiers, so this file registers a resolver for both before loading them.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../", import.meta.url).href;
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = ${JSON.stringify(root)};
export async function resolve(specifier, context, next) {
  const base = specifier.startsWith("@/")
    ? root + specifier.slice(2)
    : specifier.startsWith(".") && context.parentURL && !/\\.[cm]?[jt]sx?$/.test(specifier)
      ? new URL(specifier, context.parentURL).href
      : null;
  if (base) {
    for (const ext of [".ts", ".tsx"]) {
      if (existsSync(fileURLToPath(base + ext))) return { url: base + ext, shortCircuit: true };
    }
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { VAULT_FAMILIES, familyOfCensus } = await import("../../lib/vaults/families.ts");
const { yearnVaultSummaries } = await import("../../lib/vaults/summary.ts");
const { inRosterPreset } = await import("../../lib/vaults/roster-preset.ts");
const { HOLDER_WORDS } = await import("../../lib/vaults/compare-words.ts");

const VAULT = "0x358d94b5b2f147d741088803d932acb566acb7b6";
const OTHER = "0x00cb87656196dd835b9e4d67018ae0477a1de8c1";

const censusRow = (vault, liveCount, participants = liveCount + 5) => ({
  chainId: 1,
  vault,
  family: "yearn-v3",
  symbol: "yv",
  shareDecimals: 18,
  censusBlock: 26390577,
  participants,
  liveCount,
  sumMatches: true,
  loadedAt: "2026-11-11T08:48:45.962Z",
});

const directoryRow = (address, endorsed) => ({
  address,
  factory: "0x0",
  apiVersion: "3.0.4",
  name: "Vault",
  censusName: "Vault",
  censusSymbol: "yv",
  asset: { address: "0xa", symbol: "USDC", decimals: 6, named: true },
  totalAssets: { raw: "1000000", value: 1 },
  sharePrice: { raw: "1000000", value: 1 },
  endorsed,
  shutdown: false,
  createdBlock: 1,
});

const directory = (rows) => ({
  blockNumber: 26390600,
  chainStale: false,
  readAt: "2026-11-11T09:00:00.000Z",
  censusBlock: 1,
  censusBlockIso: "",
  catalogSize: rows.length,
  rows,
});

test("every family but Maple's names its census word, and the word maps back", () => {
  assert.equal(VAULT_FAMILIES["yearn-v3"].census, "yearn-v3");
  assert.equal(VAULT_FAMILIES.metamorpho.census, "morpho");
  assert.equal(VAULT_FAMILIES["maple-pool"].census, null);
  for (const [family, entry] of Object.entries(VAULT_FAMILIES)) {
    if (entry.census != null) assert.equal(familyOfCensus(entry.census), family);
  }
});

test("a Yearn roster row carries its census row's counts and block", () => {
  const [held, unheld] = yearnVaultSummaries(directory([directoryRow(VAULT, true), directoryRow(OTHER, false)]), [
    censusRow(VAULT, 13230, 25000),
  ]);
  assert.deepEqual(held.census, { holders: 25000, live: 13230, sumMatches: true, atBlock: 26390577 });
  assert.equal(unheld.census, null);
  assert.equal(yearnVaultSummaries(directory([directoryRow(VAULT, true)]))[0].census, null);
});

test("the preset reads a Yearn vault's census, and its endorsement only without one", () => {
  const [busy, quiet] = yearnVaultSummaries(directory([directoryRow(VAULT, false), directoryRow(OTHER, true)]), [
    censusRow(VAULT, 150),
    censusRow(OTHER, 3),
  ]);
  assert.equal(inRosterPreset(busy), true);
  assert.equal(inRosterPreset(quiet), false);
  const [endorsed, unendorsed] = yearnVaultSummaries(
    directory([directoryRow(VAULT, true), directoryRow(OTHER, false)]),
  );
  assert.equal(inRosterPreset(endorsed), true);
  assert.equal(inRosterPreset(unendorsed), false);
});

test("compare says a Yearn census did not answer, and that Maple has no count", () => {
  assert.equal(HOLDER_WORDS.noCensus("yearn-v3"), "The census did not answer.");
  assert.equal(HOLDER_WORDS.noCensus("metamorpho"), "The census did not answer.");
  assert.equal(HOLDER_WORDS.noCensus("maple-pool"), "No holder count yet.");
});

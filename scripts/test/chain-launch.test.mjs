// The chain launch flag (lib/shared/protocols.ts `isLaunchedChain`): a chain is
// launched when it has at least one launched explorer. A chain with no
// explorers (Optimism, Arc) and one whose every explorer is unlaunched appear
// on no listing surface. The modules import through `@/`, so this file resolves
// `@/` and extensionless paths as erc20-meta.test.mjs does.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const { CHAINS, OPTIMISM_CHAIN_ID, ARC_CHAIN_ID, nativeCurrency, explorerUrl, ARC_USDC_ERC20 } = await import(
  "../../lib/shared/chains.ts"
);
const P = await import("../../lib/shared/protocols.ts");

const NEW = [OPTIMISM_CHAIN_ID, ARC_CHAIN_ID];

test("the rule: no explorers, or only unlaunched ones, is an unlaunched chain", () => {
  assert.equal(P.chainLaunchedIn([], 10), false);
  assert.equal(P.chainLaunchedIn([{ chainId: 1 }], 10), false);
  assert.equal(
    P.chainLaunchedIn(
      [
        { chainId: 10, unlaunched: true },
        { chainId: 10, unlaunched: true },
      ],
      10,
    ),
    false,
  );
  assert.equal(P.chainLaunchedIn([{ chainId: 10, unlaunched: true }, { chainId: 10 }], 10), true);
});

test("Optimism and Arc are registered and unlaunched", () => {
  for (const id of NEW) {
    assert.ok(CHAINS[id], `CHAINS has ${id}`);
    assert.equal(P.isLaunchedChain(id), false);
    assert.equal(P.protocolsForChain(id).length, 0);
  }
  assert.equal(P.isLaunchedChain(1), true);
});

test("an unlaunched chain is on no roster-derived listing", () => {
  const ids = P.launchedChains().map((c) => c.id);
  for (const id of NEW) assert.ok(!ids.includes(id), `launchedChains() leaves out ${id}`);
  assert.deepEqual(
    ids,
    Object.values(CHAINS)
      .filter((c) => P.isLaunchedChain(c.id))
      .map((c) => c.id),
  );
  const names = P.launchedProductionChainNames();
  assert.doesNotMatch(names, /Optimism|Arc\b/);
  for (const e of [...P.LAUNCHED_PROTOCOLS, ...P.LAUNCHED_PROTOCOL_VERSIONS])
    assert.ok(!NEW.includes(e.chainId), `${e.id} is a launched entry on a new chain`);
});

// The surfaces a reader finds a chain on: each reads the flag, never CHAINS.
const SURFACES = {
  "app/sitemap.ts": /launchedChains\(\)/,
  "app/(site)/about/page.tsx": /launchedChains\(\)/,
  "app/llms.txt/route.ts": /launchedChains\(\)/,
  "components/home/protocol-row.tsx": /launchedChains\(\)/,
  "components/nav/explorer-chooser.tsx": /launchedChains\(\)/,
  "components/shared/chain-toggle.tsx": /launchedChains\(\)/,
  "components/shared/asset-scope-strip.tsx": /launchedChains\(\)/,
  "lib/shared/asset-scope.ts": /isLaunchedChain\(|launchedChains\(\)/,
  "components/start/explorer-picker.tsx": /launchedChains\(\)/,
  "components/StructuredData.tsx": /launchedProductionChainNames\(\)/,
  "components/coverage/coverage-page.tsx": /isLaunchedChain\(/,
  "components/shared/work-in-progress-strip.tsx": /isLaunchedChain\(/,
};

test("every listing surface reads the launch flag", () => {
  for (const [file, rule] of Object.entries(SURFACES)) {
    const src = readFileSync(path.join(REPO, file), "utf8");
    assert.match(src, rule, file);
  }
});

test("Arc's native coin is USDC: 18 decimals native, 6 through its ERC-20 interface", () => {
  assert.deepEqual(nativeCurrency(ARC_CHAIN_ID), { symbol: "USDC", name: "USDC", decimals: 18 });
  assert.equal(ARC_USDC_ERC20.decimals, 6);
  assert.deepEqual(nativeCurrency(OPTIMISM_CHAIN_ID), { symbol: "ETH", name: "Ether", decimals: 18 });
  assert.equal(nativeCurrency(1).symbol, "ETH");
});

test("explorer links: Optimism Etherscan, and Arc's Blockscout logs tab", () => {
  assert.equal(explorerUrl(10, "tx-logs", "0xab"), "https://optimistic.etherscan.io/tx/0xab#eventlog");
  assert.equal(explorerUrl(5042, "tx-logs", "0xab"), "https://explorer.arc.io/tx/0xab?tab=logs");
  assert.equal(explorerUrl(5042, "address", "0xcd"), "https://explorer.arc.io/address/0xcd");
  assert.equal(explorerUrl(1, "tx-logs", "0xab"), "https://etherscan.io/tx/0xab#eventlog");
});

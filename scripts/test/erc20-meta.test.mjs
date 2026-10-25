// lib/sources/chain/erc20-meta.ts `resolveErc20Meta` reads the api's token_meta
// first (rails-ops ui-jobs 444): a stored row maps onto the chain path's
// `named` / `unresolved` flags and is cached; what the api lists as missing, or
// everything when it does not answer, goes to the chain; a transport failure
// is never cached. No RPC URL is set here, so every chain read fails as a
// transport failure. The modules import through `@/`, so this file resolves
// `@/` and extensionless paths as arbitrum-over-budget.test.mjs does.
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
  if (spec === "next/server") return next("next/server.js", ctx);
  // next build resolves \`server-only\` to its own guard; under plain node it is a no-op.
  if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

process.env.API_BEARER_TOKEN = "test-token";
process.env.RAILS_API_URL = "https://api.example";
delete process.env.ALCHEMY_URL;
delete process.env.BASE_RPC_URL;
delete process.env.ARBITRUM_RPC_URL;

const { resolveErc20Meta, erc20NameOf } = await import(ROOT + "lib/sources/chain/erc20-meta.ts");

const addr = (n) => "0x" + n.toString(16).padStart(40, "0");

/** Global fetch answering the api's POST from `rows`, recording what was asked. */
function stubApi(rows, status = 200) {
  const asked = [];
  test.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    asked.push({ url: String(url), chain: body.chain, addresses: body.addresses });
    if (status !== 200) return new Response(JSON.stringify({ error: "x" }), { status });
    const tokens = {};
    const missing = [];
    for (const a of body.addresses) {
      if (rows[a]) tokens[a] = { ...rows[a], readAtBlock: 1, readAt: "2026-10-25T00:00:00.000Z" };
      else missing.push(a);
    }
    return Response.json({ chainId: body.chain, tokens, missing });
  });
  return asked;
}

test.afterEach(() => test.mock.restoreAll());

test("a stored row maps to the chain path's flags and is cached; a missing one goes to the chain", async () => {
  const usdc = addr(0x1001);
  const nft = addr(0x1002);
  const bare = addr(0x1003);
  const gone = addr(0x1004);
  const asked = stubApi({
    [usdc]: { symbol: "USDC", decimals: 6, name: "USD Coin" },
    [nft]: { symbol: null, decimals: null, name: "Some NFT" },
    [bare]: { symbol: null, decimals: 8, name: null },
  });
  const out = await resolveErc20Meta([usdc, nft.toUpperCase().replace("0X", "0x"), bare, gone], 1);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].url, "https://api.example/api/reference/erc20");
  assert.deepEqual(asked[0].addresses, [usdc, nft, bare, gone]);
  assert.deepEqual(out.get(usdc), { address: usdc, symbol: "USDC", decimals: 6, named: true });
  assert.deepEqual(out.get(nft), { address: nft, symbol: "Some NFT", decimals: 18, named: true, unresolved: true });
  assert.deepEqual(out.get(bare), { address: bare, symbol: "0x0000…1003", decimals: 8, named: false });
  assert.equal(erc20NameOf(usdc, 1), "USD Coin");
  assert.equal(erc20NameOf(bare, 1), undefined);
  // Missing from the table, and the chain did not answer: the fallback.
  assert.deepEqual(out.get(gone), {
    address: gone,
    symbol: "0x0000…1004",
    decimals: 18,
    named: false,
    unresolved: true,
  });

  const again = stubApi({});
  const second = await resolveErc20Meta([usdc, nft, bare, gone], 1);
  // The stored rows came from the cache; the transport failure was not kept.
  assert.deepEqual(
    again.map((a) => a.addresses),
    [[gone]],
  );
  assert.equal(second.get(usdc).symbol, "USDC");
});

test("an api that does not answer sends every address to the chain and caches nothing", async () => {
  const a = addr(0x2001);
  const asked = stubApi({}, 503);
  const out = await resolveErc20Meta([a], 8453);
  assert.equal(asked[0].chain, 8453);
  assert.deepEqual(out.get(a), { address: a, symbol: "0x0000…2001", decimals: 18, named: false, unresolved: true });
  const again = stubApi({ [a]: { symbol: "AERO", decimals: 18, name: "Aerodrome" } });
  assert.equal((await resolveErc20Meta([a], 8453)).get(a).symbol, "AERO");
  assert.equal(again.length, 1);
});

test("a chain token_meta does not hold is not asked of the api", async () => {
  const asked = stubApi({});
  await resolveErc20Meta([addr(0x3001)], 42161);
  assert.equal(asked.length, 0);
});

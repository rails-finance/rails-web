// The presence check in front of the wallet page's reads at visit (rails-ops decision 0073 point
// 2; lib/wallet/presence.ts, presence-checks.ts, walletPresence in read-wallet.ts): one multicall
// per chain for a wallet holding nothing, inside decision 0061 point 4's wallet row; a zero answer
// makes no read; a failed check or call reads as before; an entry with no check reads as before.
// The multicall is a fake (presenceDeps.multicall), the backend a stubbed fetch, and the launch
// flags are flipped in memory on the roster's entries. Modules import through `@/`, resolved as
// wallet-visit-families.test.mjs does.
// Run: npm test
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
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const url = root + specifier.slice(2) + ext;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith("file:")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = new URL(specifier + ext, context.parentURL).href;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  if (/^next\\/[a-z-]+$/.test(specifier)) return next(specifier + ".js", context);
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

process.env.RAILS_API_URL = "http://box.test";

// The backend: an empty summary and listing reads; every other route is recorded and refused.
const urls = [];
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  urls.push(url.pathname);
  if (/^\/api\/wallet\/[^/]+\/positions$/.test(url.pathname))
    return json({ address: "", rows: [], total: 0, open: 0, closed: 0, limit: 500, offset: 0 });
  if (url.pathname === "/api/liquity-v1/positions") return json({ rows: [], total: 0, limit: 100, offset: 0 });
  if (/^\/api\/[a-z0-9-]+\/(stability-pool|staking)$/.test(url.pathname))
    return json({ rows: [], pagination: { total: 0 } });
  return json({ error: "no stub" }, 404);
};

const { protocolForSession } = await import("../../lib/shared/protocols.ts");
const { readPresence, presenceReads, PRESENCE_MAX_CALLS, PRESENCE_MAX_REQUESTS } = await import(
  "../../lib/wallet/presence.ts"
);
const checks = await import("../../lib/wallet/presence-checks.ts");
const { walletPresenceEntries, presenceDeps, readWalletUncached, WALLET_VISIT_FAMILIES } = await import(
  "../../lib/wallet/read-wallet.ts"
);
const { LIQUIDITY_SOURCES } = await import("../../lib/wallet/liquidity/sources.ts");

const SESSIONS = WALLET_VISIT_FAMILIES.map((m) => m.id);
const FLAGS = Object.fromEntries(SESSIONS.map((s) => [s, protocolForSession(s)?.unlaunched === true]));
const launchAll = () => SESSIONS.forEach((s) => delete protocolForSession(s).unlaunched);
test.after(() => {
  for (const s of SESSIONS) if (FLAGS[s]) protocolForSession(s).unlaunched = true;
});

const ZERO = BigInt(0);
/** Each call's answer for a wallet holding nothing, by function. */
const nothing = (c) =>
  c.functionName === "getUserReservesData"
    ? [
        [
          {
            underlyingAsset: c.address,
            scaledATokenBalance: ZERO,
            usageAsCollateralEnabledOnUser: false,
            scaledVariableDebt: ZERO,
          },
        ],
        0,
      ]
    : c.functionName === "userBasic"
      ? [ZERO, ZERO, ZERO, 0, 0]
      : ZERO;

/** A fake multicall: records each request and answers with `answer(call)`. */
function fake(answer = nothing) {
  const requests = [];
  const multicall = async (chainId, contracts) => {
    requests.push({ chainId, calls: contracts.length });
    return contracts.map((c) => ({ status: "success", result: answer(c) }));
  };
  return { requests, multicall };
}

const W = "0x00000000000000000000000000000000000000a1";
const lido = { id: "lido", presence: checks.LIDO_PRESENCE };

test("a wallet holding nothing costs one multicall per chain, inside the wallet row", async () => {
  launchAll();
  const entries = [...walletPresenceEntries(), lido];
  const f = fake();
  const answers = await readPresence(entries, W, f.multicall);
  const chains = new Set(entries.filter((e) => e.presence?.kind === "check").map((e) => e.presence.chainId));
  assert.equal(f.requests.length, chains.size);
  assert.equal(new Set(f.requests.map((r) => r.chainId)).size, f.requests.length);
  assert.ok(f.requests.length <= PRESENCE_MAX_REQUESTS);
  assert.ok(f.requests.reduce((s, r) => s + r.calls, 0) <= PRESENCE_MAX_CALLS);
  for (const e of entries) {
    const a = answers.get(e.id);
    assert.equal(a, e.presence?.kind === "check" ? "empty" : "unchecked", e.id);
  }
});

test("every visit module and liquidity source has an entry; Morpho Blue and Balancer V3 say why they have no check", () => {
  for (const m of WALLET_VISIT_FAMILIES) assert.ok(m.presence, m.id);
  for (const s of LIQUIDITY_SOURCES) assert.ok(checks.LIQUIDITY_PRESENCE[s.key], s.key);
  assert.equal(checks.MORPHO_BLUE_PRESENCE.kind, "none");
  assert.match(checks.LIQUIDITY_PRESENCE["balancer:1"].why, /no one call/);
});

test("a balance in any read holds", async () => {
  const one = BigInt(1);
  const cases = [
    [checks.AAVE_V3_OPTIMISM_PRESENCE, (c) => [[{ scaledATokenBalance: ZERO, scaledVariableDebt: one }], 0]],
    [checks.COMPOUND_V3_OPTIMISM_PRESENCE, () => [BigInt(-5), ZERO, ZERO, 0, 0]],
    [checks.COMPOUND_V3_OPTIMISM_PRESENCE, () => [ZERO, ZERO, ZERO, 4, 0]],
    [checks.LIDO_PRESENCE, (c) => (c.address.toLowerCase().startsWith("0x7f39") ? one : ZERO)],
  ];
  for (const [presence, answer] of cases) {
    const a = await readPresence([{ id: "x", presence }], W, fake(answer).multicall);
    assert.equal(a.get("x"), "held");
  }
});

test("a check that fails, or one call in it, reads as before", async () => {
  const entries = [
    { id: "aave", presence: checks.AAVE_V3_OPTIMISM_PRESENCE },
    { id: "comet", presence: checks.COMPOUND_V3_OPTIMISM_PRESENCE },
  ];
  const down = await readPresence(entries, W, async () => {
    throw new Error("gateway down");
  });
  assert.deepEqual([...down.values()], ["failed", "failed"]);
  assert.ok([...down.values()].every(presenceReads));
  const partial = await readPresence(entries, W, async (_chain, contracts) =>
    contracts.map((c) =>
      c.functionName === "userBasic" ? { status: "failure" } : { status: "success", result: nothing(c) },
    ),
  );
  assert.equal(partial.get("aave"), "empty");
  assert.equal(partial.get("comet"), "failed");
  const slow = await readPresence(entries, W, () => new Promise(() => {}), 50);
  assert.deepEqual([...slow.values()], ["failed", "failed"]);
});

test("a module whose check finds nothing makes no read; one that holds reads its route", async () => {
  launchAll();
  presenceDeps.multicall = fake().multicall;
  urls.length = 0;
  await readWalletUncached("0x00000000000000000000000000000000000000b2");
  assert.ok(!urls.some((p) => /aave-v3-optimism|compound-v3-optimism/.test(p)), urls.join(" "));
  // Morpho Blue has no check: its routes read as before.
  assert.ok(urls.some((p) => p.includes("morpho")));
  presenceDeps.multicall = fake((c) =>
    c.functionName === "userBasic" ? [BigInt(7), ZERO, ZERO, 0, 0] : nothing(c),
  ).multicall;
  urls.length = 0;
  await readWalletUncached("0x00000000000000000000000000000000000000b3");
  assert.ok(urls.some((p) => p.includes("compound-v3-optimism")));
  assert.ok(!urls.some((p) => p.includes("aave-v3-optimism")));
});

test("the Uniswap-family checks ask each chain's position managers, and PancakeSwap's farm", async () => {
  const { UNI_DEPLOYMENTS } = await import("../../lib/uniswap/deployments.ts");
  for (const d of UNI_DEPLOYMENTS) {
    const p = checks.LIQUIDITY_PRESENCE[`${d.protocol}:${d.chainId}`];
    assert.equal(p.kind, "check", `${d.protocol}:${d.chainId}`);
    assert.equal(p.chainId, d.chainId);
    const want = [d.v3Npm, d.v4PositionManager, d.masterChef].filter(Boolean).map((a) => a.toLowerCase());
    const calls = p.calls(W);
    assert.deepEqual(
      calls.map((c) => c.address.toLowerCase()),
      want,
    );
    assert.ok(calls.every((c) => c.functionName === "balanceOf" && c.args[0] === W));
  }
  // A position staked in MasterChefV3 holds, with nothing in the owner's own NFTs.
  const farm = UNI_DEPLOYMENTS.find((d) => d.masterChef);
  const staked = await readPresence(
    [{ id: "farm", presence: checks.LIQUIDITY_PRESENCE[`${farm.protocol}:${farm.chainId}`] }],
    W,
    fake((c) => (c.address.toLowerCase() === farm.masterChef.toLowerCase() ? BigInt(1) : ZERO)).multicall,
  );
  assert.equal(staked.get("farm"), "held");
  // Slipstream's staked positions sit in each pool's gauge: no check, and a reason.
  for (const k of ["aerodrome:8453", "velodrome:10"]) {
    assert.equal(checks.LIQUIDITY_PRESENCE[k].kind, "none", k);
    assert.match(checks.LIQUIDITY_PRESENCE[k].why, /gauge/);
  }
});

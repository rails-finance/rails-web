// The visit modules for Fluid on Base and Lido (rails-ops decision 0073; lib/wallet/families/
// fluid-base.ts, lido.ts): each module's `shape` over its route's answer. A holder gives its
// positions with the card kind, href, Kind pill and chain; an answer holding nothing gives none;
// an answer outside the route's shape throws. Fixtures follow lib/fluid-base/types.ts and
// lib/lido/types.ts. Modules import through `@/`, resolved as wallet-presence.test.mjs does.
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

const { fluidBase } = await import("../../lib/wallet/families/fluid-base.ts");
const { lido } = await import("../../lib/wallet/families/lido.ts");

const W = "0xC2aee730530AE26571d868743c4e1ad401F30f22";
const w = W.toLowerCase();
const head = { block: 38_000_000, time: 1_764_000_000 };
const token = (symbol, decimals, address) => ({ address, symbol, decimals });
const WETH = token("WETH", 18, "0x4200000000000000000000000000000000000006");
const USDC = token("USDC", 6, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");

const fluidRow = (id, supply, borrow) => ({
  id,
  vault: "0x0000000000000000000000000000000000000f01",
  vaultId: 3,
  vaultType: 10000,
  supplyLeg: { kind: "token", token: WETH, token1: null, priceAsset: WETH.address },
  borrowLeg: { kind: "token", token: USDC, token1: null, priceAsset: USDC.address },
  supply,
  borrow,
  isLiquidated: false,
});
const fluidAnswer = (positions) => ({
  chainId: 8453,
  head,
  resolver: "0xA5C3E16523eeeDDcC34706b0E6bE88b4c6EA95cC",
  positions,
  empty: 0,
  truncated: false,
});

test("Fluid on Base: a holder's position is a vault on Base, its card the read with it alone", () => {
  const answer = fluidAnswer([fluidRow("4021", "2000000000000000000", "1500000000")]);
  const [p, ...rest] = fluidBase.shape(answer, W);
  assert.equal(rest.length, 0);
  assert.equal(p.chain, 8453);
  assert.equal(p.family, "fluid");
  assert.equal(p.kind, "vaults");
  assert.equal(p.status, "open");
  assert.equal(p.href, "/base/fluid/position/4021");
  assert.equal(p.market, "WETH / USDC");
  assert.equal(p.card.kind, "fluid-base");
  assert.deepEqual(p.card.read.positions, answer.positions);
  assert.equal(p.headRead, "read");
  assert.equal(p.readAtBlock, head.block);
  // The read states no dollars.
  assert.equal(p.collateralUsd, undefined);
  assert.equal(p.debtUsd, undefined);
});

test("Fluid on Base: two positions give two cards, each with its own position", () => {
  const answer = fluidAnswer([fluidRow("9", "1", "0"), fluidRow("8", "5", "0")]);
  const out = fluidBase.shape(answer, W);
  assert.deepEqual(
    out.map((p) => p.card.read.positions.map((x) => x.id)),
    [["9"], ["8"]],
  );
});

test("Fluid on Base: an answer holding nothing gives no position", () => {
  assert.deepEqual(fluidBase.shape(fluidAnswer([]), W), []);
  assert.deepEqual(fluidBase.shape(fluidAnswer([fluidRow("1", "0", "0")]), W), []);
});

test("Fluid on Base: an answer outside its shape throws", () => {
  assert.throws(() => fluidBase.shape(null, W), /outside its shape/);
  assert.throws(() => fluidBase.shape({ head }, W), /outside its shape/);
  assert.throws(() => fluidBase.shape({ positions: [] }, W), /outside its shape/);
});

const lidoAnswer = ({ stethShares = "0", wstethBalance = "0", rows = [] } = {}) => ({
  chainId: 1,
  steth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  queue: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
  wallet: W,
  windowState: "ok",
  head,
  then: { block: 37_784_000, time: 1_761_408_000 },
  provider: "test",
  now: {
    stethShares,
    wstethBalance,
    rate: "1210000000000000000",
    stethBalance: "0",
    wstethEth: "0",
    totalEth: "0",
  },
  past: { stethShares, wstethBalance, rate: "1200000000000000000" },
  requests: { count: rows.length, lastFinalizedRequestId: "0", lastCheckpointIndex: "0", rows, truncated: false },
});
const request = (isClaimed) => ({
  id: "77",
  amountOfStETH: "1000000000000000000",
  amountOfShares: "830000000000000000",
  timestamp: 1_763_000_000,
  isFinalized: true,
  isClaimed,
  claimableEth: isClaimed ? null : "1000000000000000000",
  hint: null,
});

test("Lido: a holder's stake is one stake on Ethereum, linked at the wallet", () => {
  const answer = lidoAnswer({ wstethBalance: "3000000000000000000" });
  const [p, ...rest] = lido.shape(answer, W);
  assert.equal(rest.length, 0);
  assert.equal(p.chain, 1);
  assert.equal(p.family, "lido");
  assert.equal(p.kind, "stakes");
  assert.equal(p.status, "open");
  assert.equal(p.href, `/ethereum/lido/${w}`);
  assert.equal(p.positionId, `lido:${w}`);
  assert.equal(p.card.kind, "lido");
  assert.equal(p.card.read, answer);
  assert.equal(p.readAtBlock, head.block);
  assert.equal(p.collateralUsd, undefined);
});

test("Lido: a withdrawal request not yet claimed holds a stake with no shares", () => {
  assert.equal(lido.shape(lidoAnswer({ rows: [request(false)] }), W).length, 1);
});

test("Lido: an answer holding nothing gives no position", () => {
  assert.deepEqual(lido.shape(lidoAnswer(), W), []);
  assert.deepEqual(lido.shape(lidoAnswer({ rows: [request(true)] }), W), []);
});

test("Lido: an answer outside its shape throws", () => {
  assert.throws(() => lido.shape(null, W), /outside its shape/);
  assert.throws(() => lido.shape({ head }, W), /outside its shape/);
  const noRows = lidoAnswer();
  delete noRows.requests;
  assert.throws(() => lido.shape(noRows, W), /outside its shape/);
});

test("both modules read their explorer's wallet route for the owner", () => {
  assert.equal(fluidBase.path(W), `/api/at-block/fluid-base/positions?owner=${w}`);
  assert.equal(lido.path(W), `/api/at-block/lido/stake?owner=${w}`);
});

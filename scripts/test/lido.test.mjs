// lib/lido/stake.ts and words.ts against a read in the shape of rails-server's
// Lido at-block route (rails-ops ui-jobs 570): the share rates are Ethereum's at
// blocks 26,388,003 and 26,172,000 (11 Nov 2026), the wallet's shares and its
// requests hand-made around wallet 0x1B7a…6fFf's.
// Run: npm test
//
// The modules import Uniswap's words by extensionless relative specifier, so
// this file registers a resolver that adds the `.ts` before loading them.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + ".ts", context.parentURL).href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { gainOn, growth, lidoStake, lidoTotals, requestRow, units } = await import("../../lib/lido/stake.ts");
const { readoutLines, REQUESTS, rateText, signed } = await import("../../lib/lido/words.ts");

const RATE_NOW = "1248899063481582992";
const RATE_THEN = "1246088839423097632";
const E = "000000000000000000";
const read = (over = {}) => ({
  chainId: 1,
  steth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  queue: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
  wallet: "0x1B7a4C3797236A1C37f8741c0Be35c2c72736fFf",
  head: { block: 26_388_003, time: 1_794_355_763 },
  then: { block: 26_172_000, time: 1_791_755_291 },
  provider: "mainnet.gateway.tenderly.co",
  now: {
    stethShares: `80${E}`,
    wstethBalance: `20${E}`,
    rate: RATE_NOW,
    stethBalance: "99911925078526639360",
    wstethEth: "24977981269631659840",
    totalEth: "124889906348158299200",
  },
  past: { stethShares: `90${E}`, wstethBalance: "0", rate: RATE_THEN },
  requests: {
    count: 3,
    lastFinalizedRequestId: "141296",
    lastCheckpointIndex: "1275",
    rows: [
      {
        id: "141346",
        amountOfStETH: `1000${E}`,
        amountOfShares: "800705220494183350706",
        timestamp: 1_794_342_827,
        isFinalized: false,
        isClaimed: false,
        claimableEth: null,
        hint: null,
      },
      {
        id: "141290",
        amountOfStETH: `2${E}`,
        amountOfShares: "1600000000000000000",
        timestamp: 1_794_000_000,
        isFinalized: true,
        isClaimed: false,
        claimableEth: "1999999999999999999",
        hint: "1275",
      },
      {
        id: "141000",
        amountOfStETH: `5${E}`,
        amountOfShares: "4000000000000000000",
        timestamp: 1_790_000_000,
        isFinalized: true,
        isClaimed: true,
        claimableEth: null,
        hint: "1270",
      },
    ],
    truncated: false,
  },
  ...over,
});

test("units keeps 18 places and its sign", () => {
  assert.equal(units(`15${E.slice(1)}`), 1.5);
  assert.equal(units(-(10n ** 18n) / 4n), -0.25);
});

test("the share rate's growth and a gain on shares, exact before they become numbers", () => {
  const g = growth(RATE_THEN, RATE_NOW);
  assert.ok(Math.abs(g - (1.248899063481582992 / 1.246088839423097632 - 1)) < 1e-12, String(g));
  // 90 shares × (1.248899… − 1.246088…).
  assert.ok(Math.abs(gainOn(`90${E}`, RATE_THEN, RATE_NOW) - 0.25292015) < 1e-6);
});

test("a stake: both legs in shares and ETH, the change in shares, what the shares held then earned", () => {
  const s = lidoStake(read());
  assert.equal(s.now.shares, 100);
  assert.equal(s.now.wsteth, 20);
  assert.equal(s.then.shares, 90);
  assert.equal(s.shareChange, 10);
  assert.ok(Math.abs(s.now.eth - 124.8899) < 1e-3);
  assert.ok(Math.abs(s.earned - 0.25292015) < 1e-6);
  assert.equal(s.waitingSteth, 1000);
  assert.ok(Math.abs(s.claimableEth - 2) < 1e-9);
});

test("a request's state: waiting, ready to claim, claimed", () => {
  const rows = read().requests.rows.map(requestRow);
  assert.deepEqual(
    rows.map((q) => q.state),
    ["waiting", "claimable", "claimed"],
  );
  assert.equal(rows[0].claimable, null);
  assert.equal(REQUESTS.claim(rows[1]), "2 ETH to claim");
  assert.equal(REQUESTS.state[rows[2].state], "Claimed");
  assert.match(REQUESTS.summary(lidoStake(read())), /1,000 stETH waiting · 2 ETH ready to claim/);
});

test("the readout: shares, rate, earned; no shares then says so", () => {
  const lines = readoutLines(lidoStake(read()), read().then.time);
  assert.deepEqual(
    lines.map((l) => l.key),
    ["shares", "rate", "earned"],
  );
  assert.match(lines[0].text, /a change of \+10 shares/);
  assert.match(lines[1].text, /^1\.248899 ETH per share now/);
  assert.match(lines[2].text, /shares held on .*, valued at today's rate less that day's/);
  const fresh = readoutLines(lidoStake(read({ past: { stethShares: "0", wstethBalance: "0", rate: RATE_THEN } })), 0);
  assert.match(fresh[2].text, /held no shares/);
  for (const l of lines) assert.doesNotMatch(l.text, /, not |honest|fold/i);
});

test("the protocol's totals", () => {
  const t = lidoTotals({
    ...read(),
    now: {
      totalPooledEther: "9714004689550351049754047",
      totalShares: "7778054266827944924627405",
      rate: RATE_NOW,
      lastRequestId: "141349",
      lastFinalizedRequestId: "141296",
      unfinalizedStETH: "11056646244408727426944",
    },
    past: { totalPooledEther: "0", totalShares: "0", rate: RATE_THEN },
  });
  assert.equal(t.waitingRequests, 53);
  assert.ok(Math.abs(t.pooledEth - 9_714_004.69) < 0.01);
  assert.equal(rateText(t.rate), "1.248899 ETH");
  assert.equal(signed(-0.25), "−0.25");
});

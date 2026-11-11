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

const { gainOn, growth, lidoStake, lidoTotals, requestRow, shareCause, units } = await import(
  "../../lib/lido/stake.ts"
);
const { cardExplainer, readoutExplainer, readoutLines, requestsExplainer, REQUESTS, rateText, signed, WINDOW_WORDS } =
  await import("../../lib/lido/words.ts");

const RATE_NOW = "1248899063481582992";
const RATE_THEN = "1246088839423097632";
const E = "000000000000000000";
const read = (over = {}) => ({
  chainId: 1,
  steth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  queue: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
  wallet: "0x1B7a4C3797236A1C37f8741c0Be35c2c72736fFf",
  windowState: "ok",
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

test("a stake: both legs in shares and ETH, the change in shares; earnings withheld where the shares changed", () => {
  const s = lidoStake(read({ windowState: "changed" }));
  assert.equal(s.now.shares, 100);
  assert.equal(s.now.wsteth, 20);
  assert.equal(s.then.shares, 90);
  assert.equal(s.shareChange, 10);
  assert.ok(Math.abs(s.now.eth - 124.8899) < 1e-3);
  assert.equal(s.earned, null);
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

const SAME = { past: { stethShares: `80${E}`, wstethBalance: `20${E}`, rate: RATE_THEN } };

test("the window's three states: Earned where the shares match, the reason on the line otherwise", () => {
  const ok = lidoStake(read(SAME));
  assert.ok(Math.abs(ok.earned - 100 * (1.248899063481582992 - 1.246088839423097632)) < 1e-9);
  const okLine = readoutLines(ok, read().then.time)[2];
  assert.match(okLine.text, /^0\.281 ETH: the 100 shares held on/);
  assert.equal(okLine.withheld, undefined);
  for (const state of ["opened", "changed"]) {
    const s = lidoStake(read({ windowState: state }));
    assert.equal(s.earned, null);
    const line = readoutLines(s, read().then.time)[2];
    assert.equal(line.text, WINDOW_WORDS[state]);
    assert.match(line.text, /^Not stated: /);
    assert.equal(line.withheld, state);
  }
  assert.equal(readoutExplainer(ok)[0].bullets.length, 2);
});

test("the readout: shares, rate, earned; no shares then says so", () => {
  const lines = readoutLines(lidoStake(read(SAME)), read().then.time);
  assert.deepEqual(
    lines.map((l) => l.key),
    ["shares", "rate", "earned"],
  );
  assert.match(lines[0].text, /the same as on/);
  // From 90 to 100 shares with 800.7 + 1.6 shares requested after the past read (#141000 is older): part.
  assert.match(
    readoutLines(lidoStake(read({ windowState: "changed" })), 0)[0].text,
    /: 802\.3 shares \(1,002 stETH\) went into withdrawal requests #141290 and #141346; the other 812\.3 shares moved into the wallet \(staked, received or bought\)\.$/,
  );
  assert.match(lines[1].text, /^1\.248899 ETH per share now/);
  assert.match(lines[2].text, /shares held on .*, valued at today's rate less that day's/);
  const none = { stethShares: "0", wstethBalance: "0" };
  const fresh = readoutLines(
    lidoStake(read({ now: { ...read().now, ...none }, past: { ...none, rate: RATE_THEN } })),
    0,
  );
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

// Wallet 0xbada…5afe on 11 Nov 2026 (rails-server's read): 405.2 wstETH then, 401.2 now, and request #141400 for
// 4.0033 shares (a wei short of the drop) made after the past read.
const BADA = {
  then: "405248965424130034079",
  now: "401245665424130034079",
  thenTime: 1_791_755_291,
  request: {
    id: "141400",
    amountOfStETH: "5000036936041275227",
    amountOfShares: "4003299999999999999",
    timestamp: 1_794_408_179,
    isFinalized: false,
    isClaimed: false,
    claimableEth: null,
    hint: null,
  },
};

test("the shares' change named from the requests made since the past read", () => {
  const all = shareCause(BigInt(BADA.then), BigInt(BADA.now), BADA.thenTime, [BADA.request]);
  assert.equal(all.fit, "all");
  assert.equal(all.rest, 0);
  const s = lidoStake(
    read({
      windowState: "changed",
      now: { ...read().now, stethShares: "0", wstethBalance: BADA.now },
      past: { stethShares: "0", wstethBalance: BADA.then, rate: RATE_THEN },
      requests: { ...read().requests, count: 1, rows: [BADA.request] },
    }),
  );
  assert.equal(
    readoutLines(s, BADA.thenTime)[0].text,
    "401.2 now, against 405.2 on 11 Oct 2026: 4.003 shares (5 stETH) went into withdrawal request #141400 on 11 Nov.",
  );
  // No request after the past read: the shares moved in or out, and the (i) notes wrapping once.
  const out = shareCause(BigInt(BADA.then), BigInt(BADA.now), BADA.thenTime, [{ ...BADA.request, timestamp: 1 }]);
  assert.equal(out.fit, "none");
  assert.ok(Math.abs(out.rest + 4.0033) < 1e-9);
  // A request for one share against a drop of 4.0033: part, and the rest moved out.
  const part = shareCause(BigInt(BADA.then), BigInt(BADA.now), BADA.thenTime, [
    { ...BADA.request, amountOfShares: `1${E}` },
  ]);
  assert.equal(part.fit, "part");
  assert.ok(Math.abs(part.rest + 3.0033) < 1e-9);
  assert.equal(shareCause(5n, 5n, 0, [BADA.request]), null);
  assert.match(
    cardExplainer(s)[0].bullets[0],
    /^This wallet holds 401\.2 shares, all as wstETH; at 1\.248899 ETH a share/,
  );
  assert.match(requestsExplainer(s)[0].bullets[0], /^The 5 stETH in the waiting request left this wallet's shares/);
  assert.equal(cardExplainer(s)[0].bullets[2], "Another 5 stETH waits in Lido's withdrawal queue, below.");
});

// Wallet 0xf80b…6bec on 11 Nov 2026 (rails-server's read): 2.583 stETH shares then, 1 wei now, and request #141349,
// finalized, made after the past read.
test("a full request leaves a remainder: the cause names its stETH, the card says the remainder and the queue", () => {
  const request = {
    id: "141349",
    amountOfStETH: "3226131411493590565",
    amountOfShares: "2583180263183186392",
    timestamp: 1_794_355_763,
    isFinalized: true,
    isClaimed: false,
    claimableEth: "3226131411493590565",
    hint: "1276",
  };
  const s = lidoStake(
    read({
      windowState: "changed",
      now: { ...read().now, stethShares: "1", wstethBalance: "0", stethBalance: "1", wstethEth: "0", totalEth: "1" },
      past: { stethShares: "2583180263183186393", wstethBalance: "0", rate: RATE_THEN },
      requests: { ...read().requests, count: 1, rows: [request] },
    }),
  );
  assert.equal(s.cause.fit, "all");
  assert.equal(
    readoutLines(s, 1_791_755_291)[0].text,
    "<0.0001 now, against 2.583 on 11 Oct 2026: 2.583 shares (3.226 stETH) went into withdrawal request #141349 on 11 Nov.",
  );
  const card = cardExplainer(s)[0].bullets;
  assert.equal(
    card[0],
    "This wallet holds a remainder under 0.0001 shares, worth under 0.0001 ETH. Sending a whole stETH balance can leave a wei or two behind.",
  );
  assert.equal(card[2], "Another 3.226 ETH sits in Lido's withdrawal queue, ready to claim, below.");
});

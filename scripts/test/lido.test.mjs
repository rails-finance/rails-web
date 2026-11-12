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
const {
  cardExplainer,
  causeText,
  earnedMeaning,
  rateCause,
  readoutExplainer,
  readoutTable,
  requestsExplainer,
  REQUESTS,
  rateText,
  signed,
  WINDOW_WORDS,
} = await import("../../lib/lido/words.ts");

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

test("a request's state: not finalized, claimable, claimed", () => {
  const rows = read().requests.rows.map(requestRow);
  assert.deepEqual(
    rows.map((q) => q.state),
    ["waiting", "claimable", "claimed"],
  );
  assert.equal(rows[0].claimable, null);
  assert.equal(REQUESTS.claim(rows[1]), "2 ETH to claim");
  assert.equal(REQUESTS.state[rows[2].state], "Claimed");
  assert.match(REQUESTS.summary(lidoStake(read())), /1,000 stETH not finalized · 2 ETH claimable/);
});

const SAME = { past: { stethShares: `80${E}`, wstethBalance: `20${E}`, rate: RATE_THEN } };

test("the window's three states: Earned where the shares match, the reason on the line otherwise", () => {
  const ok = lidoStake(read(SAME));
  assert.ok(Math.abs(ok.earned - 100 * (1.248899063481582992 - 1.246088839423097632)) < 1e-9);
  const earnedRow = (x) => readoutTable(x, read().then.time).groups[0].rows[1];
  assert.equal(earnedRow(ok).now, "0.281 ETH");
  assert.equal(earnedRow(ok).withheld, undefined);
  for (const state of ["opened", "changed"]) {
    const s = lidoStake(read({ windowState: state }));
    assert.equal(s.earned, null);
    assert.equal(earnedRow(s).now, "—");
    assert.equal(earnedRow(s).withheld, state);
    const why = readoutExplainer(s).find((g) => g.title === "Earned").bullets;
    assert.deepEqual(why, [WINDOW_WORDS[state]]);
    assert.match(why[0], /^Earned has no figure: /);
  }
  // How it compares, this wallet, Earned (what it is, in three bullets), Lido (why the rate rose).
  assert.deepEqual(
    readoutExplainer(ok).map((g) => [g.title, g.bullets.length]),
    [
      ["How it compares", 2],
      ["This wallet", 1],
      ["Earned", 3],
      ["Lido", 1],
    ],
  );
  assert.match(earnedMeaning(ok), /^Earned is the rise in the shares' worth in ETH .*Nothing was paid out/);
  assert.equal(earnedMeaning(lidoStake(read({ windowState: "changed" }))), null);
});

test("why the share rate moved, by the sign of its change", () => {
  assert.equal(
    rateCause(0.00232),
    "The share rate rose because oracle reports added the validators' rewards, after Lido's fee.",
  );
  assert.equal(
    rateCause(-0.001),
    "The share rate fell because an oracle report recorded a loss, such as slashing or penalties.",
  );
  assert.equal(rateCause(0), null);
  const fell = lidoStake(read({ ...SAME, past: { ...SAME.past, rate: "1250000000000000000" } }));
  assert.ok(fell.earned < 0);
  const bullets = readoutExplainer(fell).find((g) => g.title === "Lido").bullets;
  assert.ok(bullets.includes(rateCause(-1)));
  assert.match(earnedMeaning(fell), /^Earned is the fall/);
});

test("both legs above zero: the card's (i) says how they make the stake", () => {
  // Wallet 0x176f…a132 on 11 Nov 2026: almost all stETH, a little wstETH.
  const s = lidoStake(
    read({
      ...SAME,
      now: {
        stethShares: "191688866583702288850044",
        wstethBalance: "49598208393891739",
        rate: "1248978826478474065",
        stethBalance: "239415335634701266825532",
        wstethEth: "61947112115237706",
        totalEth: "239415397581813382063239",
      },
    }),
  );
  assert.equal(
    cardExplainer(s)[0].bullets[0],
    "This wallet holds 191,689 shares at 1.248979 ETH a share: its 239,415 stETH and 0.0496 wstETH (worth 0.06195 ETH) make the 239,415 ETH stake.",
  );
});

test("the readout: the wallet's shares and Earned, then Lido's rate, each cell a figure", () => {
  const table = readoutTable(lidoStake(read(SAME)), read().then.time);
  assert.match(table.then, /^\d+ \w+ 2026$/);
  const [wallet, lido] = table.groups;
  assert.deepEqual(
    wallet.rows.map((r) => r.label),
    ["Shares", "Earned"],
  );
  assert.deepEqual(
    lido.rows.map((r) => r.label),
    ["Share rate", "Rate change"],
  );
  assert.equal(wallet.rows[0].then, wallet.rows[0].now);
  assert.equal(lido.rows[0].now, "1.248899 ETH");
  for (const r of [...wallet.rows, ...lido.rows])
    for (const x of [r.then, r.now]) if (x) assert.doesNotMatch(x, /\.$|, | \w+ \w+ /);
  // The cause of a change is in the (i). From 90 to 100 shares with 800.7 + 1.6 shares requested
  // after the past read (#141000 is older): part.
  const changed = readoutExplainer(lidoStake(read({ windowState: "changed" })))[1].bullets;
  assert.match(
    changed[0],
    /^The shares changed: 802\.3 shares \(1,002 stETH\) went into withdrawal requests #141290 and #141346; the other 812\.3 shares \([\d,.]+ ETH\) came into the wallet by transfers this page does not trace\.$/,
  );
  assert.equal(readoutExplainer(lidoStake(read(SAME)))[1].bullets[0], "The shares are the same at both blocks.");
  const none = { stethShares: "0", wstethBalance: "0" };
  const fresh = lidoStake(read({ now: { ...read().now, ...none }, past: { ...none, rate: RATE_THEN } }));
  assert.equal(readoutTable(fresh, 0).groups[0].rows[1].now, "—");
  assert.ok(readoutExplainer(fresh)[2].bullets.includes("This wallet held no shares at the first block."));
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
  const row = readoutTable(s, BADA.thenTime).groups[0].rows[0];
  assert.deepEqual([row.then, row.now], ["405.2", "401.2"]);
  assert.equal(
    readoutExplainer(s)[1].bullets[0],
    "The shares changed: 4.003 shares (5 stETH) went into withdrawal request #141400 on 11 Nov.",
  );
  // No request after the past read: the shares moved in or out, and the (i) notes wrapping once.
  const out = shareCause(BigInt(BADA.then), BigInt(BADA.now), BADA.thenTime, [{ ...BADA.request, timestamp: 1 }]);
  assert.equal(out.fit, "none");
  assert.ok(Math.abs(out.rest + 4.0033) < 1e-9);
  assert.match(causeText(out), /^4\.003 shares \([\d,.]+ ETH\) left the wallet by transfers this page does not trace$/);
  assert.equal(
    REQUESTS.tip(s.requests[0]),
    "In Lido's queue until an oracle report finalizes it; it then pays up to 5 ETH.",
  );
  assert.match(requestsExplainer(s)[0].bullets.join(" "), /Lido's docs state no fixed wait for finalizing\./);
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
  assert.match(
    requestsExplainer(s)[0].bullets[0],
    /^The 5 stETH in the request not yet finalized left this wallet's shares/,
  );
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
  const left = readoutTable(s, 1_791_755_291).groups[0].rows[0];
  assert.deepEqual([left.then, left.now], ["2.583", "<0.0001"]);
  assert.equal(
    readoutExplainer(s)[1].bullets[0],
    "The shares changed: 2.583 shares (3.226 stETH) went into withdrawal request #141349 on 11 Nov.",
  );
  const card = cardExplainer(s)[0].bullets;
  assert.equal(
    card[0],
    "This wallet holds a remainder under 0.0001 shares, worth under 0.0001 ETH. Sending a whole stETH balance can leave a wei or two behind.",
  );
  assert.equal(card[2], "Another 3.226 ETH sits in Lido's withdrawal queue, claimable, below.");
});

test("a row's note: why the shares moved and why Earned is empty, in a few words", async () => {
  const { causeNote, WINDOW_NOTE } = await import("../../lib/lido/words.ts");
  const changed = lidoStake(read({ windowState: "changed" }));
  const [shares, earned] = readoutTable(changed, read().then.time).groups[0].rows;
  assert.equal(shares.note, causeNote(changed.cause));
  assert.match(shares.note, /^802\.3 to 2 requests, \+812\.3 by transfer$/);
  assert.equal(earned.note, WINDOW_NOTE.changed);
  const same = readoutTable(lidoStake(read(SAME)), read().then.time).groups[0].rows;
  assert.equal(same[0].note, undefined);
  assert.equal(same[1].note, undefined);
  for (const n of [shares.note, earned.note]) {
    assert.ok(n.split(" ").length <= 8, n);
    assert.doesNotMatch(n, /\.$|^[A-Z]/);
  }
});

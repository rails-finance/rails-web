// The wallet page's Liquity V1 Troves and Stability Pool deposits (rails-ops
// ui-jobs 794): the listing rows shaped into summary rows, each routed to its
// module by kind, and the Liquity sections' bands and figures with a deposit
// as its own leg. The modules import through `@/`, resolved here as
// wallet-sections.test.mjs does. Run: npm test
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
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith("file:")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = new URL(specifier + ext, context.parentURL).href;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const rows = await import("../../lib/wallet/listing-summary-rows.ts");
const { kindOfRow } = await import("../../lib/wallet/wallet-filters.ts");
const { takesRow } = await import("../../lib/wallet/families/module.ts");
const { walletSections, walletTotal } = await import("../../lib/wallet/wallet-sections.ts");

const W = "0x2291f52bddc937b5b840d15e551e1da8c80c2b3c";
const E18 = "000000000000000000";
const v1Trove = (epoch, status, extra = {}) => ({
  wallet: W,
  epoch,
  status,
  collateral: status === "open" ? 4 : 0,
  debt: status === "open" ? 2000 : 0,
  collateralRaw: "0",
  debtRaw: "0",
  peakCollateral: 10,
  peakDebt: 5000,
  lastActivityAt: 1725440591,
  lastBlockNumber: 20676195,
  txCount: 5,
  liquidationCount: status === "liquidated" ? 1 : 0,
  redemptionCount: 0,
  closedByRedemption: false,
  ...extra,
});
const deposit = (status, amount, branch) => ({
  ...(branch ? { collateral_type: branch } : {}),
  depositor: W,
  status,
  deposit_raw: status === "open" ? `${amount}${E18}` : "0",
  deposited_raw: `${amount}${E18}`,
  first_timestamp: "1632167941",
  last_timestamp: "1717148015",
  last_block: "19988946",
  tx_count: 3,
});

test("a V1 Trove life a redemption ended reads as redeemed, at its page", () => {
  const r = rows.liquityV1TroveSummaryRow(v1Trove(3, "closed", { closedByRedemption: true }), W);
  assert.equal(r.family, "liquity-v1");
  assert.equal(r.status, "redeemed");
  assert.equal(r.positionId, `${W}-3`);
  assert.equal(r.href, `/ethereum/liquity-v1/${W}?epoch=3`);
  assert.equal(r.closedAt, 1725440591);
  assert.equal(r.kind, undefined);
});

test("a deposit row carries its kind and its page; an open one has no close", () => {
  const v1 = rows.liquityV1DepositSummaryRow(deposit("open", 1000), W);
  assert.equal(v1.kind, "deposits");
  assert.equal(v1.href, `/ethereum/liquity-v1/stability-pool/${W}`);
  assert.equal(v1.closedAt, null);
  const v2 = rows.liquityV2DepositSummaryRow(deposit("closed", 50, "rETH"), W);
  assert.equal(v2.family, "liquity-v2");
  assert.equal(v2.positionId, `rETH:${W}`);
  assert.equal(v2.href, `/ethereum/liquity-v2/stability-pool/rETH/${W}`);
  assert.equal(v2.closedAt, 1717148015);
});

test("each row goes to one module: the Troves' or the deposits'", () => {
  const troveModule = { summaryChain: "ethereum", summaryFamily: "liquity-v2" };
  const depositModule = { ...troveModule, summaryKind: "deposits" };
  const serverTrove = { chain: "ethereum", family: "liquity-v2", status: "open", debt: { amount: "5" } };
  const dep = rows.liquityV2DepositSummaryRow(deposit("open", 300, "WETH"), W);
  assert.equal(takesRow(troveModule, serverTrove), true);
  assert.equal(takesRow(depositModule, serverTrove), false);
  assert.equal(takesRow(troveModule, dep), false);
  assert.equal(takesRow(depositModule, dep), true);
  // A Trove owing debt is a Trove, not a loan.
  assert.equal(kindOfRow(serverTrove), "troves");
  assert.equal(kindOfRow(dep), "deposits");
});

let n = 0;
const pos = (family, card, extra = {}) => ({
  chain: 1,
  family,
  familyName: family,
  positionId: `p${++n}`,
  href: "/x",
  status: card.row.status === "open" ? "open" : "closed",
  card,
  headRead: card.row.status === "open" ? "read" : "none",
  usdOwnOracle: true,
  ...extra,
});

test("Liquity V1: the listing's band, a deposit its own leg; the figures sum the cards", () => {
  const [s] = walletSections(
    [
      pos("liquity-v1", { kind: "liquity-v1", row: v1Trove(2, "open") }, { collateralUsd: 12000, debtUsd: 2000 }),
      pos("liquity-v1", { kind: "liquity-v1", row: v1Trove(1, "liquidated") }),
      pos(
        "liquity-v1",
        { kind: "liquity-v1-deposit", row: deposit("open", 5000) },
        { kind: "deposits", collateralUsd: 5000, debtUsd: 0 },
      ),
    ],
    { bands: true },
  );
  assert.equal(s.slug, "liquity-v1");
  assert.deepEqual(
    s.band.legs.map((l) => l.id),
    ["collateral", "debt", "deposit"],
  );
  assert.equal(s.band.countsLine, "");
  assert.equal(s.collateral.usd, 17000);
  assert.equal(s.debt.usd, 2000);
  assert.deepEqual(
    s.collateral.prov.inputs.slice(0, 2).map((r) => r.label.split(" ").at(-1)),
    ["collateral", "deposit"],
  );
});

test("Liquity V2 deposits alone: a BOLD leg, the deposits as the figure, no debt", () => {
  const [s] = walletSections(
    [
      pos(
        "liquity-v2",
        { kind: "liquity-v2-deposit", row: deposit("open", 300, "WETH") },
        { kind: "deposits", collateralUsd: 300, debtUsd: 0 },
      ),
      pos("liquity-v2", { kind: "liquity-v2-deposit", row: deposit("closed", 20, "rETH") }, { kind: "deposits" }),
    ],
    { bands: true },
  );
  assert.deepEqual(
    s.band.legs.map((l) => l.id),
    ["deposit"],
  );
  assert.equal(s.collateral.usd, 300);
  assert.equal(s.debt.usd, 0);
});

test("Liquity V2 Troves and a deposit: the Troves' collateral plus the deposit", () => {
  const prices = { weth: 3000, wsteth: 3600, reth: 3400 };
  const trove = {
    id: "1",
    collateralType: "WETH",
    status: "open",
    collateral: { amount: 2 },
    debt: { current: 1000 },
  };
  const [s] = walletSections(
    [
      pos("liquity-v2", { kind: "liquity-v2", row: trove, prices }, { collateralUsd: 6000, debtUsd: 1000 }),
      pos(
        "liquity-v2",
        { kind: "liquity-v2-deposit", row: deposit("open", 300, "WETH") },
        { kind: "deposits", collateralUsd: 300, debtUsd: 0 },
      ),
    ],
    { bands: true },
  );
  assert.ok(s.band.legs.some((l) => l.id === "deposit"));
  assert.equal(s.collateral.usd, 6300);
  assert.equal(s.debt.usd, 1000);
});

test("a listing read that did not answer: no section total, no wallet total, said once each", () => {
  const prices = { weth: 3000, wsteth: 3600, reth: 3400 };
  const trove = { id: "1", collateralType: "WETH", status: "open", collateral: { amount: 2 }, debt: { current: 1000 } };
  const unanswered = [{ family: "liquity-v2", what: "Liquity V2 Stability Pool deposits" }];
  const sections = walletSections(
    [
      pos("liquity-v2", { kind: "liquity-v2", row: trove, prices }, { collateralUsd: 6000, debtUsd: 1000 }),
      pos("aave-v3", { kind: "aave-v3", row: { status: "open" } }, { collateralUsd: 50, debtUsd: 10, buffer: 0.5 }),
    ],
    { bands: true, unanswered },
  );
  const v2 = sections.find((x) => x.slug === "liquity-v2");
  assert.equal(v2.collateral, undefined);
  assert.equal(v2.debt, undefined);
  assert.deepEqual(v2.band.legs, []);
  assert.equal(v2.band.note, "Liquity V2 Stability Pool deposits could not be read, so the section states no total.");
  // The Aave section keeps its own figure.
  assert.equal(sections.find((x) => x.slug === "aave-v3").collateral.usd, 50);
  const total = walletTotal(sections, "collateral", ["Liquity V2 Stability Pool deposits"]);
  assert.equal(total.figure, undefined);
  assert.equal(total.gap, "No wallet total: Liquity V2 Stability Pool deposits could not be read");
});

test("a failed read of a protocol with no section still leaves no wallet total", () => {
  const sections = walletSections(
    [pos("aave-v3", { kind: "aave-v3", row: { status: "open" } }, { collateralUsd: 50, debtUsd: 10, buffer: 0.5 })],
    { bands: true, unanswered: [{ family: "liquity-v1", what: "Liquity V1 Troves" }] },
  );
  assert.equal(sections[0].collateral.usd, 50);
  const total = walletTotal(sections, "debt", ["Liquity V1 Troves"]);
  assert.equal(total.figure, undefined);
  assert.equal(total.gap, "No wallet total: Liquity V1 Troves could not be read");
});

test("receipts name each row's source: a deposit at $1 face is state, not oracle", () => {
  const [s] = walletSections(
    [
      pos(
        "liquity-v2",
        { kind: "liquity-v2-deposit", row: deposit("open", 300, "WETH") },
        { kind: "deposits", collateralUsd: 300, debtUsd: 0, usdClass: "state", usdSource: "BOLD's $1 face" },
      ),
    ],
    { bands: true },
  );
  assert.equal(s.collateral.prov.pclass, undefined);
  assert.equal(s.collateral.prov.inputs[0].pclass, "state");
  assert.equal(
    s.collateral.prov.summary,
    "The wallet's Liquity V2 deposits in USD — its open deposit's dollars, at the source named on its row, to the cent.",
  );
  const total = walletTotal([s], "collateral");
  assert.equal(total.figure.prov.pclass, undefined);
  assert.match(total.figure.prov.summary, /each at the sources its receipt names/);
});

const { depositClaim } = await import("../../lib/wallet/deposit-claim.ts");
const v1math = await import("../../lib/liquity-v1/sp-math.ts");
const v2math = await import("../../lib/liquity-v2/sp-math.ts");

test("V1 full claim: the deposit at $1 face plus the ETH owed at the PriceFeed; LQTY not valued", () => {
  const c = depositClaim({
    deposit: 1000,
    symbol: "LUSD",
    gain: 0.5,
    gainSymbol: "ETH",
    price: 3000,
    feed: "the Liquity V1 PriceFeed",
    unvalued: { symbol: "LQTY", amount: 12 },
  });
  assert.equal(c.usd, 2500);
  assert.deepEqual(
    c.parts.map((x) => [x.label, x.usd, x.pclass, x.source]),
    [
      ["deposit", 1000, "state", "LUSD's $1 face"],
      ["ETH gain", 1500, "oracle", "the Liquity V1 PriceFeed"],
      ["LQTY", null, undefined, "not valued"],
    ],
  );
});

test("no LQTY owed: no LQTY leg", () => {
  const c = depositClaim({
    deposit: 10,
    symbol: "LUSD",
    gain: 0,
    gainSymbol: "ETH",
    price: 3000,
    feed: "f",
    unvalued: { symbol: "LQTY", amount: 0 },
  });
  assert.deepEqual(
    c.parts.map((x) => x.label),
    ["deposit", "ETH gain"],
  );
});

test("V2 full claim: the deposit plus the branch collateral owed at the branch price", () => {
  const c = depositClaim({
    deposit: 300,
    symbol: "BOLD",
    gain: 0.1,
    gainSymbol: "WETH",
    price: 3000,
    feed: "the Liquity V2 price feed",
  });
  assert.equal(c.usd, 600);
  assert.equal(c.parts.length, 2);
});

test("a gain with no price states no claim: the head read fails (rule 743)", () => {
  const args = { deposit: 300, symbol: "BOLD", gain: 0.1, gainSymbol: "WETH", feed: "f" };
  assert.equal(depositClaim({ ...args, price: null }), null);
  // No gain owed: the deposit alone is the whole claim.
  assert.equal(depositClaim({ ...args, gain: 0, price: null }).usd, 300);
  // A failed head read leaves the section without a total.
  const [s] = walletSections(
    [
      pos(
        "liquity-v1",
        { kind: "liquity-v1-deposit", row: deposit("open", 5000) },
        { kind: "deposits", headRead: "failed" },
      ),
    ],
    { bands: true },
  );
  assert.equal(s.collateral, undefined);
  assert.match(s.band.note, /not read at the chain head/);
});

test("the section receipt carries each leg of a claim; the band's leg is the head deposit, no ≈", () => {
  const head = {
    compoundedRaw: `4900${E18}`,
    recordedRaw: `5000${E18}`,
    frontEnd: "0x0",
    ethGainRaw: "0",
    lqtyGainRaw: "0",
  };
  const [s] = walletSections(
    [
      pos(
        "liquity-v1",
        { kind: "liquity-v1-deposit", row: deposit("open", 5000), head },
        {
          kind: "deposits",
          collateralUsd: 7900,
          debtUsd: 0,
          readAtBlock: 26462239,
          usdParts: [
            { label: "deposit", usd: 4900, pclass: "state", source: "LUSD's $1 face" },
            { label: "ETH gain", usd: 3000, pclass: "oracle", source: "the Liquity V1 PriceFeed" },
            { label: "LQTY", usd: null, source: "not valued" },
          ],
        },
      ),
    ],
    { bands: true },
  );
  assert.equal(s.collateral.usd, 7900);
  assert.equal(s.collateral.prov.pclass, undefined);
  assert.deepEqual(
    s.collateral.prov.inputs.map((r) => [r.label.replace(/^p\d+ /, ""), r.value, r.pclass]),
    [
      ["deposit", "$4,900.00", "state"],
      ["ETH gain", "$3,000.00", "oracle"],
      ["LQTY", "not valued", undefined],
      ["sum", "$7,900.00", undefined],
    ],
  );
  const leg = s.band.legs.find((l) => l.id === "deposit");
  assert.equal(leg.approx, false);
  assert.equal(leg.figure.amount, 4900);
  assert.match(leg.prov.summary, /getCompoundedLUSDDeposit read at block 26,462,239/);
});

test("the wallet card's Deposit headline: the head read where handed, the last touch otherwise", () => {
  const chain = {
    compoundedRaw: `4900${E18}`,
    recordedRaw: `5000${E18}`,
    frontEnd: "0x0",
    ethGainRaw: "7",
    lqtyGainRaw: "0",
  };
  const head = v1math.listingDeposit(`5000${E18}`, v1math.depositNowFromChain(chain));
  assert.deepEqual(head, { raw: BigInt(`4900${E18}`), approx: false, at: "head" });
  assert.deepEqual(v1math.listingDeposit(`5000${E18}`, null), {
    raw: BigInt(`5000${E18}`),
    approx: true,
    at: "last-touch",
  });
  const v2 = {
    compoundedRaw: `290${E18}`,
    recordedRaw: `300${E18}`,
    collGainRaw: "1",
    stashRaw: "2",
    yieldGainRaw: "0",
  };
  const now2 = v2math.depositNowFromChain(v2);
  assert.equal(now2.pendingColl, BigInt(3));
  assert.equal(v2math.listingDeposit(`300${E18}`, now2).at, "head");
  assert.equal(v2math.listingDeposit(`300${E18}`, undefined).approx, true);
});

const { isDust } = await import("../../lib/wallet/wallet-sections.ts");

test("an LQTY stake: no dust floor, its receipt label drops the stake: prefix, its band leg is stakes() at head", () => {
  const staker = "0x6bcde33a5cb39ebcbdce2702120c29672eb62b2e";
  const stakeRow = { staker, status: "open", stake_raw: `100000${E18}` };
  const p = {
    chain: 1,
    family: "liquity-v1",
    familyName: "Liquity V1",
    market: "Staking",
    positionId: `stake:${staker}`,
    href: "/x",
    status: "open",
    kind: "stakes",
    card: { kind: "liquity-v1-stake", row: stakeRow, head: { stakeRaw: `100001${E18}` } },
    headRead: "read",
    usdOwnOracle: true,
    collateralUsd: 3,
    debtUsd: 0,
    readAtBlock: 26463047,
    usdParts: [
      { label: "LUSD fees", usd: 3, pclass: "state", source: "LUSD's $1 face" },
      { label: "LQTY", usd: null, source: "not valued" },
    ],
  };
  assert.equal(isDust(p), false);
  const [s] = walletSections([p], { bands: true });
  assert.equal(s.dust, 0);
  assert.equal(s.collateral.prov.inputs[0].label, "Staking · 0x6bcde3 LUSD fees");
  const leg = s.band.legs.find((l) => l.id === "stake");
  assert.equal(leg.figure.amount, 100001);
  assert.match(leg.prov.summary, /stakes\(staker\) read at block 26,463,047/);
});

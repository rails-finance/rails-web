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
const { walletSections } = await import("../../lib/wallet/wallet-sections.ts");

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

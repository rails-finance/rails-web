// The trail's counts (H13.4; rails-ops ui-jobs 856): lib/wallet/trail-counts.ts, the one rule
// the /summary route and the wallet view's trail count by, and the `?vault=` view's undrawn
// shares and its line where it draws none.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { summaryPositions, countsOf, vaultUndrawn, noneDrawnLine } = await import("../../lib/wallet/trail-counts.ts");

const W = "0x3df83ec9d2b62bb9bb83eba1218a202564bb67da";
const COMET_A = "0x9c4ec768c28520b50860ea7a15bd7213a9ff58bf";
const COMET_B = "0xa5edbdd9646f8dff606d7448e414884c7d905dca";

const row = (chain, family, positionId, status = "open", extra = {}) => ({
  chain,
  family,
  positionId,
  status,
  href: `/${chain}/${family}/${positionId}`,
  ...extra,
});
const takes = (f, r) => r.chain === f.summaryChain && r.family === f.summaryFamily;
// A counted row as it counts one position; Sepolia's rows leave the counts.
const rowPosition = (r) =>
  r.chain === "sepolia"
    ? null
    : { chain: r.chain, family: r.family, positionId: r.positionId, status: r.status, href: r.href };

// Arbitrum Compound V3: one stored row per wallet, shaped one position per Comet held.
const compoundArbitrum = {
  summaryChain: "arbitrum",
  summaryFamily: "compound-v3",
  shape: async (rows) =>
    rows.flatMap((r) =>
      r.comets.map((c, i) => ({
        positionId: `${c}:${W}`,
        status: "open",
        href: `/arbitrum/compound-v3/${i === 0 ? "usdc" : "weth"}/${W}`,
        market: i === 0 ? "cUSDCv3" : "cWETHv3",
      })),
    ),
};
// A stored family whose shape is one position per row.
const stored = {
  summaryChain: "base",
  summaryFamily: "euler-v2",
  shape: async (rows) =>
    rows.map((r) => ({ positionId: r.positionId, status: r.status, href: r.href, market: "USDC" })),
};
// A family read at the head: its rows count one each, never shaped.
const headed = {
  head: () => {},
  summaryChain: "ethereum",
  summaryFamily: "aave-v3",
  shape: async () => {
    throw new Error("a head family is not shaped");
  },
};

test("an Arbitrum Compound V3 row counts one position per Comet", async () => {
  const rows = [{ ...row("arbitrum", "compound-v3", W), comets: [COMET_A, COMET_B] }];
  const p = await summaryPositions([compoundArbitrum], rows, takes, rowPosition);
  assert.deepEqual(
    p.map((x) => [x.chain, x.family, x.positionId, x.market]),
    [
      ["arbitrum", "compound-v3", `${COMET_A}:${W}`, "cUSDCv3"],
      ["arbitrum", "compound-v3", `${COMET_B}:${W}`, "cWETHv3"],
    ],
  );
  assert.equal(countsOf(p).total, 2);
});

test("a stored family passes through its shape, one position a row, with its market", async () => {
  const rows = [row("base", "euler-v2", `${W}-1`), row("base", "euler-v2", `${W}-2`, "closed")];
  const p = await summaryPositions([stored], rows, takes, rowPosition);
  assert.deepEqual(
    p.map((x) => [x.positionId, x.status, x.market]),
    [
      [`${W}-1`, "open", "USDC"],
      [`${W}-2`, "closed", "USDC"],
    ],
  );
});

test("a head family's rows, and rows no family takes, count one each unshaped", async () => {
  const rows = [row("ethereum", "aave-v3", `${W}:core`), row("ethereum", "liquity-v2", "31245")];
  const p = await summaryPositions([headed], rows, takes, rowPosition);
  assert.deepEqual(
    p.map((x) => x.positionId),
    [`${W}:core`, "31245"],
  );
  assert.equal(p[0].market, undefined);
});

test("a shape that throws leaves its rows to count one each; a Sepolia row is not counted", async () => {
  const broken = { ...stored, shape: async () => Promise.reject(new Error("down")) };
  const sepolia = { ...stored, summaryChain: "sepolia", summaryFamily: "polaris" };
  const rows = [row("base", "euler-v2", `${W}-1`), row("sepolia", "polaris", "20")];
  const p = await summaryPositions([broken, sepolia], rows, takes, rowPosition);
  assert.deepEqual(
    p.map((x) => [x.chain, x.positionId]),
    [["base", `${W}-1`]],
  );
});

test("the counts: by chain and family; closed takes closed, liquidated and redeemed; moved apart", () => {
  const c = countsOf([
    row("ethereum", "aave-v3", "1"),
    row("ethereum", "aave-v3", "2", "liquidated"),
    row("base", "aave-v3", "3", "moved"),
    row("ethereum", "liquity-v2", "4", "redeemed"),
  ]);
  assert.deepEqual([c.total, c.open, c.closed, c.moved], [4, 1, 2, 1]);
  assert.deepEqual(c.chains, ["ethereum", "base"]);
  assert.deepEqual(
    c.families.map((f) => [f.chain, f.family, f.positions, f.open, f.closed, f.moved]),
    [
      ["ethereum", "aave-v3", 2, 1, 1, 0],
      ["base", "aave-v3", 1, 0, 0, 1],
      ["ethereum", "liquity-v2", 1, 0, 1, 0],
    ],
  );
});

test("a vault protocol's undrawn shares: those not drawn, by chain and status", () => {
  const ids = { ethereum: 1, base: 8453 };
  const shares = [
    row("ethereum", "vaults", "v1"),
    row("ethereum", "vaults", "v2", "closed"),
    row("ethereum", "vaults", "v3"),
    row("base", "vaults", "v4"),
    row("optimism", "vaults", "v5"),
  ];
  const u = vaultUndrawn(shares, new Set(["ethereum:v1"]), (slug) => ids[slug]);
  assert.deepEqual(u, [
    { family: "vaults", open: 1, closed: 1, chain: 1 },
    { family: "vaults", open: 1, closed: 0, chain: 8453 },
  ]);
  // Every share drawn: nothing undrawn.
  assert.deepEqual(
    vaultUndrawn(shares.slice(0, 1), new Set(["ethereum:v1"]), (s) => ids[s]),
    [],
  );
});

test("the line where a vault view draws none of the shares it counts", () => {
  assert.equal(
    noneDrawnLine(1180, "MetaMorpho vaults"),
    "Rails holds 1,180 holdings in MetaMorpho vaults for this wallet, and draws none of them here.",
  );
  assert.equal(
    noneDrawnLine(1, "Yearn V3", "open"),
    "Rails holds 1 open holding in Yearn V3 for this wallet, and draws none of it here.",
  );
});

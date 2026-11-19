// verify-usd-display — the timeline's USD rule (lib/shared/usd-display.ts): a
// USD value shows beside every amount the timeline prices, stablecoins
// included, and only an amount with no price shows none. A dollar stablecoin
// off par at the event states its price beside the figure, and one more than
// DEPEG_BAND off $1 takes the caution band (ui-jobs 283). A ledger restated
// at today's price keeps its flows and moves the difference to Market move.
// ----------------------------------------------------------------------------
// OFFLINE.
//
//   npx tsx --test scripts/verify/verify-usd-display.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEPEG_BAND, isDollarStable, offPar, todayPriceText, usdShown } from "@/lib/shared/usd-display";
import { ledgerAtPrice, type Ledger } from "@/lib/shared/event-ledger";

test("a priced stablecoin shows its USD at par", () => {
  assert.equal(usdShown(11_826), true, "11,829 USDT at $0.9997");
  assert.equal(usdShown(1_000), true, "1,000 USDC at $1");
  assert.equal(usdShown(100), true, "100 DAI");
});

test("a priced stablecoin shows its USD off par", () => {
  assert.equal(usdShown(870), true, "USDC at $0.87");
  assert.equal(usdShown(1_137), true, "a euro stable");
});

test("any other priced token shows its USD", () => {
  assert.equal(usdShown(3_900), true, "WETH");
  assert.equal(usdShown(60_000), true, "WBTC");
  assert.equal(usdShown(1_070), true, "a dollar share above $1.01");
});

test("an amount with no price shows none", () => {
  assert.equal(usdShown(null), false);
  assert.equal(usdShown(undefined), false);
  assert.equal(usdShown(Number.NaN), false);
});

test("DEPEG_BAND stays exported at 1%", () => {
  assert.equal(DEPEG_BAND, 0.01);
});

test("a dollar stablecoin beyond the band states its price and takes the band", () => {
  assert.deepEqual(offPar(0.987, "USDC"), { text: "at $0.987", band: true });
  assert.deepEqual(offPar(1.012, "DAI"), { text: "at $1.012", band: true });
  assert.deepEqual(offPar(0.85, "BOLD"), { text: "at $0.850", band: true });
});

test("a dollar stablecoin off par inside the band states its price with no band", () => {
  assert.deepEqual(offPar(0.995, "USDC"), { text: "at $0.995", band: false });
  assert.deepEqual(offPar(1.004, "USDT"), { text: "at $1.004", band: false });
  assert.deepEqual(offPar(0.99, "USDC"), { text: "at $0.990", band: false }, "1% is the band's edge");
});

test("a dollar stablecoin that reads $1.000 is at par: no price, no band", () => {
  assert.equal(offPar(0.9997, "USDT"), null);
  assert.equal(offPar(1, "USDC"), null);
  assert.equal(offPar(1.0004, "GHO"), null);
});

test("no band and no price for any other token, or no price", () => {
  assert.equal(offPar(4_490, "WETH"), null);
  assert.equal(offPar(1.08, "EURC"), null, "a euro stable");
  assert.equal(offPar(1.17, "sUSDe"), null, "a dollar share");
  assert.equal(offPar(0.95, "PT-sUSDE-7MAY2026"), null, "a principal token");
  assert.equal(offPar(null, "USDC"), null);
  assert.equal(offPar(0.98, null), null);
});

test("the dollar stablecoins", () => {
  for (const s of ["USDC", "USDT", "DAI", "GHO", "LUSD", "BOLD", "crvUSD", "ebUSD", "USDaf", "BD"])
    assert.equal(isDollarStable(s), true, s);
  for (const s of ["EURC", "sDAI", "sUSDS", "stcUSD", "scrvUSD", "ysyBOLD", "syrupUSDC", "PT-USDe-7MAY2026", "WETH"])
    assert.equal(isDollarStable(s), false, s);
});

test("today's price line uses the latest block's wording", () => {
  assert.equal(todayPriceText(2_713, "WETH"), "At the latest block\u2019s price, $2,713.00 per WETH");
});

test("a ledger at today's price: flows keep their dollars, Market move takes the rest", () => {
  const l: Ledger = {
    side: "collateral",
    symbol: "WETH",
    decimals: 2,
    rows: [
      {
        key: "dep",
        line: "dep",
        label: "Deposited",
        role: "flow",
        seg: null,
        tokens: { units: 1_000, text: "10.00" },
        usd: { dollars: 30_000, text: "$30,000" },
      },
      {
        key: "m",
        line: "m",
        label: "Market move",
        role: "market",
        seg: null,
        tokens: null,
        usd: { dollars: 14_900, text: "$14,900" },
      },
    ],
    tokens: { before: null, after: "10.00", units: 1_000 },
    usd: { before: null, after: "$44,900", dollars: 44_900 },
    price: 4_490,
  };
  const t = ledgerAtPrice(l, 2_713)!;
  assert.equal(t.usd?.dollars, 27_130);
  assert.equal(t.usd?.after, "$27,130");
  assert.equal(t.rows[0].usd?.dollars, 30_000, "the deposit keeps its block's dollars");
  assert.equal(t.rows.find((r) => r.role === "market")?.usd?.dollars, -2_870);
  assert.equal(
    t.rows.reduce((a, r) => a + (r.usd?.dollars ?? 0), 0),
    27_130,
    "the rows add to the total",
  );
  assert.equal(ledgerAtPrice({ ...l, tokens: null }, 2_713), null, "a ledger in dollars stays");
});

test("a ledger at today's price states the before where the event moved it", () => {
  const l: Ledger = {
    side: "collateral",
    symbol: "WETH",
    decimals: 2,
    rows: [
      {
        key: "dep",
        line: "dep",
        label: "Deposited before",
        role: "before",
        seg: null,
        tokens: { units: 1_000, text: "10.00" },
        usd: { dollars: 30_000, text: "$30,000" },
      },
      {
        key: "dep#event",
        line: "dep",
        label: "This deposit",
        role: "event",
        seg: null,
        tokens: { units: 500, text: "5.00" },
        usd: { dollars: 20_000, text: "$20,000" },
      },
    ],
    tokens: { before: "10.00", after: "15.00", units: 1_500 },
    usd: { before: "$40,000", after: "$60,000", dollars: 60_000 },
  };
  const t = ledgerAtPrice(l, 2_000)!;
  assert.equal(t.usd?.before, "$20,000");
  assert.equal(t.usd?.after, "$30,000");
});

// A group's sheet sums its members' cents (ui-jobs 743): the summed row is the
// cents of its members' rows, never their faces; a member with no cents leaves
// the group's row with no dollars.
test("a group's dollar row is the sum of its members' cents", async () => {
  const { mergeGroupSheet } = await import("@/components/shared/group-sheet");
  const side = (cents: number | undefined, text: string) => ({
    side: "collateral" as const,
    icons: ["WETH"],
    carry: [],
    rows: [
      {
        key: "event",
        label: "Supply",
        amount: { text: "1", symbol: "WETH", value: "1" },
        usd: { text, ...(cents != null ? { cents } : {}) },
      },
    ],
    total: { text: "$0" },
  });
  const card = (id: string, cents: number | undefined, text: string) => ({
    id,
    timestamp: 0,
    sheet: { sides: [side(cents, text)], panels: [] },
  });
  // Two faces of $2 whose cents are $1.49 and $1.49: the group states $2.98, not $4.
  const g = mergeGroupSheet([card("a", 1.49, "$1.49"), card("b", 1.49, "$1.49")] as never, "Supply")!;
  const row = g.sides[0].rows.find((r) => r.usd)!;
  assert.equal(row.usd!.cents, 2.98);
  assert.equal(row.usd!.text, "$2.98");
  const big = mergeGroupSheet([card("a", 12.49, "$12"), card("b", 12.49, "$12")] as never, "Supply")!;
  assert.equal(big.sides[0].rows.find((r) => r.usd)!.usd!.cents, 24.98);
  // A member with no cents: the group's row draws "—", never a partial sum.
  const mixed = mergeGroupSheet([card("a", 1.49, "$1.49"), card("b", undefined, "$1.49")] as never, "Supply")!;
  const mixedRow = mixed.sides[0].rows.find((r) => r.key.startsWith("group"))!;
  assert.equal(mixedRow.usd?.text, "—");
  assert.equal(mixedRow.usd?.cents, undefined);
  // Three members whose middle one's Market move has no price: the group's
  // Market move draws "—" (ui-jobs 743, A1).
  const member = (id: string, market: object) => ({
    id,
    timestamp: 0,
    sheet: {
      sides: [
        {
          side: "collateral" as const,
          icons: ["ETH"],
          carry: [{ key: "market", label: "Market move", usd: market }],
          rows: [],
          total: { text: "$1", cents: 1 },
        },
      ],
      panels: [],
    },
  });
  const priced = (cents: number) => ({ text: `+$${cents}`, cents, info: { kind: "derived", summary: "s" } });
  const three = mergeGroupSheet(
    [
      member("a", priced(5)),
      member("b", {
        text: "—",
        info: { kind: "derived", summary: "No dollar figure: ETH has no price at this block." },
      }),
      member("c", priced(7)),
    ] as never,
    "Move",
  )!;
  const mv = three.sides[0].rows.find((r) => r.key === "group-market")!;
  assert.equal(mv.usd?.text, "—", "an unpriced member blocks the group's figure");
  assert.equal(mv.usd?.cents, undefined);
});

// Every family's sheet cells carry their rows' cents (ui-jobs 743), so a
// group's dollar row sums cents for each: the $1-face debts (Liquity, forks,
// V1, Maker, f(x), Sky, Alchemix's alUSD), the shown products at a price
// named with its block (fork and V1 collateral, gas escrow), and figures
// already in cents (Liquity V2's collateral, Maker, Polaris, f(x)).
test("each family's cells carry cents, and a group sums them", async () => {
  const { mergeGroupSheet } = await import("@/components/shared/group-sheet");
  const { faceParts, centsParts, priceCell } = await import("@/lib/shared/sheet-usd-rows");
  const { shownUsd } = await import("@/lib/shared/shown-usd");
  const { readFileSync } = await import("node:fs");
  const kinds = {
    face: (x: number) => ({ ...faceParts(x), info: { kind: "derived" as const, summary: "s" } }),
    cents: (x: number) => ({ ...centsParts(x), info: { kind: "derived" as const, summary: "s" } }),
    priced: (x: number) =>
      priceCell(
        "Collateral",
        { symbol: "ETH", amount: x, price: 3456.789012, block: 1, priceNote: "n" },
        { amountNote: "a", via: "v" },
      ),
  };
  const sheetOf = (usd: object) => ({
    sides: [
      {
        side: "collateral" as const,
        icons: ["ETH"],
        carry: [],
        rows: [{ key: "event", label: "Move", amount: { text: "1", symbol: "ETH", value: "1" }, usd }],
        total: { text: "$0" },
      },
    ],
    panels: [],
  });
  for (const [kind, cell] of Object.entries(kinds)) {
    const a = cell(1.2345678);
    const b = cell(12.4999999);
    const g = mergeGroupSheet(
      [
        { id: "a", timestamp: 0, sheet: sheetOf(a) },
        { id: "b", timestamp: 0, sheet: sheetOf(b) },
      ] as never,
      "Move",
    )!;
    const row = g.sides[0].rows.find((r) => r.usd)!;
    assert.equal(row.usd!.cents, Math.round((a.cents! + b.cents!) * 100) / 100, `${kind}: the members' cents`);
  }
  assert.equal(kinds.face(12.4999999).cents, shownUsd(12.4999999, 1));
  // No sheet cell in these families prints a dollar figure without its cents.
  for (const f of [
    "components/protocol/liquity/liquity-cells.tsx",
    "components/protocol/liquity-fork/liquity-fork-sheet.tsx",
    "components/protocol/liquity-v1/liquity-v1-sheet.tsx",
    "components/protocol/liquity/delegate-run-sheet.tsx",
    "components/protocol/sky-savings/sky-savings-sheet.tsx",
    "components/protocol/alchemix/alchemix-event-sheet.ts",
    "components/protocol/fx/fx-sheet.tsx",
    "components/protocol/polaris/polaris-sheet.ts",
    "components/protocol/polaris/polaris-sp-loan-sheet.ts",
    "components/protocol/polaris/polaris-since-last-touch.tsx",
    "components/protocol/llamalend/llamalend-sheet.tsx",
  ]) {
    const src = readFileSync(f, "utf8");
    // `text: sheetUsd(…)`, and `text: cond ? sheetUsd(…) : …` too.
    const bare = [...src.matchAll(/text: [^\n]*?\bsheetUsd\([^\n]*\n?[^\n]*/g)].filter((m) => !/cents/.test(m[0]));
    assert.deepEqual(
      bare.map((m) => m[0].split("\n")[0].trim()),
      [],
      `${f}: a dollar cell without cents`,
    );
  }
});

// An Aave group whose middle member's account was not read: its Market move
// draws "—", so the group's does (ui-jobs 743, R3).
test("an Aave group with an unread middle member draws no Market move sum", async () => {
  const { mergeGroupSheet } = await import("@/components/shared/group-sheet");
  const { aaveFamilySheet } = await import("@/components/protocol/aave-v3/aave-family-sheet");
  const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  const leg = (before: string, after: string) => ({
    before,
    after,
    scaledBefore: before,
    scaledAfter: after,
    index: "1000000000000000000000000000",
  });
  const acct = (coll: string) => ({
    totalCollateralBase: coll,
    totalDebtBase: "0",
    ltvBps: 8000,
    liquidationThresholdBps: 8250,
    healthFactor: null,
  });
  const state = (i: number, price: string, read: boolean) => ({
    wallet: "0x1",
    market: "Core",
    marketKey: "core",
    block: 100 + i,
    txHash: `0x${i}`,
    txIndex: 0,
    blockTimestamp: 1_700_000_000 + i * 86_400,
    complete: read,
    reserves: [
      {
        reserve: WETH,
        symbol: "WETH",
        decimals: 18,
        supply: leg("1000000000000000000", "1000000000000000000"),
        debt: leg("0", "0"),
        collateral: { before: true, after: true },
        priceBase: price,
        ltvBps: 8000,
        liquidationThresholdBps: 8250,
        inEmode: false,
      },
    ],
    emode: null,
    account: read ? { before: acct(price), after: acct(price) } : null,
    sources: {
      balances: "chain-read-at-block",
      settings: null,
      market: "chain-read-at-block",
      marketReadBlock: 100 + i,
      poolRevision: null,
    },
    notes: [],
  });
  const s0 = state(0, "300000000000", true);
  const s1 = state(1, "310000000000", true);
  const s2 = state(2, "320000000000", false);
  const s3 = state(3, "330000000000", true);
  const sheet = (st: unknown, prev: unknown) =>
    aaveFamilySheet({ state: st as never, prev: prev as never, coords: {} as never, label: "Supply" });
  const cards = [
    { id: "a", timestamp: 1, sheet: sheet(s1, s0) },
    { id: "b", timestamp: 2, sheet: sheet(s2, s1) },
    { id: "c", timestamp: 3, sheet: sheet(s3, s2) },
  ];
  // Read, unread, read: the middle member's account is the unread one.
  const middle = cards[1].sheet.sides[0].carry.find((r) => r.key === "market");
  assert.equal(middle?.usd?.text, "—", "the unread member's Market move draws —");
  const g = mergeGroupSheet(cards as never, "Supply");
  assert.ok(g, "the group reads as one");
  const mv = g!.sides[0].rows.find((r) => r.key === "group-market");
  assert.equal(mv?.usd?.text, "—", "the group's Market move draws —");
});

// The asset page's uses line (A1.8, ui-jobs 490): Pendle's roster names a
// market's yield token and the asset it accounts in, so BOLD gets PT-sBOLD's
// market; an explorer's uses resolve under its route, each path once.

import test from "node:test";
import assert from "node:assert/strict";
import { chipUses, pendleUses } from "../../lib/shared/asset-uses.ts";

const BOLD = "0x6440f144b7e50d6a8439336510312d2f54beb01d";
const SBOLD = "0x50bd66d59911f5e086ec87ae43c811e0d059dd11";

test("a live Pendle market names its yield token and its asset", () => {
  const out = pendleUses([
    {
      market: "0xEB603C5A42D49D3B2E078191C23BF3F5D25BC219",
      pt: "PT-sBOLD-4FEB2027",
      yieldToken: SBOLD,
      asset: BOLD,
      expired: false,
    },
  ]);
  assert.deepEqual(
    out.map((o) => o.token),
    [SBOLD, BOLD],
  );
  assert.deepEqual(out[1].use, {
    label: "PT-sBOLD-4FEB2027",
    page: "/markets/0xeb603c5a42d49d3b2e078191c23bf3f5d25bc219",
  });
});

test("an expired market, the zero address and a repeated token give no use", () => {
  const out = pendleUses([
    { market: "0x1", pt: "PT-sBOLD-25JUN2026", yieldToken: SBOLD, asset: BOLD, expired: true },
    {
      market: "0x2",
      pt: "PT-stETH",
      yieldToken: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      asset: "0x0000000000000000000000000000000000000000",
      expired: null,
    },
    {
      market: "0x3",
      pt: "PT-sUSDe",
      yieldToken: "0xAAAA000000000000000000000000000000000001",
      asset: "0xaaaa000000000000000000000000000000000001",
      expired: false,
    },
  ]);
  assert.deepEqual(
    out.map((o) => o.token),
    ["0xae7ab96520de3a18e5e111b5eaab095312d7fe84", "0xaaaa000000000000000000000000000000000001"],
  );
});

test("an explorer's uses resolve under its route, each path once", () => {
  const debt = { label: "Trove debt", page: "" };
  assert.deepEqual(
    chipUses("/ethereum/liquity-v2", [debt, { label: "Stability Pools", page: "/stability-pool" }, debt]),
    [
      { label: "Trove debt", href: "/ethereum/liquity-v2" },
      { label: "Stability Pools", href: "/ethereum/liquity-v2/stability-pool" },
    ],
  );
});

test("two markets of one PT symbol carry their short addresses", () => {
  const a = "0x643c3a3ba7af0151ad7e1ab5873a32aa197fd0a2";
  const b = "0xa185065ba8de1956ca13ff229006797b11d67a77";
  assert.deepEqual(
    chipUses("/ethereum/pendle", [
      { label: "PT-sUSDE-25FEB2027", page: `/markets/${a}` },
      { label: "PT-sUSDE-25FEB2027", page: `/markets/${b}` },
      { label: "PT-sUSDE-26NOV2026", page: "/markets/0x47ad2cd1dd15739a7a035b9d3b7828d916fef77e" },
    ]).map((u) => u.label),
    ["PT-sUSDE-25FEB2027 (0x643c…d0a2)", "PT-sUSDE-25FEB2027 (0xa185…7a77)", "PT-sUSDE-26NOV2026"],
  );
});

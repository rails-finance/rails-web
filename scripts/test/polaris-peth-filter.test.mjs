// The pETH account timeline's Type filter (ui-jobs 865) on the shared path
// every timeline reads (hooks/useTimelineEvents.ts): the page's events are
// offered as effect umbrellas with their kinds beneath, the hidden set
// settles against those legs (`settleActionHidden`), and `actionHidden`
// decides each row. Choosing one effect and pressing Show writes its
// siblings' legs to `?hide=`; the rows that pass are that effect's count.
// Fixture: the light address's whole ledger, 155 rows. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

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
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { ACTION_LEGS, actionHidden, getEventActionKey, getEventActionLegs, settleActionHidden } = await import(
  "../../lib/shared/event-filter-helpers.ts"
);
const { pethTimelineEvent } = await import("../../lib/polaris/peth-ledger.ts");

const d = JSON.parse(readFileSync(new URL("../fixtures/polaris-peth/light-b6a329ca.json", import.meta.url), "utf8"));
const NAMES = {
  peth: { symbol: "pETH", address: "0x07ea2ff889e6228cded329a09f66e370f12c705e" },
  fpeth: { symbol: "fpETH", address: "0x94220c1c340336527c719bcf06067ca7769ac185" },
  vpeth: { symbol: "vpETH", address: "0x43cc4978e11bc1e1d8cfcd8348cb7e7246c49b6e" },
  weth: { symbol: "WETH", address: "0xf430240a61e0a5bd7a3637d616e0dab5632fbe89" },
};
const events = d.rows.map((r) => pethTimelineEvent(r, NAMES, {}));

/** The hook's `offeredLegs`: each umbrella with the legs its loaded events carry. */
function offered(evts) {
  const seen = new Map();
  for (const e of evts) {
    const key = getEventActionKey(e);
    if (!ACTION_LEGS[key]) continue;
    for (const leg of getEventActionLegs(e) ?? []) {
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key).add(leg);
    }
  }
  return new Map([...seen].map(([k, legs]) => [k, ACTION_LEGS[k].map((l) => l.key).filter((x) => legs.has(x))]));
}
const shown = (hide) => {
  const settled = settleActionHidden(new Set(hide), offered(events));
  return events.filter((e) => !actionHidden(e, settled));
};

test("the page offers each effect with the kinds its rows carry", () => {
  const o = offered(events);
  assert.deepEqual(o.get("peth.acquisition"), ["peth.acquisition.curve_buy", "peth.acquisition.venue_swap_in"]);
  assert.deepEqual(o.get("peth.exit"), ["peth.exit.polar_conversion"]);
  assert.equal(events.length, 155);
});

test("choosing one effect shows that effect's rows alone", () => {
  // "Left the address" chosen: the URL the round read, ?hide= the acquisition legs.
  const left = shown(["peth.acquisition.curve_buy", "peth.acquisition.venue_swap_in"]);
  assert.equal(left.length, 77);
  assert.ok(left.every((e) => e.actionType === "peth.exit"));
  // "Acquired" chosen.
  const acquired = shown(["peth.exit.polar_conversion"]);
  assert.equal(acquired.length, 78);
});

test("one kind hidden under an effect leaves its siblings", () => {
  const rows = shown(["peth.acquisition.curve_buy"]);
  assert.equal(rows.length, 154);
  assert.ok(!rows.some((e) => e.actionLabel === "Bought on the curve"));
});

test("an event page's title is the kind and the pETH it moved, as a Trove event's reads", async () => {
  const { polarisPethEventPage } = await import("../../lib/polaris/peth-explorer.ts");
  const { eventTitleWords } = await import("../../lib/shared/event-title.ts");
  const title = (r) => {
    const event = pethTimelineEvent(r, NAMES, {});
    return eventTitleWords(polarisPethEventPage({ address: d.address, row: r, event }).title);
  };
  const buy = d.rows.find((r) => r.kind === "curve_buy");
  const split = { ...buy, kind: "split", effect: "change_of_place", peth_delta_raw: "-10000000000000000000" };
  assert.equal(title(split), "Split 10 pETH");
  assert.match(title(buy), /^Bought on the curve [\d.,]+K? pETH$/);
});

test("an unread head reads the stored places as of the last read, with no date", async () => {
  const { pethStoredAsOf, pethAsOfWords } = await import("../../lib/polaris/peth-as-of.ts");
  const ledger = {
    complete: null,
    scanned_to_block: "12224849",
    // The pETH lane's watermark: the stored places come from another lane, so
    // this time does not date them.
    scanned_to_timestamp: "2026-11-27T17:57:24.000Z",
    deploy_block: "11482700",
    head_block: null,
    fresh_within_blocks: 7200,
  };
  assert.equal(pethStoredAsOf({ ledger }), true);
  assert.equal(pethAsOfWords(pethStoredAsOf({ ledger })), ", as of the last read");
  assert.equal(
    pethAsOfWords(pethStoredAsOf({ ledger: { ...ledger, scanned_to_timestamp: null } })),
    ", as of the last read",
  );
});

test("a head that answered adds no note", async () => {
  const { pethStoredAsOf, pethAsOfWords } = await import("../../lib/polaris/peth-as-of.ts");
  const ledger = { complete: true, scanned_to_block: "12224849", deploy_block: "11482700", head_block: "12225476" };
  assert.equal(pethStoredAsOf({ ledger }), false);
  assert.equal(pethAsOfWords(false), "");
});

test("a not-decoded vpETH move titles with its vpETH and keeps its one bullet", async () => {
  const { polarisPethEventPage } = await import("../../lib/polaris/peth-explorer.ts");
  const { eventTitleWords } = await import("../../lib/shared/event-title.ts");
  const { pethRowBullets } = await import("../../lib/polaris/peth-ledger.ts");
  const base = d.rows.find((r) => r.kind === "curve_buy");
  const row = {
    ...base,
    kind: "morpho_vpeth_not_decoded",
    effect: "not_decoded",
    valuation: null,
    eth_in_raw: "0",
    eth_out_raw: "0",
    curve_fee_raw: "0",
    peth_delta_raw: "0",
    fpeth_delta_raw: "0",
    vpeth_delta_raw: "200000000000000",
    lines: [
      {
        rule: "morpho_vpeth_not_decoded",
        effect: "not_decoded",
        token: "vpeth",
        direction: "in",
        amount_raw: "200000000000000",
        counterparty: "0x3d6616fef672755a36d6a7c313d25a5266008cd7",
        counterparty_role: "morpho_blue",
        counterparty_code_size: null,
        log_index: 1,
      },
    ],
  };
  const event = pethTimelineEvent(row, NAMES, {});
  assert.equal(
    eventTitleWords(polarisPethEventPage({ address: d.address, row, event }).title),
    "Morpho Blue market (not decoded) <0.01 vpETH",
  );
  assert.deepEqual(pethRowBullets(row, NAMES), ["This vpETH move is in no ETH figure or valuation."]);
});

test("a protocol contract is not an account: no pETH account link for it", async () => {
  const { isPolarisProtocolAddress } = await import("../../lib/polaris/asset-catalog.ts");
  // The sUSDp vault (holds deposit #2), the zap router and the bonding curve.
  assert.equal(isPolarisProtocolAddress("0x63d01003f67d8807799fdfbdeefb583d3c8f7f73"), true);
  assert.equal(isPolarisProtocolAddress("0xD09416D328DFAA07A422A1DF233D1D968B80FBF8"), true);
  assert.equal(isPolarisProtocolAddress("0x07ea2ff889e6228cded329a09f66e370f12c705e"), true);
  assert.equal(isPolarisProtocolAddress(d.address), false);
});

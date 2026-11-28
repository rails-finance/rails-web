// The links each family builds for itself on LinkedValue (ui-jobs 878 round
// 3, anatomy L14): Liquity V2's manager, redeemer, Trove and cooldown links,
// Pendle's router and market-row wallet, CoW's other owners, Aave position and
// swap links, Polaris's place line outside Rails and Dolomite's other account.
// scripts/fixtures/family-links/before.json was rendered by
// family-links.render.mjs at 4ea6254c5, before the sites moved: 1cfe4c0a5 with
// five edits that change no markup (TroveName, PlaceLine and Dolomite's
// OtherAccount exported; the cooldown's link drawn as CooldownEventLink and
// Dolomite's other-account link as OtherAccountLink). The fixture pins, byte
// for byte, the forms with no link and the exempt ones (a Rails place line, a
// wallet page's Pendle row, the swap card's "Open the swap" line); each linked
// case reads the text it read before, inside the LinkedValue wrapper, its name
// holding the tooltip's words. The render runs in tsx. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ADDR, OWNER, TROVE } from "./family-links.cases.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const after = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "--require",
      "./scripts/test/yaml-require.cjs",
      "--import",
      "tsx",
      "--no-warnings",
      "scripts/test/family-links.render.mjs",
    ],
    { cwd: REPO, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  ),
);
const before = JSON.parse(readFileSync(path.join(REPO, "scripts/fixtures/family-links/before.json"), "utf8"));

/** Every link in the markup whose name is the one given. */
const linksNamed = (html, name) =>
  [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).filter((a) => a.includes(`aria-label="${name}"`));
/** The one LinkedValue link with this name: in the house tooltip, the L14 hook
 *  on it, no native title. */
function linked(html, name, count = 1) {
  const all = linksNamed(html, name);
  assert.equal(all.length, count, `${count} link(s) named "${name}"`);
  const a = all[0];
  assert.ok(html.includes(`<span data-reveal-tip="" class="relative inline-flex cursor-pointer items-center ">${a}`));
  assert.match(a, /data-anatomy="L14"/);
  assert.doesNotMatch(a, /\btitle=/, "no native title beside the house tooltip");
  return a;
}
const inside = (a, href) => {
  assert.ok(a.includes(`href="${href}"`), href);
  assert.doesNotMatch(a, /target=/);
};
const external = (a, href) => {
  assert.ok(a.includes(`href="${href}"`), href);
  assert.match(a, /target="_blank"/);
  assert.match(a, /rel="noopener"/);
};
/** The text a reader sees: the markup without its tags. */
const text = (html) => html.replace(/<[^>]*>/g, "");
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const TROVE_SHORT = `${TROVE.slice(0, 6)}…${TROVE.slice(-4)}`;

// The forms LinkedValue leaves alone, and the prose wallet, on LinkedAddress
// since round 2.
const pinned = (n) => /^(plain|exempt)/.test(n) || n === "walletWord";
for (const name of Object.keys(before).filter(pinned)) {
  test(`a form with no link renders as before: ${name}`, () => {
    assert.equal(after[name], before[name]);
  });
}

// The Dolomite account link drew the account label's own tooltip, whose words
// sat in the link as screen-reader text.
for (const name of Object.keys(before).filter((n) => !pinned(n) && n !== "dolomiteAccountLink")) {
  test(`a linked form reads the text it read before: ${name}`, () => {
    assert.notEqual(after[name], before[name]);
    assert.equal(text(after[name]), text(before[name]));
  });
}

test("Liquity V2: the manager keeps its pink, its tooltip LinkedAddress's", () => {
  const a = linked(after.managerWord, `Summerstone: Address ${short(ADDR)}, View on Etherscan`);
  external(a, `https://etherscan.io/address/${ADDR}`);
  assert.match(a, /class="[^"]*text-pink-500 hover:text-pink-600/);
});

test("Liquity V2: the redeemer names the redeemer's page and keeps its hook", () => {
  const a = linked(after.redeemerWord, `redeemer: Redeemer ${short(ADDR)}`);
  inside(a, `/ethereum/liquity-v2/redeemer/${ADDR}?at=e7`);
  assert.match(a, /data-redeemer-link=""/);
});

test("Liquity V2: a redeemer row's Trove, in T1 and T2, names the Trove", () => {
  const href = `/ethereum/liquity-v2/trove/WETH/${TROVE}?at=`;
  const t1 = linked(after.redemptionRow, `Trove ${TROVE_SHORT}`);
  assert.ok(t1.includes(`href="${href}`));
  assert.ok(t1.includes(`data-redeemer-trove="${TROVE}"`));
  const t2 = linked(after.redemptionPage, `Trove ${TROVE_SHORT}`);
  assert.ok(t2.includes(`href="${href}`));
  assert.match(t2, /class="[^"]*\blink font-mono text-xs"/);
  // The receipt sits around the link, as the block's does.
  assert.ok(after.redemptionPage.includes(`<span data-reveal-tip=""`));
});

test("Liquity V2: a deposit's Trove in the transaction names the Trove", () => {
  const a = linked(after.spTxTrove, `Trove ${TROVE_SHORT}`);
  inside(a, `/ethereum/liquity-v2/trove/wstETH/${TROVE}`);
});

test("Liquity V2: the cooldown's words name the event page and keep the verifier's hook", () => {
  const words = {
    open: ["the Trove opened", "Opening event"],
    "open-batch": ["the Trove opened in the batch", "Opening event"],
    rate: ["the Trove&#x27;s rate changed", "Rate change event"],
    join: ["the Trove joined the batch", "Batch join event"],
    leave: ["the Trove left the batch", "Batch leave event"],
    "batch-rate": ["the delegate changed the batch&#x27;s rate", "Batch rate change event"],
  };
  for (const [start, [value, page]] of Object.entries(words)) {
    const a = linked(after[`cooldown-${start}`], `${value}: ${page}`);
    assert.match(a, new RegExp(`data-rate-cooldown-event="[^"]*_${start}"`));
    assert.match(a, /\/event\//);
  }
});

test("Pendle: the router opens Etherscan from its tooltip, the market row's wallet names its position", () => {
  const router = linked(after.pendlePage, "PendleRouterV4: Router 0x8888…f946, View on Etherscan");
  external(router, "https://etherscan.io/address/0x888888888889758f76e7103c6cbf23abbf58f946");
  const w = linked(after.pendleMarketRow, `Pendle position of ${short(OWNER)}`);
  assert.ok(w.includes(`data-pendle-row-wallet="${OWNER}"`));
  assert.ok(w.includes(`href="/ethereum/pendle/${OWNER}/0x6d98a2b6cdbf44939362a3e99793339ba2016af4"`));
});

test("CoW: another owner in the settlement names their CoW page", () => {
  const a = linked(after.cowSettlement, "CoW trades of 0x21ed…60c4");
  inside(a, "/ethereum/cow/0x21edb65009859332758f5493542d0589c12960c4");
});

test("CoW: an Aave swap's position names the position; the line that names its page takes no tooltip", () => {
  for (const [family, href] of [
    ["aave-v3", `/ethereum/aave-v3/${OWNER}`],
    ["aave-v4", `/ethereum/aave-v4/spoke/main/${OWNER}`],
  ]) {
    const name = `${family === "aave-v3" ? "Aave V3" : "Aave V4"} position of ${short(OWNER)}`;
    inside(linked(after[`cowAaveSwap-${family}`], name), href);
    const open = (html) => /<li><a [^>]*>Open the swap on the position’s timeline<\/a><\/li>/.exec(html)?.[0];
    assert.ok(open(before[`cowAaveSwap-${family}`]));
    assert.equal(open(after[`cowAaveSwap-${family}`]), open(before[`cowAaveSwap-${family}`]));
  }
});

test("CoW: a trade that was an Aave swap names the swap's page and keeps its hook", () => {
  const a = linked(after.cowTradeAave, "a collateral swap on Aave V3: This swap on the Aave position&#x27;s timeline");
  assert.match(a, /data-cow-aave-swap="true"/);
  assert.match(a, /href="\/ethereum\/aave-v3\/[^"]*\/event\//);
});

test("Polaris: a place outside Rails states the place, then Etherscan", () => {
  const vault = linked(after.placeSvpeth, "Went to the svpETH vault, View on Etherscan");
  external(vault, "https://sepolia.etherscan.io/address/0x7b118bd63bbe9023a2a509cecd48bc283d150539");
  linked(after.placeVenue, "Went to the Curve pETH/fpETH/vpETH pool, View on Etherscan");
  assert.match(after.placeSvpeth, /data-anatomy="T10\.1·polaris" data-peth-row-place="svpeth"/);
});

test("Dolomite: another wallet's address is LinkedAddress; its account names the account's page", () => {
  for (const name of ["dolomiteOtherWallet", "dolomiteOtherUnnumbered"])
    external(linked(after[name], `Address ${short(ADDR)}, View on Etherscan`), `https://etherscan.io/address/${ADDR}`);
  const other = linked(after.dolomiteAccountLink, `account 0 (Dolomite Balance): Dolomite Balance of ${short(ADDR)}`);
  inside(other, `/ethereum/dolomite/${ADDR}/0`);
  assert.equal(text(after.dolomiteAccountLink), "account 0 (Dolomite Balance)");
  inside(linked(after.dolomiteAccountLinkSameWallet, "Borrow Position #1"), `/ethereum/dolomite/${OWNER}/1`);
});

// lib/polaris/position-to-markdown.ts — the Polaris "Copy for LLM" export:
// each PSM gap is stated once, gaps that meet end to end merge into one note
// over their block range, and the id line names the market (rails-ops
// ui-jobs 692); the Market notes section says why a rate note is missing
// instead of dropping out (ui-jobs 693).
// Run: npm test
//
// The exporter imports through `@/`, so this file resolves `@/` and
// extensionless paths as head-snapshot.test.mjs does. The one .tsx module on
// its import path (economics-explanation.tsx, a sentence the PSM outcome line
// reads) is loaded as a stub whose exports return null.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\\.[a-z]+$/.test(url)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    if (url.endsWith(".tsx")) {
      const src = readFileSync(fileURLToPath(url), "utf8");
      const names = [...src.matchAll(/^export (?:async )?(?:function|const) (\\w+)/gm)].map((m) => m[1]);
      const body = names.map((n) => "export const " + n + " = () => null;").join("\\n");
      return { url: "data:text/javascript," + encodeURIComponent(body), shortCircuit: true };
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}`;
register("data:text/javascript," + encodeURIComponent(hook));

const { polarisPositionToMarkdown } = await import(ROOT + "lib/polaris/position-to-markdown.ts");
const { polarisPsmGapNotes } = await import(ROOT + "lib/polaris/psm-gap.ts");
const { mergePsmGapRanges, psmGapSentence } = await import(ROOT + "lib/shared/market-note.ts");

/** A Polaris CDPUpdated row. `psm` is [collGain, debtGain]; `ordinal` the
 *  market's PrimaryRateSet count at the row. */
function touch(i, block, { psm = ["0", "0"], ordinal = null, rate = 0.05, type = "adjust" } = {}) {
  return {
    id: `ev-${i}`,
    blockNumber: block,
    timestamp: 1_760_000_000 + i * 3600,
    txHash: `0x${String(i).padStart(64, "0")}`,
    actionLabel: type === "open" ? "Open" : "Adjust",
    context: {
      protocol: "polaris",
      data: {
        eventType: type,
        market: "goldp",
        cdpId: "20",
        stableSymbol: "GOLDp",
        operation: type === "open" ? 0 : 1,
        newColl: "10",
        newDebt: "1000",
        collChange: "0",
        debtChange: "0",
        mintRedeemCollGain: psm[0],
        mintRedeemDebtGain: psm[1],
        accruedInterest: "0",
        ...(rate != null ? { primaryRate: rate } : {}),
        ...(ordinal != null ? { rateSet: { ordinal } } : {}),
        raw: { mintRedeemCollGain: `${psm[0]}e18`, mintRedeemDebtGain: `${psm[1]}e18` },
      },
    },
  };
}

const VIEW = {
  market: "goldp",
  cdpId: "20",
  stableSymbol: "GOLDp",
  owner: "0x0000000000000000000000000000000000000001",
  status: "closed",
  peakColl: 0,
  peakDebt: 0,
};

/** Five touches: gaps 1→2 and 2→3 meet end to end, 3→4 wrote no share, 4→5
 *  stands alone. */
const EVENTS = [
  touch(1, 100, { ordinal: 10, type: "open" }),
  touch(2, 200, { psm: ["0.5", "-12"], ordinal: 14 }),
  touch(3, 300, { psm: ["0.25", "-3"], ordinal: 16 }),
  touch(4, 400, { ordinal: 16 }),
  touch(5, 500, { psm: ["-0.1", "4"], ordinal: 19 }),
];
const GAPS = polarisPsmGapNotes(EVENTS, "20");

const exportOf = (events, extra = {}) =>
  polarisPositionToMarkdown({
    view: VIEW,
    chain: null,
    events,
    notes: polarisPsmGapNotes(events, "20"),
    generatedAt: new Date(Date.UTC(2026, 10, 17)),
    ...extra,
  });

test("gaps that meet end to end merge; a touch with no share ends the range", () => {
  assert.equal(GAPS.length, 3);
  const merged = mergePsmGapRanges(GAPS);
  assert.equal(merged.length, 2);
  const [range, single] = merged;
  assert.equal(range.from.block, 100);
  assert.equal(range.to.block, 300);
  assert.equal(range.trades, 6);
  assert.equal(range.members.length, 2);
  assert.equal(range.collShare, 0.75);
  assert.equal(range.debtShare, -15);
  assert.equal(single.from.block, 400);
  assert.equal(single.members, undefined);
  assert.match(
    psmGapSentence(range),
    /^Between blocks 100 and 300, 6 PSM mints and redemptions moved the market; 2 of this position's touches wrote its share/,
  );
});

test("no PSM sentence appears more than once in the export", () => {
  const md = exportOf(EVENTS);
  const sentences = md.split("\n").filter((l) => l.startsWith("Between blocks"));
  assert.equal(sentences.length, 2);
  for (const s of sentences) assert.equal(md.split(s).length - 1, 1, s);
  // Nor any single gap's sentence, merged or not.
  for (const g of GAPS) assert.ok(md.split(psmGapSentence(g)).length - 1 <= 1, psmGapSentence(g));
});

test("each PSM note's receipt names the logs and raw fields, not the sentence", () => {
  const md = exportOf(EVENTS);
  const receipts = md.split("\n").filter((l) => l.startsWith("- Receipt:"));
  assert.equal(receipts.length, 2);
  assert.match(
    receipts[0],
    /CDPUpdated at each touch that wrote a share, raw — block 200, tx 0x[0-9a-f]+: `_mintRedeemCollGain` 0\.5e18, `_mintRedeemDebtGain` -12e18; block 300, tx 0x[0-9a-f]+: /,
  );
  assert.match(receipts[0], /PrimaryRateSet count at each end, 10 → 16\./);
  assert.match(
    receipts[1],
    /^- Receipt: this position's CDPUpdated at block 500, tx 0x0+5; raw: `_mintRedeemCollGain` -0\.1e18/,
  );
  for (const r of receipts) assert.doesNotMatch(r, /Between blocks/);
});

test("the timeline row points at the section instead of restating the note", () => {
  const md = exportOf(EVENTS);
  const rows = md.split("\n").filter((l) => l.startsWith("| ") && l.includes("PSM note"));
  assert.equal(rows.length, 3);
  assert.match(rows[0], /PSM note: 4 PSM mints and redemptions since the previous touch \(see Market notes\) \|$/);
});

test("the id line names the market", () => {
  const md = exportOf(EVENTS);
  assert.ok(md.includes("- **Position id:** GOLDp #20\n"));
});

// ── ui-jobs 693 ──────────────────────────────────────────────────────────────

const OPEN_VIEW = {
  ...VIEW,
  status: "open",
  coll: 10,
  debt: 1000,
  collUsd: null,
  recordedDebt: 1000,
  icr: null,
  mcr: 1.15,
};

/** A head read of an open CDP with a price, at block 900. */
const CHAIN = {
  market: "goldp",
  cdpId: "20",
  blockNumber: 900,
  blockTimestamp: 1_760_100_000,
  owner: VIEW.owner,
  isOpen: true,
  recordedColl: 10,
  recordedDebt: 1000,
  entireColl: 10,
  entireDebt: 1000,
  accruedInterest: 0,
  accruedStables: 0,
  bcTokenGain: 0,
  mintRedeemCollChange: 0,
  mintRedeemDebtChange: 0,
  icr: 2,
  lastTouchTime: 0,
  interestRate: 0.06,
  primaryRate: 0.05,
  secondaryRate: 0.01,
  defensiveMode: false,
  reserveToDebtRatio: 1,
  mcr: 1.15,
  defensiveMcr: 1.5,
  price: { curve: 1, ethUsd: 3000, xauUsd: 2500, pethInDebt: 1.2, pethUsd: 3000 },
  chainStale: false,
};

/** The Market notes section, or null when the export has none. */
const notesSection = (md) => {
  const m = /## Market notes\n([\s\S]*?)\n## /.exec(md);
  return m ? m[1] : null;
};

test("a position that predates the market's first rate says so", () => {
  const md = exportOf([touch(1, 100, { type: "open", rate: null })]);
  assert.equal(
    notesSection(md)?.trim(),
    "This position opened before the market set its first primary rate, so there is no rate at open.",
  );
});

test("an open position whose live read did not answer says the live read was unavailable", () => {
  const unrated = [touch(1, 100, { type: "open", rate: null })];
  for (const chain of [null, { ...CHAIN, chainStale: true }, { ...CHAIN, price: null }]) {
    const section = notesSection(exportOf(unrated, { view: OPEN_VIEW, chain }));
    assert.match(section, /opened before the market set its first primary rate/);
    assert.match(section, /The live read was unavailable, so this snapshot carries no live rate note\./);
  }
  const rated = [touch(1, 100, { type: "open" }), touch(2, 200)];
  const section = notesSection(exportOf(rated, { view: OPEN_VIEW, chain: null }));
  assert.match(section, /never moved by 1 percentage point or more\./);
  assert.match(section, /The live read was unavailable/);
});

test("a live read with no move states the rate at the head", () => {
  const rated = [touch(1, 100, { type: "open" })];
  const section = notesSection(exportOf(rated, { view: OPEN_VIEW, chain: CHAIN, liveNotes: [] }));
  assert.match(section, /Only one of this position's touches carries the market's primary rate/);
  assert.match(
    section,
    /At the latest block 900 the market's primary rate is 5\.00% per year, unchanged to two places/,
  );
  assert.doesNotMatch(section, /live read was unavailable/);
});

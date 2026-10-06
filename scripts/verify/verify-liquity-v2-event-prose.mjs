#!/usr/bin/env node
// Liquity V2 event prose: one generator, every surface (rails-ops
// TO-DO-ui-jobs 273). On the event page of each sampled event:
//
//   P1  COPY = EXPORT — the Copy for LLM block equals the committed export's
//       block for the event (exports/liquity-v2/ethereum/<troveId>.md),
//       character for character, the URL and the L5 aside: the export names
//       the modal and prints it once at the end, and that text equals the
//       copy's L5.
//   P2  L4 ON THE PAGE — every L4 sentence of the block is a bullet of the
//       opened card's Explanation, in order.
//   P3  L2 ON THE PAGE — every figure of the block's L2 lines is in the
//       opened card, in order.
//   P4  L1 ON THE PAGE — the L1 line's words and figures are on the event's
//       row (the header and the spine).
//
// Samples: the brief's #17 (redemption) and #18 (withdraw) on trove
// 102247…0154, each other fixture's last event, and the first event printed
// in full of each template and variant across the fixtures, up to MAX
// (default 14) of those.
//
//   BASE=http://localhost:3000 node scripts/verify/verify-liquity-v2-event-prose.mjs

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "../..");
const { chromium } = createRequire(ROOT + "/")("playwright");
const BASE = (process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "");
const MAX = Number(process.env.MAX ?? 14);
const DIR = resolvePath(ROOT, "exports/liquity-v2/ethereum");
const STORY = "102247037494986730506041632222868001124387697185626929998095238518734059870154";

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// ── The committed exports ────────────────────────────────────────────────────

const fixtures = JSON.parse(readFileSync(resolvePath(DIR, "fixtures.json"), "utf8")).fixtures;
/** Each event block printed in full, by trove and number. */
function blocks(troveId) {
  const md = readFileSync(resolvePath(DIR, `${troveId}.md`), "utf8");
  const out = new Map();
  for (const part of md.split("\n\n---\n\n")) {
    const at = part.indexOf("# Liquity V2 · ");
    if (at < 0) continue;
    const text = part.slice(at).split("\n\n---\n")[0].replace(/\n+$/, "");
    const n = Number(/Event #(\d+) of/.exec(text)?.[1]);
    if (n) out.set(n, text);
  }
  const appendix = md.slice(md.indexOf("## Learn more (L5)"));
  return { full: out, appendix };
}

const samples = [];
const seen = new Set();
for (const f of fixtures) {
  const side = JSON.parse(readFileSync(resolvePath(DIR, `${f.troveId}.json`), "utf8"));
  const { full, appendix } = blocks(f.troveId);
  // The brief's two, and each other fixture's last event (its close, its
  // liquidation, its redemption to zero).
  const want = f.troveId === STORY ? [17, 18] : [side.at(-1).n];
  for (const e of side) {
    const key = `${e.template.id}:${e.template.variant}`;
    if (!full.has(e.n)) continue;
    if (want.includes(e.n) || (!seen.has(key) && samples.length < MAX)) {
      seen.add(key);
      samples.push({ f, e, block: full.get(e.n), appendix });
    }
  }
  for (const n of want) if (!full.has(n)) check(`#${n} of ${f.troveId.slice(0, 8)}… is printed in full`, false);
}

// ── The page ─────────────────────────────────────────────────────────────────

const norm = (s) => s.replace(/\s+/g, " ").trim();
/** `needles` appear in `hay` in order. */
function inOrder(hay, needles) {
  let at = 0;
  for (const n of needles) {
    const i = hay.indexOf(n, at);
    if (i < 0) return n;
    at = i + n.length;
  }
  return null;
}
const section = (block, level) => {
  const lines = block.split("\n");
  const i = lines.findIndex((l) => l.startsWith(`**${level}`));
  if (i < 0) return [];
  const out = [lines[i]];
  for (let j = i + 1; j < lines.length && !lines[j].startsWith("**"); j++) out.push(lines[j]);
  return out;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1800 },
  permissions: ["clipboard-read", "clipboard-write"],
});
try {
  for (const { f, e, block, appendix } of samples) {
    const label = `${f.branch} ${f.troveId.slice(0, 8)}… #${e.n} ${e.template.id}:${e.template.variant}`;
    const page = await ctx.newPage();
    const url = `${BASE}/ethereum/liquity-v2/trove/${f.branch}/${f.troveId}/event/${encodeURIComponent(e.id)}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
    const card = page.locator('[data-anatomy="T2"]').first();
    await card.waitFor({ timeout: 60_000 });
    // The ledgers land with the flows panel: the copy waits for the cells.
    await page.waitForTimeout(3000);
    await page.locator('[data-anatomy="T2"] button[data-anatomy="T3"]').first().click();
    const copyBtn = page.locator("[data-copy-for-llm]").first();
    await copyBtn.waitFor({ timeout: 30_000 });
    await copyBtn.click();
    const copy = await page.evaluate(() => navigator.clipboard.readText());

    // P1
    const expected = block.replace(/ · https:\/\/rails\.finance\/\S+/, " · <url>");
    const got = copy.replace(/ · https?:\/\/[^/\s]+\/\S+/, " · <url>");
    const l5 = section(got, "L5 ·").join("\n");
    const title = /\*\*L5 · (.*)\*\*/.exec(l5)?.[1] ?? "";
    const gotRef = got.replace(/\*\*L5 · [\s\S]*?(?=\n\n\*\*Footer\*\*)/, `**L5** ${title} (below)`);
    const firstDiff = (a, b) => {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      return i < Math.max(a.length, b.length)
        ? `at ${i}: export «${a.slice(i, i + 60)}» copy «${b.slice(i, i + 60)}»`
        : "";
    };
    check(`${label}: Copy for LLM = the committed export`, gotRef === expected, firstDiff(expected, gotRef));
    check(`${label}: its L5 = the export's L5 for "${title}"`, title !== "" && appendix.includes(l5), l5.slice(0, 120));

    // P2
    const t2 = await card.innerText();
    const bullets = section(copy, "L4")
      .slice(1)
      .map((l) => l.replace(/^- /, ""));
    const missing = inOrder(norm(t2), bullets.map(norm));
    check(
      `${label}: L4 is the card's Explanation (${bullets.length} bullets)`,
      bullets.length > 0 && !missing,
      missing ?? "",
    );

    // P3
    const figures = section(copy, "L2")
      .slice(1)
      .flatMap((l) => l.match(/[−+]?\$?[\d,]+(?:\.\d+)?%?/g) ?? []);
    const missing2 = inOrder(t2, figures);
    check(`${label}: L2's figures are on the card (${figures.length})`, !missing2, missing2 ?? "");

    // P4: the row (spine and header), with the timeline values on.
    const row = page.locator('[data-skel-section="detail-event"]').first();
    const rowText = norm((await row.innerText()).replace(/\n/g, " "));
    const l1 = /\*\*L1\*\* (.*)/.exec(copy)?.[1] ?? "";
    // Token symbols are icons on the row, not text.
    const symbols = new Set([e.values.coll_symbol, e.values.debt_symbol]);
    const words = l1
      .split(" · ")
      .flatMap((g) => g.split(" "))
      .filter((w) => !symbols.has(w));
    // The spine draws the figures beside the node and the header the words,
    // so they are matched separately, regardless of case (the spine's
    // pill is upper-cased by its style).
    const missing3 = words.find((w) => !rowText.toLowerCase().includes(w.toLowerCase())) ?? null;
    check(
      `${label}: L1 "${l1}" is on the row`,
      l1 !== "" && !missing3,
      `${missing3} not in «${rowText.slice(0, 200)}»`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed (${samples.length} events)`);
process.exit(fail > 0 || pass === 0 ? 1 : 0);

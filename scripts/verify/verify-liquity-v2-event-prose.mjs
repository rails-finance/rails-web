#!/usr/bin/env node
// Liquity V2 event prose: one generator, every surface (rails-ops
// TO-DO-ui-jobs 273, 278). The script first runs the exports for the fixtures
// (scripts/exports-liquity-v2.mjs --fixtures-only) into a temporary folder,
// so the block it compares against is the live generator's. On the event page
// of each sampled event:
//
//   P0  MANIFEST — the block's hash equals the committed manifest's
//       (scripts/exports/liquity-v2-ethereum.manifest.json); a string or a
//       history that changed since the manifest was written fails here, and
//       `pnpm exports:liquity-v2` rewrites it.
//   P1  COPY = EXPORT — the Copy for LLM block equals the export's block for
//       the event, character for character, three things aside: the URL; the
//       L5, which the export names and prints once at the end (that text must
//       equal the copy's); and the dollar figures on a line that says
//       "today", which the page reads at today's price and the export at its
//       pinned one.
//   P2  L4 ON THE PAGE — every L4 sentence of the block is a bullet of the
//       opened card's Explanation, in order; a grouped L4's headings
//       ("**L4 · What happened**") are the pane's group headings, in order
//       (ui-jobs 282).
//   P3  L2 ON THE PAGE — every figure of the block's L2 lines is in the
//       opened card, in order; a Collateral or Debt line by its after figures, which
//       close the open ledger.
//   P4  L1 ON THE PAGE — the L1 line's words and figures are on the event's
//       row (the header and the spine; on the event page, the header).
//
// Samples: the brief's #17 (redemption) and #18 (withdraw) on trove
// 102247…0154, each other fixture's last event, and the first event printed
// in full of each template and variant across the fixtures, up to MAX
// (default 14) of those.
//
//   BASE=http://localhost:3000 node scripts/verify/verify-liquity-v2-event-prose.mjs
//
// EXPORTS=<dir> reads an export run already made (its ethereum/ folder)
// instead of making one.

import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as resolvePath } from "node:path";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "../..");
const { chromium } = createRequire(ROOT + "/")("playwright");
const BASE = (process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "");
const MAX = Number(process.env.MAX ?? 14);
const FIXTURES = resolvePath(ROOT, "scripts/exports/liquity-v2-fixtures.json");
const MANIFEST = resolvePath(ROOT, "scripts/exports/liquity-v2-ethereum.manifest.json");
const STORY = "102247037494986730506041632222868001124387697185626929998095238518734059870154";

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// ── The exports, from the live generator ─────────────────────────────────────

const tmp = process.env.EXPORTS ? null : mkdtempSync(join(tmpdir(), "liquity-v2-exports-"));
if (tmp) {
  const run = spawnSync(
    process.execPath,
    [resolvePath(ROOT, "scripts/exports-liquity-v2.mjs"), "--fixtures-only", "--out", tmp],
    { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, BASE } },
  );
  if (run.status !== 0) {
    console.log("FAIL  the exports ran (scripts/exports-liquity-v2.mjs --fixtures-only)");
    process.exit(1);
  }
}
const DIR = resolvePath(tmp ?? process.env.EXPORTS, "ethereum");
process.on("exit", () => tmp && rmSync(tmp, { recursive: true, force: true }));

const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8")).fixtures;
const manifest = new Map(
  JSON.parse(readFileSync(MANIFEST, "utf8")).fixtures.flatMap((f) => f.events.map((e) => [e.id, e.block])),
);
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
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

/** L4 as printed: one run under "**L4**", or one per "**L4 · heading**". */
const l4Runs = (block) => {
  const runs = [];
  let cur = null;
  for (const l of block.split("\n")) {
    if (l.startsWith("**")) {
      cur = null;
      const m = /^\*\*L4(?: · (.*))?\*\*$/.exec(l);
      if (m) runs.push((cur = { heading: m[1] ?? null, bullets: [] }));
    } else if (cur && l.startsWith("- ")) cur.bullets.push(l.slice(2));
  }
  return runs;
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
    // The event page's T3 stands open with no button; a card with a closed
    // (i) button is opened here.
    const t3 = page.locator('[data-anatomy="T2"] button[data-anatomy="T3"]').first();
    if ((await t3.count()) > 0 && (await t3.getAttribute("aria-expanded")) !== "true") await t3.click();
    // Copy for LLM is the last button of the actions row under the side
    // column's title (ui-jobs 291).
    const copyBtn = page.locator('[data-event-page-actions] [data-menu-item="copy-for-llm"]').first();
    await copyBtn.waitFor({ timeout: 30_000 });
    await copyBtn.click();
    await page.locator('[data-menu-item="copy-for-llm"][data-copied]').first().waitFor({ timeout: 5_000 });
    const copy = await page.evaluate(() => navigator.clipboard.readText());

    // P0
    const want = manifest.get(e.id);
    check(
      `${label}: the block's hash = the manifest's`,
      want === hash(block),
      want ? `manifest ${want}, generator ${hash(block)}; run pnpm exports:liquity-v2` : "not in the manifest",
    );

    // P1
    // The page reads today's price live and the export its pinned one
    // (fixtures.json), so a line that says "today" is compared without its
    // dollar figures.
    const today = (t) =>
      t
        .split("\n")
        .map((l) => (/\btoday\b/.test(l) ? l.replace(/[−+]?\$[\d,]+/g, "$…") : l))
        .join("\n");
    const expected = today(block.replace(/ · https:\/\/rails\.finance\/\S+/, " · <url>"));
    const got = today(copy.replace(/ · https?:\/\/[^/\s]+\/\S+/, " · <url>"));
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
    check(`${label}: Copy for LLM = the generator's export`, gotRef === expected, firstDiff(expected, gotRef));
    check(`${label}: its L5 = the export's L5 for "${title}"`, title !== "" && appendix.includes(l5), l5.slice(0, 120));

    // P2
    // The event page's Collateral and Debt ledgers stand open with no toggle
    // (ui-jobs 236): each closes on the after figures, so P3 reads a ledger
    // line of L2 from its after side.
    const t2 = await card.innerText();
    const l4 = l4Runs(copy);
    const bullets = l4.flatMap((r) => r.bullets);
    const missing = inOrder(norm(t2), bullets.map(norm));
    check(
      `${label}: L4 is the card's Explanation (${bullets.length} bullets)`,
      bullets.length > 0 && !missing,
      missing ?? "",
    );
    const headings = l4.map((r) => r.heading).filter(Boolean);
    const paneHeadings = await card
      .locator('[data-anatomy="T3"] [data-explain-group] > h4')
      .evaluateAll((els) => els.map((el) => el.textContent.trim()));
    // Each heading's bullets sit in its section.
    const underRight = await card.locator('[data-anatomy="T3"] [data-explain-group]').evaluateAll(
      (els, runs) =>
        runs.every((r, i) => els[i] && r.bullets.every((b) => els[i].textContent.replace(/\s+/g, " ").includes(b))),
      l4.filter((r) => r.heading).map((r) => ({ heading: r.heading, bullets: r.bullets.map(norm) })),
    );
    check(
      `${label}: L4's group headings are the pane's (${headings.length ? headings.join(" / ") : "flat"})`,
      JSON.stringify(headings) === JSON.stringify(paneHeadings) && (headings.length === 0 || underRight),
      `copy ${JSON.stringify(headings)}, pane ${JSON.stringify(paneHeadings)}${underRight ? "" : ", a bullet sits under another heading"}`,
    );

    // P3
    const LEDGER = /^- (Collateral|Debt):/;
    const NUM = /[−+]?\$?[\d,]+(?:\.\d+)?%?/g;
    const figures = section(copy, "L2")
      .slice(1)
      .flatMap((l) =>
        LEDGER.test(l)
          ? (l
              .replace(/\([^)]*[a-z][^)]*\)/g, "")
              .replace(/[−+]?\$?[\d,]+(?:\.\d+)?%?\s*→\s*/g, "")
              // "+8,580.12 interest = 667,073.79": the move is the ledger's
              // "since last event" row, the after closes it (ui-jobs 285).
              .replace(/[−+][\d,]+(?:\.\d+)? [a-z ]+ = /g, "")
              .match(NUM) ?? [])
          : (l.match(NUM) ?? []),
      );
    // The panels above the Explanation, whose prose repeats figures.
    const panels = await card.evaluate((el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll('[data-anatomy="T3"]').forEach((n) => n.remove());
      document.body.appendChild(c);
      const text = c.innerText;
      c.remove();
      return text;
    });
    const missing2 = inOrder(panels, figures);
    check(`${label}: L2's figures are on the card (${figures.length})`, !missing2, missing2 ?? "");

    // P4: the row (spine and header; the event page's header states the
    // spine's values), with the timeline values on.
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

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
//   P2  L4 ON THE PAGE — the first L4 sentence is the page's title (P4) and
//       every other L4 sentence is a bullet of the card's Explanation, in
//       order; a grouped L4's headings ("**L4 · What happened**") are the
//       pane's group headings, in order (ui-jobs 282).
//   P3  L2 AGAINST CHAIN TRUTH — the copy states the chain-truth figures
//       (ui-jobs 330), so each L2 figure is checked against its source. The
//       token after-figures of the Collateral and Debt lines, a "CLOSED", the
//       ratio's and the rate's before, and the yearly interest and fee equal
//       the event's state as the timeline API the page reads gives it
//       (stateAfter and stateBefore at the log's precision, the operation, the
//       event's price), at the precision the copy prints them. The figures the
//       sheet draws (the sides' dollar totals, the ratio and the rate after,
//       the price) are on the opened card, in order, as before.
//   P4  THE TITLE — the page's h1 (`data-event-page-sentence`) is the
//       Explanation's first sentence, L4's first bullet, word for word, and
//       the card's pane leaves it out (rails-ops decision 0045, "Ruled
//       since"); a liquidation's claimable surplus in L1 stands beside it as
//       the chip. The event page draws no head row, so L1's words are not on
//       it.
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
/** The timeline API the page reads, one fetch per Trove. */
const timelines = new Map();
async function chainEvent(branch, troveId, id) {
  if (!timelines.has(troveId)) {
    const byId = new Map();
    for (let offset = 0; offset <= 20_000; offset += 1_000) {
      const res = await fetch(`${BASE}/api/trove/${branch}/${troveId}/timeline?limit=1000&offset=${offset}`);
      if (!res.ok) break;
      const page = await res.json();
      for (const e of page.events ?? []) byId.set(e.id, e);
      if (!page.pagination?.hasMore) break;
    }
    timelines.set(troveId, byId);
  }
  return timelines.get(troveId).get(id)?.context?.data ?? null;
}
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

// ── P3: L2's figures against the event's chain-truth state ───────────────────

const NUM = /[−+]?\$?[\d,]+(?:\.\d+)?%?/g;
const CLOSED = "CLOSED";
const NOT_APPLICABLE = "N/A";
/** A log field at its precision (lib/liquity/utils/interest-calculator.ts rawAt). */
const rawAt = (raw, places, float) =>
  raw != null && /^-?\d+$/.test(String(raw)) ? Number(raw) / 10 ** places : (float ?? 0);
/** A printed figure equals a value at the precision it is printed to. */
function printedEq(printed, value) {
  const t = printed.replace(/[−+$,%]/g, "");
  const dec = t.includes(".") ? t.split(".")[1].length : 0;
  const n = Number(t) * (printed.startsWith("−") ? -1 : 1);
  return (
    Number.isFinite(n) && value != null && Math.abs(n - value) <= 0.5 * 10 ** -dec + 1e-9 * Math.max(1, Math.abs(value))
  );
}
/** The Trove's figures before the event as the generator rebuilds them
 *  (lib/liquity/event-safety.ts liquityBeforeAmounts), and the price they are
 *  read at. */
function beforeAmounts(c) {
  const op = c.troveOperation;
  const sb = c.stateBefore ?? {};
  const sa = c.stateAfter ?? {};
  const collAfter = rawAt(sa.raw?.coll, 18, sa.coll);
  const debtAfter = rawAt(sa.raw?.debt, 18, sa.debt);
  const dColl = op ? Math.abs(rawAt(op.raw?.collChangeFromOperation, 18, op.collChangeFromOperation)) : 0;
  const dDebt = op ? Math.abs(rawAt(op.raw?.debtChangeFromOperation, 18, op.debtChangeFromOperation)) : 0;
  const l = c.liquidation;
  if (c.operation === "liquidate" && l)
    return {
      price: l.price,
      debt: l.debtOffsetBySP + l.debtRedistributed,
      coll: l.collSentToSP + l.collRedistributed + l.collSurplus + l.collGasCompensation,
    };
  const price = c.collateralPrice ?? 0;
  if (["redeemCollateral", "adjustZombieTrove", "adjustUnredeemableZombieTrove"].includes(c.operation) && op)
    return { price, debt: debtAfter + dDebt, coll: collAfter + dColl };
  if (c.operation === "closeTrove" && op && sb.debt === 0 && sb.coll === 0) return { price, debt: dDebt, coll: dColl };
  return { price, coll: rawAt(sb.raw?.coll, 18, sb.coll), debt: rawAt(sb.raw?.debt, 18, sb.debt) };
}
/** L2's lines split by source: `card`, the figures the sheet draws, matched
 *  on the card in order; `state`, the figures checked against the event's
 *  chain-truth state. A line the parse does not know keeps the card match. */
function l2Checks(lines, c) {
  const card = [];
  const state = [];
  const truth = (what, printed, value) =>
    state.push({ what, printed, truth: value == null ? "unread" : value, ok: c != null && printedEq(printed, value) });
  const closedIs = (what) =>
    state.push({ what, printed: CLOSED, truth: c?.operation ?? "unread", ok: c?.operation === "closeTrove" });
  const sa = c?.stateAfter ?? {};
  const sb = c?.stateBefore ?? {};
  const collAfter = c ? rawAt(sa.raw?.coll, 18, sa.coll) : null;
  const debtAfter = c ? rawAt(sa.raw?.debt, 18, sa.debt) : null;
  const rateAfter = c ? rawAt(sa.raw?.annualInterestRate, 16, sa.annualInterestRate) : null;
  const rateBefore = c ? rawAt(sb.raw?.annualInterestRate, 16, sb.annualInterestRate) : null;
  for (const raw of lines) {
    const l = raw.replace(/^- /, "");
    const m = /^(Collateral|Debt|Collateral Ratio|Interest Rate): (.*)$/.exec(l);
    if (!m) {
      card.push(...(l.match(NUM) ?? []));
      continue;
    }
    const [, what, body] = m;
    if (what === "Collateral" || what === "Debt") {
      // "20.9383 → 22.9383 WETH ($43,733 → $47,911)", "+16.96 interest =
      // 28,766.06 BOLD ($28,766)", "15.004 → CLOSED WETH": the token after
      // against the state, the dollars after on the card; the parentheses in
      // words (the fee, the accrual's ledger line) and the befores aside.
      const head = body.replace(/\([^)]*\)/g, "").replace(/[−+][\d,]+(?:\.\d+)? [a-z ]+ = /, "");
      const after = head.split("→").at(-1).trim().split(" ")[0];
      if (after === CLOSED) closedIs(`${what} after`);
      else truth(`${what} after`, after, what === "Collateral" ? collAfter : debtAfter);
      const usd = (body.match(/\(([^)]*\$[^)]*)\)/)?.[1] ?? "").replace(/^.*→\s*/, "").match(NUM) ?? [];
      card.push(...usd.filter((x) => !/[a-z]/.test(x)));
      continue;
    }
    // "152.12% → 166.55%", "2.00% → CLOSED · 574.98 BOLD / year interest".
    const [level, ...rest] = body.split(" · ");
    const parts = level.split("→").map((x) => x.trim());
    const after = parts.at(-1);
    const before = parts.length > 1 ? parts[0] : null;
    if (after === CLOSED) closedIs(`${what} after`);
    else if (after === NOT_APPLICABLE)
      state.push({
        what: `${what} after`,
        printed: after,
        truth: what === "Interest Rate" ? rateAfter : debtAfter,
        ok: c != null && (what === "Interest Rate" ? !(rateAfter > 0) : debtAfter === 0),
      });
    else if (after.match(NUM)) card.push(after.match(NUM)[0]);
    if (before && what === "Interest Rate") truth("Interest Rate before", before, rateBefore);
    if (before && what === "Collateral Ratio" && c) {
      const b = beforeAmounts(c);
      truth(
        "Collateral Ratio before",
        before,
        b.price > 0 && b.coll > 0 && b.debt > 0 ? ((b.coll * b.price) / b.debt) * 100 : null,
      );
    }
    // "574.98 BOLD / year interest"; "+ 0.30% management fee · 86.25 BOLD / year".
    const feeAt = rest.findIndex((r) => /[\d.]+% management fee/.test(r));
    rest.forEach((r, i) => {
      const yearly = /([\d,]+\.\d+) \S+ \/ year/.exec(r);
      if (i === feeAt) card.push(`${/([\d.]+)%/.exec(r)[1]}%`);
      else if ((feeAt < 0 || i !== feeAt + 1) && yearly && rateAfter != null)
        truth("Yearly interest", yearly[1], (debtAfter * rateAfter) / 100);
    });
    // The fee's yearly figure sits in the next " · " part.
    const feeYear = feeAt >= 0 ? /([\d,]+\.\d+) \S+ \/ year/.exec(rest[feeAt + 1] ?? "") : null;
    if (feeAt >= 0 && feeYear) {
      const printed = /([\d.]+)%/.exec(rest[feeAt])[1];
      const pct = Number(printed);
      // At the fee's printed precision: half its last place on the debt.
      const dec = printed.split(".")[1]?.length ?? 0;
      const slack = (debtAfter * 0.5 * 10 ** -dec) / 100;
      const want = (debtAfter * pct) / 100;
      const got = Number(feeYear[1].replace(/,/g, ""));
      state.push({ what: "Yearly fee", printed: feeYear[1], truth: want, ok: Math.abs(got - want) <= slack + 0.005 });
    }
  }
  return { card, state, found: c != null };
}

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
    // T2 is the event sheet (ui-jobs 330), its breakdown on on the event
    // page: the copy waits for its layers.
    await card
      .locator('[data-sheet][data-sheet-breakdown="on"] [data-sheet-layer]')
      .first()
      .waitFor({ state: "attached", timeout: 60_000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    // The event page stands the explanation (T3) open above the sheet, with no
    // tab strip (ui-jobs 370); P2 reads it.
    await card
      .locator('[data-anatomy="T3"]')
      .first()
      .waitFor({ state: "attached", timeout: 30_000 })
      .catch(() => {});
    // Copy for LLM is the last button of the actions row under the side
    // column's title (ui-jobs 291).
    const copyBtn = page.locator('[data-event-page-actions] [data-menu-item="copy-for-llm"]').first();
    await copyBtn.waitFor({ timeout: 30_000 });
    // A press before hydration is lost: pressed until the copy confirms.
    const copied = page.locator('[data-menu-item="copy-for-llm"][data-copied]').first();
    for (let i = 0; i < 6 && !(await copied.count()); i++) {
      await copyBtn.click();
      await copied.waitFor({ timeout: 5_000 }).catch(() => {});
    }
    await copied.waitFor({ timeout: 5_000 });
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
    // (fixtures.json), so a line that says "today" or "the latest block's
    // price" is compared without its dollar figures.
    const today = (t) =>
      t
        .split("\n")
        .map((l) => (/\btoday\b|latest block/.test(l) ? l.replace(/[−+]?\$[\d,]+/g, "$…") : l))
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
    // The event page's sheet stands with its breakdown on and no switch
    // (ui-jobs 330): each side closes on its total after the event, so P3
    // reads a Collateral or Debt line of L2 from its after side.
    const t2 = await card.innerText();
    const l4 = l4Runs(copy);
    const bullets = l4.flatMap((r) => r.bullets);
    // The first sentence is the page's title (P4); the pane opens on the second.
    const [lead, ...paneBullets] = bullets;
    const missing = inOrder(norm(t2), paneBullets.map(norm));
    check(
      `${label}: L4 after its first sentence is the card's Explanation (${paneBullets.length} bullets)`,
      bullets.length > 0 && !missing,
      missing ?? "",
    );
    const headings = l4.map((r) => r.heading).filter(Boolean);
    const paneHeadings = await card
      .locator('[data-anatomy="T3"] [data-explain-group] > h4')
      .evaluateAll((els) => els.map((el) => el.textContent.trim()));
    // Each heading's bullets sit in its section; the first run's first bullet
    // is the title.
    const underRight = await card.locator('[data-anatomy="T3"] [data-explain-group]').evaluateAll(
      (els, runs) =>
        runs.every((r, i) => els[i] && r.bullets.every((b) => els[i].textContent.replace(/\s+/g, " ").includes(b))),
      l4
        .filter((r) => r.heading)
        .map((r, i) => ({ heading: r.heading, bullets: (i === 0 ? r.bullets.slice(1) : r.bullets).map(norm) })),
    );
    check(
      `${label}: L4's group headings are the pane's (${headings.length ? headings.join(" / ") : "flat"})`,
      JSON.stringify(headings) === JSON.stringify(paneHeadings) && (headings.length === 0 || underRight),
      `copy ${JSON.stringify(headings)}, pane ${JSON.stringify(paneHeadings)}${underRight ? "" : ", a bullet sits under another heading"}`,
    );

    // P3
    const l2 = section(copy, "L2").slice(1);
    const P3 = l2Checks(l2, await chainEvent(f.branch, f.troveId, e.id));
    // The sheet and its panels without the explanation, whose prose repeats figures.
    const panels = await card.evaluate((el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll('[data-anatomy="T3"]').forEach((n) => n.remove());
      document.body.appendChild(c);
      const text = c.innerText;
      c.remove();
      return text;
    });
    const missing2 = inOrder(panels, P3.card);
    check(`${label}: L2's figures the sheet draws are on the card (${P3.card.length})`, !missing2, missing2 ?? "");
    const wrong = P3.state.filter((x) => !x.ok);
    check(
      `${label}: L2's other figures equal the event's chain-truth state (${P3.state.length})`,
      P3.found && wrong.length === 0,
      P3.found
        ? wrong.map((x) => `${x.what} ${x.printed} ≠ ${x.truth}`).join("; ")
        : "the event is not in the timeline API",
    );

    // P4: the title is the Explanation's first sentence.
    const l1 = /\*\*L1\*\* (.*)/.exec(copy)?.[1] ?? "";
    const titles = await page.locator("h1[data-event-page-sentence]").allInnerTexts();
    const pageTitle = norm((titles[0] ?? "").replace(/\n/g, " "));
    const sentence = norm(lead ?? "");
    // After the sentence, only a liquidation's surplus chip ("0.1069 claimable").
    const surplus = /([\d.]+) \S+ claimable/.exec(l1)?.[1] ?? null;
    const rest = pageTitle.startsWith(sentence) ? pageTitle.slice(sentence.length).trim() : null;
    check(
      `${label}: the page's title is the Explanation's first sentence${surplus ? `, ${surplus} claimable beside it` : ""}`,
      titles.length === 1 &&
        sentence !== "" &&
        rest != null &&
        (surplus ? rest.startsWith(surplus) && /claim/.test(rest) : rest === ""),
      `title «${pageTitle.slice(0, 220)}», sentence «${sentence.slice(0, 120)}»`,
    );
    const pane = norm(
      await card
        .locator('[data-anatomy="T3"]')
        .first()
        .innerText()
        .catch(() => ""),
    );
    check(
      `${label}: the card's pane leaves the title's sentence out`,
      sentence !== "" && !pane.includes(sentence),
      pane.slice(0, 160),
    );
    // A batch's rate update draws no debt delta in its header (Miles, 14 Oct
    // 2026): the debt change is the sheet's, checked below.
    const rateUpdate = e.template.id === "liquity2.delegation.rate_update";
    const groups = l1.split(" · ");
    const debtGroup = rateUpdate ? (groups.find((g) => /^Debt [+−-]/.test(g)) ?? null) : null;
    if (debtGroup) {
      const delta = debtGroup.split(" ")[1];
      const header = norm(
        (
          (await page
            .locator("[data-anatomy=T1]")
            .first()
            .innerText()
            .catch(() => "")) || ""
        ).replace(/\n/g, " "),
      );
      check(`${label}: the header draws no debt delta (${delta})`, !header.includes(delta), header.slice(0, 160));
      const debtSide = await page
        .$eval('[data-sheet-side="debt"]', (d) => ({
          touched: d.getAttribute("data-sheet-touched"),
          rows: [...d.querySelectorAll("[data-sheet-row]")].map((r) => r.getAttribute("data-sheet-row")),
        }))
        .catch(() => null);
      // The debt moves by what accrued (interest, the management fee) or, on
      // a raise, by the event's own row: either is on the Debt side.
      check(
        `${label}: the debt change is on the sheet (an event row, or the interest and fee rows)`,
        debtSide != null && (debtSide.touched === "true" || debtSide.rows.some((r) => r === "interest" || r === "fee")),
        JSON.stringify(debtSide),
      );
    }
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed (${samples.length} events)`);
process.exit(fail > 0 || pass === 0 ? 1 : 0);

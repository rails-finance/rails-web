// Reading-contract scorer: how much explanation a position page draws at its
// top level, before any click. It reads the page as rendered, inside <main>,
// visible elements only, at 1440x900 and 390x844, and performs no clicks or
// hovers. Liquity V2's trove page is the reference.
//
// Run:
//   node scripts/score-reading-contract.mjs --pages pages.json --base http://localhost:3921 --out <dir>
//   [--only balancer-v3,liquity-v2]   score only the pages whose protocol matches
//   [--settle 2500]                   ms to wait after network idle
//
// pages.json: [{ "protocol": "balancer-v3", "chain": "ethereum", "kind": "position", "url": "/ethereum/..." }]
// Writes <out>/baseline.json and <out>/baseline.md.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const PAGES = arg("pages");
const BASE = (arg("base", "http://localhost:3921") ?? "").replace(/\/$/, "");
const OUT = arg("out", ".");
const ONLY = arg("only");
const SETTLE = Number(arg("settle", "2500"));
if (!PAGES) {
  console.error("usage: --pages pages.json --base URL --out DIR");
  process.exit(2);
}

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true },
];

// Runs in the page. Returns the raw reading of <main>.
function readMain() {
  const main = document.querySelector("main");
  if (!main) return { noMain: true };

  const hiddenCache = new Map();
  const INLINE = new Set(["inline", "inline-block", "inline-flex", "inline-grid", "contents", "ruby"]);

  // An element is hidden when it or an ancestor up to <main> is display:none,
  // visibility:hidden, opacity 0, inert, sr-only, or zero size.
  function hiddenEl(el) {
    if (!el || el === main.parentElement) return false;
    if (hiddenCache.has(el)) return hiddenCache.get(el);
    let h = false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") h = true;
    else if (Number(cs.opacity) === 0) h = true;
    // aria-hidden is not a test: the card's labels draw their text in an
    // aria-hidden span beside an sr-only twin, so it is on screen.
    else if (el.hasAttribute("inert") || el.hidden) h = true;
    else if (el.classList.contains("sr-only")) h = true;
    else if (cs.position === "absolute" && cs.clip && cs.clip !== "auto" && /rect\(0/.test(cs.clip)) h = true;
    else if (cs.display !== "contents") {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0 && cs.overflow !== "visible") h = true;
    }
    if (!h && el !== main) h = hiddenEl(el.parentElement);
    hiddenCache.set(el, h);
    return h;
  }

  // Text clipped away by a collapsed ancestor (max-height 0, grid 0fr) is hidden.
  function clippedAway(rect, el) {
    for (let a = el; a && a !== main.parentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/(hidden|clip|auto|scroll)/.test(cs.overflow + cs.overflowY + cs.overflowX)) {
        const r = a.getBoundingClientRect();
        if (
          rect.bottom <= r.top + 1 ||
          rect.top >= r.bottom - 1 ||
          rect.right <= r.left + 1 ||
          rect.left >= r.right - 1
        )
          return true;
      }
    }
    return false;
  }

  function textVisible(node) {
    const el = node.parentElement;
    if (!el || hiddenEl(el)) return false;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return false;
    return !clippedAway(rects[0], el);
  }

  function blockOf(el) {
    for (let a = el; a; a = a.parentElement) {
      if (a === main) return main;
      if (!INLINE.has(getComputedStyle(a).display)) return a;
    }
    return main;
  }

  // Two text nodes drawn apart (a gap of more than 2px, or a new line) read
  // as two words even with no space between them in the DOM.
  const rectsOf = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  };
  const apart = (a, b) => {
    if (!a || !b) return false;
    const last = a[a.length - 1];
    const first = b[0];
    return first.left - last.right > 2 || first.top >= last.bottom - 1;
  };

  const blocks = new Map(); // block element -> [{text, parent}]
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue || !n.nodeValue.trim()) continue;
    const p = n.parentElement;
    if (!p || ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(p.tagName)) continue;
    if (!textVisible(n)) continue;
    const b = blockOf(p);
    if (!blocks.has(b)) blocks.set(b, []);
    blocks.get(b).push({ text: n.nodeValue, parent: p, rects: rectsOf(n) });
  }

  const tidy = (s) =>
    s
      .replace(/\s+/g, " ")
      .replace(/\s+([.,;:?!%)])/g, "$1")
      .replace(/([($])\s+/g, "$1")
      .trim();

  const blockTexts = [];
  for (const [b, parts] of blocks) {
    let s = "";
    let prev = null;
    for (const { text, parent, rects } of parts) {
      const join = prev && (prev.parent !== parent || apart(prev.rects, rects));
      const glue = join && !/\s$/.test(s) && !/^\s/.test(text) ? " " : "";
      s += glue + text;
      prev = { parent, rects };
    }
    const t = tidy(s);
    if (!t) continue;
    blockTexts.push({
      text: t,
      inCard: !!b.closest("[data-position-card-shell]"),
      inEventRow: !!b.closest("[data-event-number], [data-group-frame], [data-spine-row]"),
    });
  }

  const visText = (el) => {
    if (!el || hiddenEl(el)) return "";
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let s = "";
    let prev = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim() || !textVisible(n)) continue;
      const rects = rectsOf(n);
      const join = prev && (prev.parent !== n.parentElement || apart(prev.rects, rects));
      s += (join && !/\s$/.test(s) && !/^\s/.test(n.nodeValue) ? " " : "") + n.nodeValue;
      prev = { parent: n.parentElement, rects };
    }
    return tidy(s);
  };
  // A value wraps when its text (icons beside it left out) spans more than
  // 1.5 of its line height.
  const wrapsOf = (valueEl) => {
    if (!valueEl || hiddenEl(valueEl)) return false;
    const rects = [];
    let textEl = null;
    const w = document.createTreeWalker(valueEl, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim() || !textVisible(n)) continue;
      textEl ??= n.parentElement;
      const range = document.createRange();
      range.selectNodeContents(n);
      rects.push(...[...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0));
    }
    if (!rects.length) return false;
    const cs = getComputedStyle(textEl);
    const lh = cs.lineHeight === "normal" ? parseFloat(cs.fontSize) * 1.2 : parseFloat(cs.lineHeight);
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return bottom - top > lh * 1.5;
  };

  // The card's stats, from two hooks (components/shared/position-card.tsx and
  // position-card-panel.tsx). A headline, `[data-card-head]`: the label is its
  // first child, the value the next child that is not `data-card-usd` or
  // `data-card-sub`. A panel stat, `[data-panel-row]`: the label is the
  // <dt>'s heading (its sub line is the <dt>'s `span.block`), the value the <dd>.
  const heads = [];
  for (const head of main.querySelectorAll("[data-card-head]")) {
    if (hiddenEl(head)) continue;
    const kids = [...head.children];
    const valueEl = kids.slice(1).find((k) => !k.hasAttribute("data-card-usd") && !k.hasAttribute("data-card-sub"));
    heads.push({
      kind: "head",
      head: head.getAttribute("data-card-head"),
      label: visText(kids[0]),
      value: visText(valueEl),
      sub: visText(head.querySelector("[data-card-sub]")),
      wraps: wrapsOf(valueEl),
    });
  }
  for (const row of main.querySelectorAll("[data-panel-row]")) {
    if (hiddenEl(row)) continue;
    const dt = row.querySelector("dt");
    const dd = row.querySelector("dd");
    const subEl = dt?.querySelector(":scope > span.block");
    const full = visText(dt);
    const sub = visText(subEl);
    heads.push({
      kind: "panel",
      head: row.getAttribute("data-panel-row"),
      label: sub && full.endsWith(sub) ? full.slice(0, -sub.length).trim() : full,
      value: visText(dd),
      sub,
      wraps: wrapsOf(dd),
    });
  }

  const text = document.body.innerText || "";
  return {
    blocks: blockTexts,
    heads,
    hasCard: main.querySelector('[data-position-card-shell][data-skel-section="detail-card"]')
      ? "detail"
      : main.querySelector("[data-position-card-shell]")
        ? "listing"
        : null,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    errorPage:
      /This page could not be found|Application error|Unhandled Runtime Error|Internal Server Error/.test(text) ||
      /^\s*404\b/m.test(main.innerText || ""),
  };
}

// ---- scoring (Node side) ----

const words = (s) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
const hasDigit = (s) => /\d/.test(s);

// A figure or a token symbol: "1,234.5", "$12", "ETH", "wstETH", "0x12…ab", "+3.1%".
const isFigureToken = (w) =>
  /\d/.test(w) ||
  (/^[A-Z][A-Za-z0-9.]{1,7}$/.test(w) && /[A-Z].*[A-Z]|^[A-Z]{2,}/.test(w)) ||
  /^[a-z]+[A-Z]{2,}/.test(w);

// A timeline or event row: figures plus a two or three word action label.
function isFigureRow(s) {
  const ws = words(s);
  const plain = ws.filter((w) => !isFigureToken(w.replace(/[,.;:()]+$/g, "").replace(/^[(]/, "")));
  return plain.length <= 3 && plain.length < ws.length;
}

// Prose: 6+ words ending in "." or "?" or holding ". ", or 10+ words that are
// not figures, or a short block written as a sentence ("Your part: 24.94,
// against 21.27.": 3+ words, a full stop, 2+ words that are not figures). A
// row of figures with a short action label and no full stop is an event row.
function isProse(s) {
  const ws = words(s);
  const plain = ws.filter((w) => !isFigureToken(w.replace(/[,.;:()]+$/g, "").replace(/^[(]/, "")));
  const sentence = /[.?]$/.test(s) || /[.?] /.test(s);
  if (!sentence && isFigureRow(s)) return false;
  if (ws.length >= 6 && sentence) return true;
  if (plain.length >= 10) return true;
  return sentence && ws.length >= 3 && plain.length >= 2;
}

function sentencesOf(s) {
  return s
    .split(/(?<=[.?!])\s+(?=[A-Z0-9"'“(])/)
    .map((x) => x.trim())
    .filter((x) => words(x).length > 0);
}

const SECOND = /\b(you|your|yours)\b/i;
const RAILS = /\bRails(?:'s|’s)?\b/;
const CONTRAST = /, (against|not) /;

function score(desktop, phone) {
  const blocks = [];
  const seen = new Set();
  for (const b of desktop.blocks) {
    if (seen.has(b.text)) continue;
    seen.add(b.text);
    blocks.push(b);
  }
  const prose = blocks.filter((b) => isProse(b.text));
  const sentences = prose.flatMap((b) => sentencesOf(b.text));
  const labels = desktop.heads.map((h) => {
    const n = words(h.label).length;
    const punct = /[,:.]/.test(h.label);
    return { label: h.label, words: n, punctuated: punct, digit: hasDigit(h.label), long: n > 3 || punct };
  });
  const isPlaceholder = (v) => /^[—–-]$/.test(v.trim()) || v.trim() === "";
  const phraseValues = desktop.heads.filter((h) => h.value && !hasDigit(h.value) && !isPlaceholder(h.value));
  const all = blocks.map((b) => b.text);
  return {
    sentences: { count: sentences.length, strings: sentences },
    labels: {
      list: labels.map((l) => l.label),
      detail: labels,
      longOrPunctuated: labels.filter((l) => l.long).length,
      longOrPunctuatedList: labels.filter((l) => l.long).map((l) => l.label),
    },
    values: {
      heads: desktop.heads.map((h) => ({ label: h.label, value: h.value, sub: h.sub })),
      phrase: phraseValues.length,
      phraseList: phraseValues.map((h) => `${h.label}: ${h.value}`),
      wrappedDesktop: desktop.heads.filter((h) => h.wraps).length,
      wrappedPhone: phone ? phone.heads.filter((h) => h.wraps).length : null,
      wrappedDesktopList: desktop.heads.filter((h) => h.wraps).map((h) => `${h.label}: ${h.value}`),
      wrappedPhoneList: phone ? phone.heads.filter((h) => h.wraps).map((h) => `${h.label}: ${h.value}`) : [],
    },
    secondPerson: all.filter((s) => SECOND.test(s)),
    railsSubject: sentences.filter((s) => RAILS.test(s)),
    contrastForms: all.filter((s) => CONTRAST.test(s)),
    words: {
      total: all.reduce((n, s) => n + words(s).length, 0),
      prose: prose.reduce((n, b) => n + words(b.text).length, 0),
    },
    overflowX390: phone ? phone.overflowX : null,
    hasCard: desktop.hasCard,
  };
}

async function visit(browser, vp, url) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.isMobile,
    hasTouch: !!vp.hasTouch,
  });
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const status = res ? res.status() : 0;
    let idle = true;
    await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => (idle = false));
    await page.waitForTimeout(SETTLE);
    const reading = await page.evaluate(readMain);
    return { status, idle, finalUrl: page.url(), ...reading };
  } catch (e) {
    return { error: String(e.message || e).split("\n")[0] };
  } finally {
    await ctx.close();
  }
}

const list = JSON.parse(fs.readFileSync(PAGES, "utf8")).filter(
  (p) => !ONLY || ONLY.split(",").some((o) => p.protocol === o || p.url.includes(o)),
);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const p of list) {
  const url = /^https?:/.test(p.url) ? p.url : BASE + p.url;
  process.stdout.write(`${p.protocol} ${p.chain ?? ""} … `);
  const [d, m] = [await visit(browser, VIEWPORTS[0], url), await visit(browser, VIEWPORTS[1], url)];
  let failure = null;
  if (d.error) failure = d.error;
  else if (d.status !== 200) failure = `HTTP ${d.status}`;
  else if (d.noMain) failure = "no <main>";
  else if (d.errorPage) failure = "error page";
  else if (!d.hasCard) failure = "no shared position card, so labels and values are unread";
  else if (d.hasCard === "listing") failure = "listing cards only, no detail card";
  const row = { ...p, url, failure, idle: d.idle !== false };
  if (!d.error && !d.noMain) Object.assign(row, score(d, m.error || m.noMain ? null : m));
  results.push(row);
  console.log(failure ? `FAIL ${failure}` : `${row.sentences.count} sentences`);
}
await browser.close();

fs.writeFileSync(
  path.join(OUT, "baseline.json"),
  JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2),
);

// ---- markdown ----
const cap = (xs, n = 12) => (xs.length > n ? [...xs.slice(0, n), `… and ${xs.length - n} more`] : xs);
const esc = (s) => String(s).replace(/\|/g, "\\|");
const ok = results.filter((r) => r.sentences);
ok.sort((a, b) => b.sentences.count - a.sentences.count || b.words.prose - a.words.prose);
const lines = [];
lines.push(
  `# Reading-contract baseline`,
  ``,
  `Base ${BASE}, ${new Date().toISOString().slice(0, 16)}Z. ${ok.length} pages scored.`,
  ``,
);
lines.push(
  `| Protocol | Chain | Sentences | Prose words | Long or punctuated labels | Phrase values | Wrapped values (desktop / phone) | Second person | Rails as subject | Contrast forms | Overflow at 390 |`,
  `|---|---|---:|---:|---:|---:|---|---:|---:|---:|---|`,
);
for (const r of ok)
  lines.push(
    `| ${r.protocol}${r.failure ? ` (${esc(r.failure)})` : ""} | ${r.chain ?? ""} | ${r.sentences.count} | ${r.words.prose} | ${r.labels.longOrPunctuated} of ${r.labels.list.length} | ${r.values.phrase} | ${r.values.wrappedDesktop} / ${r.values.wrappedPhone ?? "?"} | ${r.secondPerson.length} | ${r.railsSubject.length} | ${r.contrastForms.length} | ${r.overflowX390 ? "yes" : r.overflowX390 === false ? "no" : "?"} |`,
  );
lines.push(``, `## Per page`, ``);
for (const r of ok) {
  lines.push(`### ${r.protocol} (${r.chain ?? ""})`, ``, `\`${r.url.replace(BASE, "")}\``, ``);
  lines.push(`- Labels: ${r.labels.list.length ? r.labels.list.map((l) => `"${l}"`).join(", ") : "none found"}`);
  const section = (name, xs) => {
    if (!xs.length) return;
    lines.push(`- ${name}:`);
    for (const x of cap(xs)) lines.push(`  - ${x}`);
  };
  section("Sentences", r.sentences.strings);
  section("Long or punctuated labels", r.labels.longOrPunctuatedList);
  section("Phrase values", r.values.phraseList);
  section("Wrapped values, desktop", r.values.wrappedDesktopList);
  section("Wrapped values, phone", r.values.wrappedPhoneList);
  section("Second person", r.secondPerson);
  section("Rails as subject", r.railsSubject);
  section("Contrast forms", r.contrastForms);
  lines.push(``);
}
const failed = results.filter((r) => r.failure);
if (failed.length) {
  lines.push(`## Failed to score`, ``);
  for (const r of failed)
    lines.push(`- ${r.protocol} (${r.chain ?? ""}): ${r.failure}. \`${r.url.replace(BASE, "")}\``);
  lines.push(``);
}
const skippedFile = path.join(path.dirname(PAGES), "skipped.json");
if (fs.existsSync(skippedFile)) {
  lines.push(`## Skipped`, ``);
  for (const s of JSON.parse(fs.readFileSync(skippedFile, "utf8")))
    lines.push(`- ${s.protocol} (${s.chain}): ${s.reason}`);
  lines.push(``);
}
fs.writeFileSync(path.join(OUT, "baseline.md"), lines.join("\n"));
console.log(`wrote ${path.join(OUT, "baseline.json")} and baseline.md`);

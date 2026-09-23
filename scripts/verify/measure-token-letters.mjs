// Token-mark census on a RENDERED page — how many chips draw a real brand mark
// and how many end at the initial-letter glyph.
//
// The chip (components/shared/token-chip-icon.tsx) resolves a mark from
// (chain, address): local PNG → Trust Wallet → DeFiLlama → UnknownTokenSvg, the
// grey circle carrying the symbol's first character. Given only a symbol it has
// to look the address up in the hand-kept ~88-entry table in
// lib/shared/token-addresses.ts, which by construction cannot name the assets of
// a permissionless protocol — so a call site that drops the address it already
// holds turns every unlisted asset into a letter. scripts/audit-token-icons.mjs
// asks the CDNs which assets COULD resolve; this asks a page which ones DID.
//
// Two counts, always reported together, and that is the point. An earlier pass
// at this counted a `[data-unknown-token]` attribute UnknownTokenSvg does not
// render, matched nothing, and reported 0 letters on a page carrying 207. A
// selector that silently matches nothing looks exactly like a clean page unless
// the denominator is beside it, so every line here prints letters / total and
// a page that yields no chips at all is reported as EMPTY and exits non-zero.
//
// What each selector matches, and why it is the one that survives a refactor:
//   letters — span.bg-marker whose whole text is a single character. bg-marker
//             is UnknownTokenSvg's own background token and nothing else in the
//             chip vocabulary uses it; the single-character test excludes any
//             other marker-toned span that might acquire the class later.
//   marks   — img.shrink-0.rounded-full, the chip's own class list, that has
//             actually PAINTED (naturalWidth > 0). Narrower than
//             img.rounded-full, which also catches avatars and article
//             thumbnails on the marketing pages.
//   broken  — one of those images that reports `complete` with no intrinsic
//             width: it failed and has not advanced to the next source. Its own
//             category because it is neither of the other two and it is the
//             worst of the three to look at — a blank square where a letter
//             would at least have said something. Counting it as a mark is what
//             let a page with ten blank PT chips read as fully resolved.
//
// Each letter is also attributed to the surface that drew it — the economics
// tower, an event card's spine, the rest of an event card, or the page around
// them — because "107 letters remain" is only actionable once you know which
// component is still resolving a chip from a bare symbol.
//
//   BASE=http://localhost:3020 node scripts/verify/measure-token-letters.mjs
//   BASE=… node scripts/verify/measure-token-letters.mjs /ethereum/morpho/…
//   BASE=… node scripts/verify/measure-token-letters.mjs --shots <dir> --tag before
//
// With paths on the command line it measures those instead of the default set.
// With --shots it also writes PNGs into <dir>: a full page plus tight crops of
// the economics tower and the first run of timeline rows, since a full-page
// shot at 16px chips is unreadable. --tag names the half of a before/after
// pair; the viewport, the scroll offset and the settle are identical on both
// runs so the two shots diff by eye.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const NAV = { waitUntil: "networkidle", timeout: 300000 };

// The default set is the surfaces this census exists for. Every Morpho fixture
// is a market whose assets the house table does NOT name — a curated-roster
// market resolves everything from the symbol alone and would report a clean
// page no matter what the call sites do.
const DEFAULT_PATHS = [
  // Morpho L1, apxUSD / PT-apyUSD-5NOV2026 — a Pendle PT against a synthetic
  // dollar, neither in the table, on a position with a deep timeline.
  "/ethereum/morpho/ebd23a871b52e0a8c92bd719f4413600101b69e946cb72923b3a33fb5bc6ec85-0xebb870a0aaaa7bc55ead925d03a4af4a8db79a03",
  // Morpho L1, EURCV / wstETH — one side listed, one side not, so a run of
  // events alternates resolved and unresolved chips.
  "/ethereum/morpho/7a25fb17b8bd83a934ad87d9d1725188fc129992ca816f3145b4ab7f673c98c3-0x166ce42df5f4baa94abc5b62c60dab1b3c73d2a3",
  // Morpho Base, USDC / stkWELL — the same permissionless problem on the other
  // chain. Base is mostly covered (scripts/audit-token-icons.mjs generated its
  // 50-symbol table from the rosters), so an unlisted Base asset is rare and
  // this is one of the three open positions that has one.
  "/base/morpho/0xfe3db17e0a568c3f04daff711d87175fa466fcac",
  // Aave V3 — a curated roster: its symbols are all in the table, so a letter
  // here belongs to a shared surface and nothing else.
  "/ethereum/aave-v3/0x11111605b53ecef22726df86881e4d6d40b5ca11",
  // Spark — likewise curated, and the deepest indexed wallet, so the timeline
  // is long enough for a spine regression to show up.
  "/ethereum/spark/0x1601843c5e9bc251a3272907010afa41fa18347e",
];

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const SHOTS = flag("--shots");
const TAG = flag("--tag") ?? "shot";
// A flag's own value can be an absolute path (--shots /tmp/…), so drop each
// flag and the token after it before reading the rest as page paths.
const flagged = new Set();
for (const name of ["--shots", "--tag"]) {
  const i = argv.indexOf(name);
  if (i >= 0) {
    flagged.add(i);
    flagged.add(i + 1);
  }
}
const paths = argv.filter((a, i) => a.startsWith("/") && !flagged.has(i));
const targets = paths.length > 0 ? paths : DEFAULT_PATHS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/** A short, stable filename for a path — the protocol plus the tail of its id,
 *  so a before/after pair shares a slug and sorts together. */
function slug(path) {
  const parts = path.split("?")[0].split("/").filter(Boolean);
  const proto = parts.slice(0, 2).join("-");
  const id = (parts[2] ?? "page").slice(0, 10) + (parts[3] ? `-${parts[3].slice(0, 8)}` : "");
  return `${proto}-${id}`;
}

/** Read every chip on the page: the three counts, and for each letter or broken
 *  image the surface that drew it plus its row's text — the only handle on
 *  WHICH asset missed, since UnknownTokenSvg renders the initial, not the
 *  symbol. (A broken image does carry its alt, so those name themselves.) */
async function census(page) {
  return page.evaluate(() => {
    const letters = [...document.querySelectorAll("span.bg-marker")].filter(
      (el) => (el.textContent ?? "").trim().length === 1,
    );
    const imgs = [...document.querySelectorAll("img.shrink-0.rounded-full")];
    const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0);
    const marks = imgs.length - broken.length;
    // Which component drew this chip. The two data-skel-section anchors are
    // real markers the skeleton layer already depends on; the spine is told
    // apart inside an event card by its own stretch column, which is the only
    // self-stretch box in that subtree.
    const surface = (el) => {
      if (el.closest('[data-skel-section="detail-economics"]')) return "tower";
      if (el.closest('[data-skel-section="detail-event"]')) {
        return el.closest(".self-stretch") ? "event-spine" : "event-card";
      }
      return "page";
    };
    const label = (el) => {
      // Walk out until an ancestor carries text beyond the letter itself; the
      // chip's own row names the asset even though the glyph does not.
      let n = el.parentElement;
      for (let i = 0; i < 5 && n; i++, n = n.parentElement) {
        const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
        if (t.length > 1) return t.slice(0, 60);
      }
      return "";
    };
    return {
      letters: letters.length,
      marks,
      broken: broken.length,
      detail: [
        ...letters.map((el) => ({
          initial: (el.textContent ?? "").trim(),
          surface: surface(el),
          near: label(el),
        })),
        ...broken.map((el) => ({
          initial: "BROKEN",
          surface: surface(el),
          near: el.getAttribute("alt") ?? "",
        })),
      ],
    };
  });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

/** Load a page and settle it: walk to the bottom so anything mounting on scroll
 *  is drawn, then return to the top so both halves of a screenshot pair are
 *  taken from the same offset. */
async function load(path) {
  await page.goto(`${BASE}${path}`, NAV);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 800) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
  // Settling a chip page takes TWO conditions, and either one alone reports a
  // page that is not there yet.
  //
  //   • A chip walks its source list on each onError, so a mark that really
  //     exists can still be a letter while the CDN is slow, and one no CDN
  //     hosts only becomes a letter once every tier has 404'd. The same page
  //     measured seconds apart differed by 11 letters of 76.
  //   • An <img> still in flight is neither a letter nor a drawn mark: it
  //     paints as broken-image alt text, so a screenshot taken then shows a
  //     wall of clipped symbol names over a page the census scores as fully
  //     resolved.
  //
  // And they interleave, because a failed <img> reports `complete` one React
  // commit BEFORE the letter that replaces it exists. Alternate instead: wait
  // for every image to finish, give React a beat to commit, read the letters,
  // and require THREE equal reads — the chain plateaus, and a run that stops on
  // the plateau under-reports precisely the assets no CDN carries.
  const allComplete = () =>
    page
      .waitForFunction(
        () => [...document.querySelectorAll("img.shrink-0.rounded-full")].every((i) => i.complete),
        undefined,
        { timeout: 30000 },
      )
      .catch(() => {});
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 25; i++) {
    await allComplete();
    await page.waitForTimeout(1200);
    const n = await page.evaluate(
      () =>
        [...document.querySelectorAll("span.bg-marker")].filter((el) => (el.textContent ?? "").trim().length === 1)
          .length,
    );
    stable = n === last ? stable + 1 : 0;
    last = n;
    if (stable >= 2) break;
  }
  await allComplete();
}

/** Full page plus the two crops worth reading at 16px: the economics tower and
 *  the first run of event cards. */
async function shoot(path) {
  const base = `${SHOTS}/${slug(path)}`;
  await page.screenshot({ path: `${base}-${TAG}.png`, fullPage: true });
  const tower = page.locator('[data-skel-section="detail-economics"]').first();
  if (await tower.count()) await tower.screenshot({ path: `${base}-tower-${TAG}.png` });
  const events = page.locator('[data-skel-section="detail-event"]');
  if (await events.count()) {
    const first = await events.first().boundingBox();
    const nth = await events.nth(Math.min((await events.count()) - 1, 5)).boundingBox();
    if (first && nth) {
      await page.screenshot({
        path: `${base}-events-${TAG}.png`,
        clip: { x: first.x, y: first.y, width: first.width, height: Math.min(1400, nth.y + nth.height - first.y) },
      });
    }
  }
}

let empty = 0;
const rows = [];
for (const path of targets) {
  // The upstream index rate-limits, and a 429 renders a page with no chips at
  // all — which would otherwise read as a clean page. Retry before believing a
  // zero, and still say EMPTY if it persists rather than passing silently.
  let letters = 0;
  let marks = 0;
  let broken = 0;
  let detail = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    await load(path);
    ({ letters, marks, broken, detail } = await census(page));
    if (letters + marks + broken > 0) break;
    await page.waitForTimeout(8000);
  }
  const total = letters + marks + broken;
  if (total === 0) empty++;
  else if (SHOTS) await shoot(path);
  rows.push({ path, letters, marks, broken, total, detail });
  const pct = total > 0 ? ((marks / total) * 100).toFixed(1) : "—";
  const bySurface = new Map();
  for (const d of detail) bySurface.set(d.surface, (bySurface.get(d.surface) ?? 0) + 1);
  const surfaces = [...bySurface.entries()].map(([s, n]) => `${s} ${n}`).join(", ");
  console.log(
    `${total === 0 ? "EMPTY" : "     "} ${String(letters).padStart(4)} letters ${String(broken).padStart(3)} broken / ${String(total).padStart(4)} chips  (${pct}% resolved)  ${path}`,
  );
  if (surfaces) console.log(`        by surface: ${surfaces}`);
  // Cluster the letters so a report can say WHICH assets still miss.
  const byNear = new Map();
  for (const d of detail) {
    const k = `${d.surface}  ${d.initial}  ${d.near}`;
    byNear.set(k, (byNear.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...byNear.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
    console.log(`        ×${String(n).padStart(3)}  ${k}`);
  }
}

console.log("");
const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
console.log(
  `TOTAL  ${sum((r) => r.letters)} letters, ${sum((r) => r.broken)} broken / ${sum((r) => r.total)} chips over ${rows.length} pages`,
);
if (pageErrors.length > 0) console.log(`page errors: ${pageErrors.length}\n  ${pageErrors.slice(0, 3).join("\n  ")}`);
if (empty > 0)
  console.log(
    `WARNING  ${empty} page(s) drew no chips at all — the selector matched nothing, which is NOT a clean page.`,
  );

await browser.close();
process.exit(empty > 0 ? 1 : 0);

// A redemption's and a liquidation's legs on the spine (rails-ops TO-DO-ui-jobs
// 250, set A).
// ---------------------------------------------------------------------------
// The spine draws a warning event's legs as nodes, one under the other: the
// token, "→", and the magnitude in the event's tone (caution orange for a
// redemption, red-500 for a liquidation). T1 reads the kind word alone while
// Timeline values is on at ≥640 px, and states the labelled legs after it with
// values off. The row stands on the band (`bg-band`); an Add row does not.
//
//   A. Story Trove, 1280, values on: a redemption row's two legs, the word, the band.
//   B. Story Trove, 1280, values off: the head states the legs.
//   C. Story Trove, 390, spine view: two legs above the caption.
//   D. Liquity V1, 1280: a redemption the same.
//   E. Compound V2 liquidation event page, 1280: the critical shape.
//
// Run:  BASE=http://localhost:3115 node scripts/verify/verify-spine-legs.mjs

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";

const TROVE =
  "/ethereum/liquity-v2/trove/WETH/102247037494986730506041632222868001124387697185626929998095238518734059870154";
const V1 = "/ethereum/liquity-v1/0x017eff261795b59a61590d6a419ff13d466883aa?epoch=1";
const CV2 =
  "/ethereum/compound-v2/0x909b443761bbd7fbb876ecde71a37e1433f6af6f/event/liquidation:53e09adb77d1e3ea593c933a85bd4472371e03da12e3fec853b5bc7fac50f3e4:2";

let checked = 0;
let failures = 0;
function check(name, ok, detail = "") {
  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const browser = await chromium.launch();

async function open(width, path, { valuesOff = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 1000 },
    colorScheme: "dark",
    extraHTTPHeaders: bypassHeaders(),
  });
  if (valuesOff)
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("timeline-display-v3", JSON.stringify({ showTimelineValues: false }));
      } catch {}
    });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .locator('[data-anatomy="T1"], [data-spine-leg]')
    .first()
    .waitFor({ timeout: 180000 })
    .catch(() => {});
  await page.waitForTimeout(3000);
  return { ctx, page, errors };
}

/** Open the story Trove's newest redemption folder. */
async function openFolder(page, text = /^Cleared/) {
  const folder = page.getByText(text).first();
  if (await folder.count()) await folder.click().catch(() => {});
  await page
    .locator("[data-spine-adverse]")
    .first()
    .waitFor({ timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
}

/** The first adverse row: its legs (text, colour, an arrow pointing right),
 *  its head's visible words and images, its background and the band's. */
const readRow = (page, n = 0) =>
  page.evaluate((n) => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
    };
    const col = [...document.querySelectorAll("[data-spine-adverse]")].filter(vis)[n];
    if (!col) return null;
    const card = col.closest('[data-skel-section="detail-event"]');
    const t1 = card?.querySelector('[data-anatomy="T1"]');
    const meta = t1?.querySelector(".evt-meta");
    const words = t1
      ? [...t1.querySelectorAll("span")]
          .filter((e) => vis(e) && !e.querySelector("span") && !(meta && meta.contains(e)))
          .map((e) => e.textContent.trim())
          .filter(Boolean)
      : [];
    const imgs = t1 ? [...t1.querySelectorAll("img")].filter((e) => vis(e) && !(meta && meta.contains(e))).length : 0;
    const word = t1?.querySelector("[data-adverse-word]");
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--surface-band)";
    document.body.appendChild(probe);
    const band = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const legs = [...col.querySelectorAll("[data-spine-leg]")].map((l) => {
      const v = l.querySelector("[data-spine-leg-value]");
      const arrow = l.querySelector("svg.text-rb-500");
      return {
        text: v ? v.textContent.trim() : "",
        color: v ? getComputedStyle(v).color : null,
        arrowRight: !!arrow && /rotate\(90deg\)/.test(arrow.getAttribute("style") ?? ""),
        icon: !!l.querySelector("img, svg:not(.text-rb-500)"),
        top: l.getBoundingClientRect().top,
      };
    });
    const caption = col.querySelector("[data-spine-caption]");
    return {
      tone: col.getAttribute("data-spine-adverse"),
      legs,
      words,
      imgs,
      wordColor: word ? getComputedStyle(word).color : null,
      bg: card ? getComputedStyle(card).backgroundColor : null,
      band,
      captionTop: caption ? caption.getBoundingClientRect().top : null,
    };
  }, n);

/** An orange: red well above blue, green between. A red: red well above both. */
const rgb = (c) =>
  (c ?? "")
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number) ?? [];
const isOrange = (c) => {
  const [r, g, b] = rgb(c);
  return r > 200 && g > 70 && g < 180 && b < 80;
};
const isRed = (c) => {
  if (/oklch/.test(c ?? "")) {
    const [, , h] = rgb(c);
    return h < 40 || h > 340;
  }
  const [r, g, b] = rgb(c);
  return r > 200 && g < 110 && b < 110;
};
const MAG = /^[<\d][\d.,]*[KMB]?$/;

// A. Story Trove at 1280, values on.
{
  const { ctx, page, errors } = await open(1280, TROVE);
  await openFolder(page);
  const row = await readRow(page);
  check("A1. a redemption row is drawn", !!row && row.tone === "caution", JSON.stringify(row?.tone));
  check(
    "A2. two spine nodes, each with → and a magnitude",
    !!row && row.legs.length === 2 && row.legs.every((l) => l.arrowRight && MAG.test(l.text)),
    JSON.stringify(row?.legs.map((l) => [l.text, l.arrowRight])),
  );
  check(
    "A3. the magnitudes are in the caution orange",
    !!row && row.legs.every((l) => isOrange(l.color)),
    JSON.stringify(row?.legs.map((l) => l.color)),
  );
  check(
    "A4. the head reads Redemption alone and holds no img",
    !!row && row.words.length === 1 && row.words[0] === "Redemption" && row.imgs === 0,
    JSON.stringify(row?.words),
  );
  check("A5. the word is in the caution orange", !!row && isOrange(row.wordColor), row?.wordColor ?? "");
  check("A6. the row stands on the band", !!row && row.bg === row.band, `${row?.bg} vs ${row?.band}`);
  const addBg = await page.evaluate(() => {
    const t1 = [...document.querySelectorAll('[data-anatomy="T1"]')].find((t) => /^Add\b/.test(t.innerText.trim()));
    const card = t1?.closest('[data-skel-section="detail-event"]');
    return card ? getComputedStyle(card).backgroundColor : null;
  });
  check("A7. an Add row has no band", addBg === "rgba(0, 0, 0, 0)", String(addBg));
  check("A8. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// B. Values off: the head states the legs, labelled.
{
  const { ctx, page, errors } = await open(1280, TROVE, { valuesOff: true });
  await openFolder(page);
  const row = await readRow(page);
  check(
    "B1. values off: Redemption Cleared … Reduced … with the icons",
    !!row &&
      row.words[0] === "Redemption" &&
      row.words.includes("Cleared") &&
      row.words.includes("Reduced") &&
      row.imgs >= 2,
    JSON.stringify(row?.words),
  );
  check(
    "B2. values off: the spine keeps the two nodes and drops the figures",
    !!row && row.legs.length === 2 && row.legs.every((l) => l.text === ""),
    JSON.stringify(row?.legs.map((l) => l.text)),
  );
  check("B3. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// C. 390, the phone spine view.
{
  const { ctx, page, errors } = await open(390, `${TROVE}?timeline=spine`);
  await openFolder(page, /\d+ redemptions/);
  const row = await readRow(page);
  check(
    "C1. 390 spine view: two legs with their magnitudes",
    !!row && row.legs.length === 2 && row.legs.every((l) => MAG.test(l.text)),
    JSON.stringify(row?.legs.map((l) => l.text)),
  );
  check(
    "C2. 390 spine view: the legs stand above the caption",
    !!row && row.captionTop != null && row.legs.every((l) => l.top < row.captionTop),
    JSON.stringify({ legs: row?.legs.map((l) => l.top), caption: row?.captionTop }),
  );
  check("C3. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// D. Liquity V1 at 1280: a redemption the same shape (the surplus stays in the head).
{
  const { ctx, page, errors } = await open(1280, V1);
  const row = await readRow(page);
  check(
    "D1. Liquity V1: two legs with → and a magnitude, in the caution orange",
    !!row && row.legs.length === 2 && row.legs.every((l) => l.arrowRight && MAG.test(l.text) && isOrange(l.color)),
    JSON.stringify(row?.legs.map((l) => [l.text, l.color])),
  );
  check(
    "D2. Liquity V1: the head starts on Redemption and states no Cleared or Reduced",
    !!row && row.words[0] === "Redemption" && !row.words.includes("Cleared") && !row.words.includes("Reduced"),
    JSON.stringify(row?.words),
  );
  check("D3. Liquity V1: the band", !!row && row.bg === row.band, `${row?.bg} vs ${row?.band}`);
  check("D4. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// E. Compound V2's liquidation event page: the critical shape.
{
  const { ctx, page, errors } = await open(1280, CV2);
  const row = await readRow(page);
  check("E1. Compound V2: a critical row", !!row && row.tone === "critical", JSON.stringify(row?.tone));
  check(
    "E2. Compound V2: legs with → and a magnitude in red",
    !!row && row.legs.length >= 1 && row.legs.every((l) => l.arrowRight && MAG.test(l.text) && isRed(l.color)),
    JSON.stringify(row?.legs.map((l) => [l.text, l.color])),
  );
  check("E3. Compound V2: the word in red", !!row && isRed(row.wordColor), row?.wordColor ?? "");
  check("E4. Compound V2: the band", !!row && row.bg === row.band, `${row?.bg} vs ${row?.band}`);
  check("E5. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

await browser.close();
console.log(`\n${checked - failures}/${checked} passed`);
process.exit(failures > 0 || checked === 0 ? 1 : 0);

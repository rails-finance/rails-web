// Verify that no rendered copy tells a reader the BORROWER chose an interest
// rate when the rate is actually the interest-batch manager's to set.
//
// On a Liquity-V2-family Trove the annual rate is normally the owner's choice,
// but a BATCHED Trove has delegated rate control to a manager. The event header
// already takes care here ("Delegate rate change"); this checks the prose one
// layer down — the fork explainer bullet and the Learn-More modals.
//
// What it asserts:
//   §1 fork explainer, UNBATCHED (real chain data): the adjustTroveInterestRate
//      bullet reads "the borrower chooses it" — and does NOT carry the
//      delegate wording.
//   §2 fork explainer, BATCHED: the SAME page with the timeline response
//      rewritten so the rate event's ctx.isBatched is true. The bullet must
//      flip to the manager wording and the borrower wording must be GONE.
//      §1 and §2 are the two branches of one conditional — a pass on only one
//      of them would prove nothing about the switch.
//
//      ⚠️⚠️ The row is SYNTHESISED and has to be: a batched Trove's rate moves
//      on its batch, so the protocol emits no batched rate-adjust and no real
//      fixture for this branch exists. The injection is therefore the whole
//      instrument, and it USED TO BE `page.route()`, which stopped firing the
//      day this page began rendering on the server — the browser makes no
//      timeline request to intercept. It now injects through
//      ./injecting-proxy.mjs, which sits in FRONT of the dev server: the app
//      builds its own SSR fetch origin from the incoming Host header, so
//      driving the browser at the proxy routes the server's own read back
//      through it. The `patched > 0` assertion below was already here and is
//      what caught the rot — keep it.
//   §3 Liquity V2 "How Borrowing Works" modal (real data, on a BATCHED trove —
//      that modal also serves openTroveAndJoinBatch): its Interest-rate line
//      must name the delegation route, not assert the borrower alone sets it.
//   §4 the fork never-empty-floor modal's copy, asserted at module level: it
//      backs event types the explainer has no mechanic for, so no fixture on a
//      live page reaches it reliably.
//
// Assertions read innerText (NOT textContent): Tailwind's responsive `hidden`
// leaves elements in the DOM, so textContent would happily return the text of
// something the reader cannot see, and the check could never fail.
//
// Run: BASE=http://localhost:3021 node scripts/verify/verify-rate-authorship.mjs

import { chromium } from "playwright";

import { startInjectingProxy } from "./injecting-proxy.mjs";

const BASE = process.env.BASE ?? "http://localhost:3021";

// Ebisu stcUSD — a Trove with SEVEN adjustTroveInterestRate events, all
// unbatched (a batched Trove's rate moves on its batch, so the protocol emits
// no batched rate-adjust; §2 has to synthesise that row).
const FORK = {
  path: "/ethereum/ebisu/stcUSD/43954812466359090377167816180871282002520432921602860287120178718150993821939",
  api: "/api/ebisu/stcUSD/43954812466359090377167816180871282002520432921602860287120178718150993821939/timeline",
};

// A Liquity V2 trove that IS in a batch — the reader for whom "the borrower
// chooses the rate" was flatly untrue.
const V2_BATCHED =
  "/ethereum/liquity-v2/trove/WETH/30404411686890082603025828629969289056413589403947755681351563798146900259572";

// Semantic guards, not pinned literals: the copy has been reworded since the
// 2026-07-20 fix (now "the rate the borrower chooses" / "set by its batch
// manager rather than by the owner") and the point of this verifier is
// AUTHORSHIP, not phrasing — each regex accepts any wording that credits the
// right party and still goes red if the parties swap.
const BORROWER = /the (?:rate the )?borrower chooses(?: it)?/;
const DELEGATE =
  /(?:interest-)?batch manager (?:sets it on the owner|rather than by the owner)|set by its batch manager/;

let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log("  ok:", msg);
  else {
    console.log("  FAIL:", msg);
    failures++;
  }
};

const CARD_SEL = ".flex.w-full.items-start";
const MODAL_SEL = ".fixed.inset-0.z-\\[9999\\]";

/** Expand the event card whose header matches `labelRe`, open its explanation
 *  drawer, and return the card's innerText. Throws if no such card exists, or
 *  if the drawer never opened — an absent fixture must be a hard error, never a
 *  silently passing no-op (every "does NOT say X" assertion below would pass
 *  vacuously against empty text). */
async function expandCardWithLabel(page, labelRe) {
  const found = await page.evaluate(
    ({ reSrc, sel }) => {
      document.querySelectorAll("[data-verify-target]").forEach((e) => e.removeAttribute("data-verify-target"));
      const re = new RegExp(reSrc, "i");
      // Scoped to an event CARD: the timeline's filter menu carries the same
      // action names, and clicking one of those filters the list instead of
      // expanding anything.
      const leaf = Array.from(document.querySelectorAll("*")).find(
        (e) => e.children.length === 0 && re.test((e.textContent || "").trim()) && e.closest(sel),
      );
      if (!leaf) return null;
      let a = leaf;
      while (a && a.getAttribute?.("role") !== "button") a = a.parentElement;
      if (!a) return null;
      a.setAttribute("data-verify-target", "1");
      return true;
    },
    { reSrc: labelRe.source, sel: CARD_SEL },
  );
  if (!found) throw new Error(`no expandable event card matching /${labelRe.source}/ on the page`);

  await page.click("[data-verify-target]");

  // The detail panel loads its own data, and the explainer prose then sits
  // behind a "Show explanation" toggle — the header expansion alone paints
  // none of it. Poll rather than guess a settling time.
  let drawer = false;
  for (let i = 0; i < 40 && !drawer; i++) {
    await page.waitForTimeout(250);
    drawer = await page.evaluate((sel) => {
      const card = document.querySelector("[data-verify-target]")?.closest(sel);
      // The toggle is an icon button — its label lives in aria-label, and
      // innerText alone comes back empty.
      const btn = Array.from(card?.querySelectorAll("button") || []).find((b) =>
        /show explanation/i.test(`${b.innerText || ""} ${b.getAttribute("aria-label") || ""}`.trim()),
      );
      if (!btn) return false;
      btn.click();
      return true;
    }, CARD_SEL);
  }
  if (!drawer) throw new Error(`the "Show explanation" toggle never appeared on the /${labelRe.source}/ card`);
  await page.waitForTimeout(700);

  return page.evaluate((sel) => {
    const card = document.querySelector("[data-verify-target]")?.closest(sel);
    return card ? card.innerText : "";
  }, CARD_SEL);
}

const browser = await chromium.launch();

// ── §1 fork explainer, UNBATCHED (real data) ────────────────────────────────
console.log("§1 fork explainer — UNBATCHED rate adjust (real chain data)");
{
  const page = await browser.newPage();
  await page.goto(BASE + FORK.path, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1200);

  // Guard against the empty-page trap: an upstream 429 renders "0 events" and
  // every text assertion below would then vacuously pass.
  const body = await page.evaluate(() => document.body.innerText);
  assert(!/No transaction history available/.test(body), "timeline actually loaded (not a rate-limited empty page)");

  const card = await expandCardWithLabel(page, /(Increase|Decrease|Adjust) interest rate/);
  assert(BORROWER.test(card), `unbatched bullet credits the borrower (${BORROWER})`);
  assert(!DELEGATE.test(card), "unbatched bullet does NOT claim a delegate set the rate");
  await page.close();
}

// ── §2 fork explainer, BATCHED (synthesised row) ────────────────────────────
console.log("§2 fork explainer — BATCHED rate adjust (timeline response rewritten)");
{
  const page = await browser.newPage();
  let patched = 0;
  const proxy = await startInjectingProxy({
    target: BASE,
    rewrite: (url, json) => {
      if (!url.startsWith(FORK.api)) return null;
      let hit = 0;
      for (const e of json.events || []) {
        if (e.actionType === "adjustTroveInterestRate" && e.context?.data) {
          e.context.data.isBatched = true;
          hit++;
        }
      }
      if (!hit) return null;
      patched += hit;
      return json;
    },
  });
  await page.goto(proxy.origin + FORK.path, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1200);

  // If nothing was patched the two sections are testing the same input and §2
  // proves nothing — fail loudly rather than report a green switch.
  assert(patched > 0, `the interception actually flipped isBatched on ${patched} rate event(s)`);

  const card = await expandCardWithLabel(page, /(Increase|Decrease|Adjust|Delegate) (interest )?rate/);
  assert(DELEGATE.test(card), `batched bullet credits the batch manager (${DELEGATE})`);
  assert(!BORROWER.test(card), "batched bullet does NOT credit the borrower with the delegate's decision");
  await page.close();
  await proxy.close();
}

// ── §3 Liquity V2 borrowing modal on a BATCHED trove (real data) ────────────
console.log("§3 Liquity V2 'How Borrowing Works' modal — on a batched trove");
{
  const page = await browser.newPage();
  await page.goto(BASE + V2_BATCHED, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1200);

  const body = await page.evaluate(() => document.body.innerText);
  assert(!/No transaction history available/.test(body), "V2 timeline actually loaded");

  const openCard = await expandCardWithLabel(page, /^Open$/);
  // Confirm this really is an openTroveAndJoinBatch — the reader for whom the
  // old sentence was flatly untrue. Without this the section would assert the
  // copy against an ordinary borrower and the fixture would prove nothing.
  assert(/Joined a batch manager on open/i.test(openCard), "the fixture trove opened straight into a batch");

  // The Learn-More trigger, scoped to THIS card — an unscoped document-wide
  // search picks up whichever card comes first in the DOM.
  const opened = await page.evaluate((sel) => {
    const card = document.querySelector("[data-verify-target]")?.closest(sel);
    const t = Array.from(card?.querySelectorAll("button") || []).find((b) =>
      /learn more/i.test(`${b.innerText || ""} ${b.getAttribute("aria-label") || ""}`.trim()),
    );
    if (!t) return false;
    t.click();
    return true;
  }, CARD_SEL);
  assert(opened, "the Learn-More trigger exists on the open-trove card");
  // The modal is a portal, not an ARIA dialog — it renders as a fixed
  // full-viewport overlay appended to <body>.
  await page.waitForSelector(MODAL_SEL, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  const modal = await page.evaluate((sel) => {
    const d = document.querySelector(sel);
    return d ? d.innerText : "";
  }, MODAL_SEL);
  assert(/How Borrowing Works/i.test(modal), "the borrowing modal is the one open");
  assert(
    modal.includes("the borrower sets the rate, or delegates it to a batch manager"),
    "the modal names the delegation route",
  );
  assert(!modal.includes("the borrower chooses the rate"), "the modal no longer asserts sole borrower authorship");
  await page.close();
}

await browser.close();

// ── §4 the fork never-empty floor, at module level ──────────────────────────
console.log("§4 fork fallback modal copy (module level — no live page reaches it)");
{
  // The repo has no TS loader hook for a bare .mjs run, so this reads the
  // SOURCE and asserts on it rather than skipping (a skip here would hide a
  // regression). It used to try `await import("./lib/shared/learn-more-content.ts")`
  // first, behind a `.catch(() => ({}))` — a path that could never resolve from
  // this directory and whose failure was swallowed, so the branch below was the
  // only one that ever ran. The dead attempt is gone; the assertions are
  // unconditional, which is what the comment always claimed.
  const src = await import("node:fs").then((fs) => fs.readFileSync("lib/shared/learn-more-content.ts", "utf8"));
  const fn = src.slice(src.indexOf("export function liquityForkEventFallbackContent"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert(!body.includes("each borrower chooses their own annual rate"), "fallback no longer asserts sole authorship");
  assert(
    body.includes("set by the borrower, or by the interest-batch manager the borrower delegates to"),
    "fallback names both rate-authorship routes",
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

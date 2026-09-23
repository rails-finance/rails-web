// Desktop rail dots: one on each fork card's LEFT border ("Historic events" +
// "Live state"), none on the Ethereum card's RIGHT border.
// Run with the dev server on :3000. See verify-stage-rail.mjs for the full
// rail suite.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
// The screenshot is a debugging aid, not an assertion. It used to hard-code an
// absolute path into one long-dead session's scratchpad directory, which throws
// ENOENT anywhere else — a guard must not die decorating its own output, and
// this one shot ran BEFORE the verdict printed, so it could discard the result
// entirely. Opt in with SHOT=/some/path.png; failures to write are reported and
// ignored.
async function shoot(target, opts) {
  if (!process.env.SHOT) return;
  try {
    await target.screenshot({ path: process.env.SHOT, ...opts });
  } catch (e) {
    console.log("  (screenshot skipped:", e.message, ")");
  }
}
const fails = [];
const check = (cond, msg) => (cond ? console.log("  ok:", msg) : (fails.push(msg), console.log("  FAIL:", msg)));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(BASE, { waitUntil: "networkidle" });

const geo = await page.evaluate(() => {
  const rail = document.querySelector("ol");
  // Station <li>s only — skip the decorative mobile connector <li>s (no eyebrow).
  const cards = [...rail.querySelectorAll("li")]
    .filter((li) => li.querySelector("p.font-semibold"))
    .map((li) => {
      const eyebrow = li.querySelector("p").textContent.trim();
      return { eyebrow, rect: li.querySelector("div.z-\\[1\\]").getBoundingClientRect().toJSON() };
    });
  // Desktop dots = the rounded spans inside the lg-only overlay (hidden lg:grid).
  const overlay = rail.parentElement.querySelector('div[aria-hidden="true"].lg\\:grid');
  const dots = [...overlay.querySelectorAll("span:not(.rail-pulse)")]
    .map((s) => s.getBoundingClientRect())
    .filter((r) => r.width > 0)
    .map((r) => ({ cx: r.left + r.width / 2, cy: r.top + r.height / 2 }));
  return { cards, dots };
});

const card = (name) => geo.cards.find((c) => c.eyebrow.toLowerCase().includes(name)).rect;
const chain = card("ethereum");
const indexed = card("historic events");
const live = card("live state");
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
const midY = (r) => r.top + r.height / 2;
const dotOn = (x, y) => geo.dots.some((d) => near(d.cx, x) && near(d.cy, y));

check(geo.dots.length === 4, `desktop overlay has 4 dots (got ${geo.dots.length})`);
check(dotOn(indexed.left, midY(indexed)), "dot on HISTORIC EVENTS left middle border");
check(dotOn(live.left, midY(live)), "dot on LIVE STATE left middle border");
check(!dotOn(chain.right, midY(chain)), "no dot on ETHEREUM right middle border");

await shoot(page.locator("ol"));
await browser.close();
if (fails.length) {
  console.error(`\n${fails.length} FAILED`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");

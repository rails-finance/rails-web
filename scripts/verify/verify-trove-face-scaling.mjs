// verify-trove-face-scaling — a Liquity V2 trove card's live figures explain
// their integer as a contract's return value (TO-DO-ui-jobs §34, item 1).
//
// The collateral, debt and rate on a trove card come from
// TroveManager.getLatestTroveData() once the live read lands. Their receipts
// had no scaling sentence, and the only sentence the receipt could draw began
// "The log stores this as…", which is false of a call. `ProvScaling.from`
// now says which, and the card passes the read's own integers.
//
// The expected integers come from the wire, not from the page:
// `/api/trove/state/<collateral>/<troveId>` is the read the card makes, and its
// `entireRaw` / `annualInterestRateRaw` fields are what the sentence must
// quote. The subject is discovered at run time from the open WETH roster, so
// the check cannot go green on a trove that was closed since it was written.
//
// Usage:
//   BASE=http://localhost:3000 node scripts/verify/verify-trove-face-scaling.mjs

import { chromium } from "playwright";
import { armInspector, openInspectorHome } from "./lib/prov-inspector.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";

const fails = [];
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

// ── The subject: an open WETH trove with debt, from the roster ──────────────
const roster = await fetch(`${BASE}/api/troves?collateralType=WETH&status=open&limit=20`)
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);
const rows = Array.isArray(roster?.data) ? roster.data : [];
const subject = rows.find((t) => t?.id && Number(t?.debt?.current ?? 0) > 0) ?? rows[0];
check("an open WETH trove is on the roster", subject != null, `${rows.length} rows`);
if (!subject) {
  console.log(`\n${fails.length} FAILURE(S)`);
  process.exit(1);
}
const troveId = String(subject.id);
const path = `/ethereum/liquity-v2/trove/WETH/${troveId}`;
console.log(`  subject: ${path}`);

const wire = await fetch(`${BASE}/api/trove/state/WETH/${troveId}`)
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);
const state = wire?.data;
const expected = {
  collateral: state?.collateral?.entireRaw,
  debt: state?.debt?.entireRaw,
  rate: state?.rates?.annualInterestRateRaw,
};
check(
  "the trove-state read answers with its three integers",
  Object.values(expected).every((x) => typeof x === "string" && /^\d+$/.test(x)),
  JSON.stringify(expected),
);

// ── The page ────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 180000 });

// The live read has landed when a receipt's via line names the call
// (`TroveManager.getLatestTroveData(): …`); before it, the card shows the logged
// snapshot, whose receipts carry no raw here and owe no sentence.
await openInspectorHome(page);

/** Arm, then pick pickables until one's popover head names `label`. Returns the
 *  popover's text and its scaling sentence, or null. */
async function receiptFor(label) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await armInspector(page).catch(() => {});
    const picks = page.locator("[data-prov-pickable]");
    const n = await picks.count();
    for (let i = 0; i < n; i++) {
      await picks
        .nth(i)
        .click({ timeout: 3000 })
        .catch(() => {});
      const got = await page.evaluate(() => {
        const pop = document.querySelector(".prov-inspect-pop");
        if (!pop) return null;
        return {
          head: pop.querySelector(".prov-inspect-label")?.textContent ?? "",
          text: pop.innerText,
          scaling: pop.querySelector(".prov-scaling")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        };
      });
      if (got && got.head.startsWith(label) && /getLatestTroveData/.test(got.text)) return got;
    }
    await page.waitForTimeout(2000);
  }
  return null;
}

const cases = [
  ["collateral", "Collateral held by the trove", expected.collateral],
  ["debt", "The trove's debt", expected.debt],
  ["rate", "Annual interest rate", expected.rate],
];
for (const [key, label, raw] of cases) {
  const r = await receiptFor(label);
  if (!r) {
    check(`${key}: the live receipt was found`, false, `no pickable whose receipt is "${label}" on the live read`);
    continue;
  }
  const m = r.scaling?.match(/^(The contract returns|The log stores) this as the whole number (\d+)\./);
  check(`${key}: the receipt carries a scaling sentence`, r.scaling != null, r.scaling ?? "none");
  check(`${key}: it says the contract returns the integer`, m?.[1] === "The contract returns", r.scaling ?? "");
  // The live figure moves (interest accrues on the debt), so the page's read
  // and this script's can differ by the blocks between them. The collateral and
  // the rate hold still; the debt is held to one part in a million, which a
  // minute of interest at any Liquity rate stays well inside. (A leading-digits
  // match flaked on preview when the accrual carried into the eighth digit.)
  const near = (a, b) => {
    const [x, y] = [BigInt(a), BigInt(b)];
    const d = x > y ? x - y : y - x;
    return d * 1000000n <= y;
  };
  const same = !!m && !!raw && (key === "debt" ? near(m[2], raw) : m[2] === raw);
  check(`${key}: the integer is the read's own`, !!m && !!raw && same, `${m?.[2]} vs ${raw}`);
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exitCode = fails.length ? 1 : 0;

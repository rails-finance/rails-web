// verify-frankencoin-v1-interest-supply — the V1 interest rule and what the
// /system supply counts.
// ----------------------------------------------------------------------------
//   npx tsx scripts/verify/verify-frankencoin-v1-interest-supply.ts
//   BASE=http://localhost:3000 npx tsx scripts/verify/verify-frankencoin-v1-interest-supply.ts
//
// OFFLINE
//   • frankencoinChargedTerm: a V1 mint with fewer than 28 days to expiry is
//     charged 28 (PositionV1.calculateCurrentFee, MIN_INTEREST_DURATION =
//     4 weeks); a V1 mint with more, and any V2 mint, the days left.
//   • the minting modal: V1 states the rate fixed at opening and the 4-week
//     minimum, and not the base rate; V2 states the base rate plus the risk
//     premium.
// LIVE (BASE, default dev.rails.finance, through the Vercel bypass header)
//   • /ethereum/frankencoin/system: the supply stat reads "ZCHF on Ethereum",
//     the book note says CCIP transfers are burned on Ethereum, and when the
//     open book owes more than the supply it says why.
//   • a closed V1 position with mints (0x9872…1ef3): the interest line names
//     the 4-week minimum and the rate fixed at opening.

import { chromium } from "playwright";
import { frankencoinChargedTerm } from "../../lib/frankencoin/use-event-read";
import { frankencoinMintingContent } from "../../lib/shared/learn-more-content";
import { BASE, bypassHeaders } from "./lib/host.mjs";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  — ${detail}`}`);
};

// ── offline ──────────────────────────────────────────────────────────────────
const exp = 1_800_000_000;
const day = 86_400;
const t = (hub: "v1" | "v2", left: number) => frankencoinChargedTerm(hub, exp, exp - left * day);
check("V1, 10 days left: charged the 28-day minimum", t("v1", 10)?.days === 28 && t("v1", 10)?.minimum === true);
check("V1, 60 days left: charged 60", t("v1", 60)?.days === 60 && t("v1", 60)?.minimum === false);
check("V2, 10 days left: charged 10", t("v2", 10)?.days === 10 && t("v2", 10)?.minimum === false);

const interestText = (hub: "v1" | "v2") =>
  frankencoinMintingContent(hub).details?.find((d) => d.bold === "Interest up front")?.text ?? "";
const v1 = interestText("v1");
const v2 = interestText("v2");
check("modal V1: rate fixed when the position opened", /fixed when it opened/.test(v1), v1);
check(
  "modal V1: at least 4 weeks, 28 days in the last 28",
  /at least 4 weeks/.test(v1) && /28 days of interest/.test(v1),
  v1,
);
check("modal V1: names no base rate", !/base rate/.test(v1), v1);
check("modal V2: base rate plus risk premium", /system base rate plus the position's risk premium/.test(v2), v2);

// ── live ─────────────────────────────────────────────────────────────────────
const V1_POSITION = "0x98725ee62833096c1c9be26001f3cda9a6241ef3";
async function live(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ extraHTTPHeaders: bypassHeaders() as Record<string, string> });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/ethereum/frankencoin/system`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByText("ZCHF on Ethereum", { exact: true }).first().waitFor({ timeout: 90_000 });
    await page
      .getByText(/burned on Ethereum/)
      .first()
      .waitFor({ timeout: 90_000 });
    const sys = await page.locator("body").innerText();
    check("system: supply stat reads ZCHF on Ethereum", /ZCHF on Ethereum/.test(sys));
    check("system: no stat reads ZCHF in existence", !/ZCHF in existence/.test(sys));
    check(
      "system: CCIP transfers are burned on Ethereum",
      /sent to another chain through Chainlink CCIP is burned on Ethereum/.test(sys),
    );
    const owes = /the open book owes [\d.,]+[KMB]? ZCHF more than that supply/.test(sys);
    check(
      "system: a gap, when shown, says more left for other chains than the minters added",
      !owes || /more ZCHF has left for other chains than the bridges and other minters have added/.test(sys),
    );

    await page.goto(`${BASE}/ethereum/frankencoin/${V1_POSITION}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const line = page.getByText(/Interest was charged at each mint/).first();
    await line.waitFor({ timeout: 90_000 });
    const text = await line.innerText();
    check(
      "V1 position: interest line names the 4-week minimum and the fixed rate",
      /at least 4 weeks, at the rate fixed when the position opened/.test(text),
      text.slice(0, 200),
    );
  } finally {
    await browser.close();
  }
}

live()
  .catch((err) => check("live checks ran", false, String(err).slice(0, 300)))
  .finally(() => {
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });

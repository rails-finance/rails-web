// The holder card's read (V8, rails-ops ui-jobs 553; Earned is ui-jobs 410),
// shared by the three holder-page verifiers: the figures in order, no stat
// rows, Profit or loss beside the Lifetime flows panel's own totals, Put in and
// Taken out beside the panel's inflow and outflow, and the (i) toggle's name.

/** Open `url` and read the card once Earned has landed. */
export async function readHoldingCard(browser, url, headers = {}) {
  const page = await browser.newPage({ extraHTTPHeaders: headers });
  await page.goto(url, { waitUntil: "networkidle", timeout: 240_000 });
  await page.waitForSelector("[data-figure='holder-earned']", { timeout: 120_000 }).catch(() => null);
  const out = await page.evaluate(() => {
    const card = document.querySelector("[data-position-card]");
    const earned = card?.querySelector("[data-figure='holder-earned']");
    const panel = document.querySelector("[data-vault-flows-tower]");
    const toggle = [...(card?.querySelectorAll("button") ?? [])].find((b) =>
      /explanation/i.test(b.getAttribute("aria-label") ?? ""),
    );
    return {
      heads: [...(card?.querySelectorAll("[data-card-head]") ?? [])].map((h) => h.getAttribute("data-card-head")),
      stats: [...(card?.querySelectorAll("[data-panel-row]") ?? [])].map((s) => s.getAttribute("data-panel-row")),
      earnedStatus: earned?.getAttribute("data-earned-status") ?? null,
      earnedRaw: earned?.getAttribute("data-earned-raw") ?? null,
      putInRaw: card?.querySelector("[data-figure='holder-put-in']")?.getAttribute("data-raw") ?? null,
      takenOutRaw: card?.querySelector("[data-figure='holder-taken-out']")?.getAttribute("data-raw") ?? null,
      flowIn: panel ? Number(panel.getAttribute("data-flow-in")) : null,
      flowOut: panel ? Number(panel.getAttribute("data-flow-out")) : null,
      flowEnd: panel ? Number(panel.getAttribute("data-flow-end")) : null,
      toggleName: toggle?.getAttribute("aria-label") ?? null,
    };
  });
  await page.close();
  return out;
}

/** The checks every family's verifier makes of its card. `decimals` is the
 *  vault asset's, from the script's own read. */
export function holdingCardChecks(check, id, c, decimals) {
  check(
    `${id}a the holder card's four figures are Put in, Taken out, Worth now and Profit or loss, in that order`,
    c.heads.join(",") === "put-in,taken-out,worth-now,profit",
    c.heads.join(", ") || "no card",
  );
  check(`${id}b the card draws no stat rows`, c.stats.length === 0, c.stats.join(", ") || "none");
  const earned = c.earnedRaw != null ? Number(c.earnedRaw) / 10 ** decimals : null;
  const panel = c.flowEnd != null ? c.flowEnd - (c.flowIn - c.flowOut) : null;
  // The panel sums floats; the card sums wei. One part in a billion of the
  // largest flow is far under the last printed digit.
  const tol = Math.max(1e-9 * Math.max(Math.abs(c.flowIn ?? 0), Math.abs(c.flowEnd ?? 0)), 10 ** -decimals);
  check(
    `${id}c Profit or loss equals the Lifetime flows panel's end balance minus its net inflow`,
    c.earnedStatus === "ok" && earned != null && panel != null && Math.abs(earned - panel) <= tol,
    `card ${earned ?? c.earnedStatus}, panel ${panel} (end ${c.flowEnd} − (in ${c.flowIn} − out ${c.flowOut}))`,
  );
  const putIn = c.putInRaw != null ? Number(c.putInRaw) / 10 ** decimals : null;
  const takenOut = c.takenOutRaw != null ? Number(c.takenOutRaw) / 10 ** decimals : null;
  check(
    `${id}c2 Put in and Taken out equal the Lifetime flows panel's inflow and outflow`,
    putIn != null && takenOut != null && Math.abs(putIn - c.flowIn) <= tol && Math.abs(takenOut - c.flowOut) <= tol,
    `card in ${putIn} out ${takenOut}, panel in ${c.flowIn} out ${c.flowOut}`,
  );
  check(
    `${id}d the card's (i) is announced as the holding's explanation`,
    /^Show holding explanation$/.test(c.toggleName ?? ""),
    c.toggleName ?? "no toggle",
  );
}

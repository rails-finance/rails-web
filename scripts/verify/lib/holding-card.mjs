// The holder card's read (rails-ops ui-jobs 407 step 4, 410), shared by the
// three holder-page verifiers: the headlines in order, the stats, Earned beside
// the Lifetime flows panel's own totals, and the (i) toggle's name.

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
      heading: card?.querySelector("[data-position-summary]")?.textContent?.trim() ?? null,
      heads: [...(card?.querySelectorAll("[data-card-head]") ?? [])].map((h) => h.getAttribute("data-card-head")),
      stats: [...(card?.querySelectorAll("[data-panel-row]") ?? [])].map((s) => s.getAttribute("data-panel-row")),
      earnedStatus: earned?.getAttribute("data-earned-status") ?? null,
      earnedRaw: earned?.getAttribute("data-earned-raw") ?? null,
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
    `${id}a the holder card's four headlines are Balance, Share of the vault, Claim and Earned, in that order`,
    c.heads.join(",") === "balance,share-of-vault,claim,earned",
    c.heads.join(", ") || "no card",
  );
  check(`${id}b the card carries at most six stats`, c.stats.length > 0 && c.stats.length <= 6, c.stats.join(", "));
  const earned = c.earnedRaw != null ? Number(c.earnedRaw) / 10 ** decimals : null;
  const panel = c.flowEnd != null ? c.flowEnd - (c.flowIn - c.flowOut) : null;
  // The panel sums floats; the card sums wei. One part in a billion of the
  // largest flow is far under the last printed digit.
  const tol = Math.max(1e-9 * Math.max(Math.abs(c.flowIn ?? 0), Math.abs(c.flowEnd ?? 0)), 10 ** -decimals);
  check(
    `${id}c Earned equals the Lifetime flows panel's end balance minus its net inflow`,
    c.earnedStatus === "ok" && earned != null && panel != null && Math.abs(earned - panel) <= tol,
    `card ${earned ?? c.earnedStatus}, panel ${panel} (end ${c.flowEnd} − (in ${c.flowIn} − out ${c.flowOut}))`,
  );
  check(
    `${id}d the card's (i) is announced as the holding's explanation`,
    /^Show holding explanation$/.test(c.toggleName ?? ""),
    c.toggleName ?? "no toggle",
  );
}

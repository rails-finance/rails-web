// The vault roster's default view and its sort (rails-ops ui-jobs 485;
// components/vaults/vault-roster.tsx), as the roster verifiers check it.
// ----------------------------------------------------------------------------
// A roster opens on its preset: a vault with a census when it counts 100+
// current holders, a Yearn vault the census has no row for when the Registry
// endorses it, any other vault kept. `?show=all` lifts it. Every roster draws
// the house table (ui-jobs 538, 605), sorted by `?sort=` and `?dir=`, Holders
// by default. Every row carries the hooks this reads (`data-holders-live`, `data-standing`,
// `data-vault-family`, `data-created-block`, `data-total-assets-raw`).
//
//   import { checkRosterView } from "./lib/vault-roster-view.mjs";
//   await checkRosterView({ page, base, route, scope, check, tag: "16" });

export const HOLDERS_MIN = 100;

/** The preset's rule over one row as the hooks state it. */
export function presetKeeps(r) {
  if (r.live != null) return r.live >= HOLDERS_MIN;
  if (r.family === "yearn-v3") return r.standing.includes("endorsed");
  return true;
}

/** Every row drawn under `scope`, the empty group opened first. */
export async function readRosterRows(page, scope) {
  const toggle = page.locator(`${scope} [data-empty-group] > button`);
  if ((await toggle.count()) > 0 && (await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
    await page.waitForTimeout(300);
  }
  return page.locator(`${scope} [data-vault-row]`).evaluateAll((els) =>
    els.map((el) => {
      const live = el.getAttribute("data-holders-live");
      const created = el.getAttribute("data-created-block");
      return {
        address: el.getAttribute("data-vault-row"),
        group: el.getAttribute("data-group"),
        family: el.getAttribute("data-vault-family"),
        live: live ? Number(live) : null,
        standing: (el.getAttribute("data-standing") ?? "").split(" ").filter(Boolean),
        created: created ? Number(created) : null,
        raw: el.getAttribute("data-total-assets-raw") ? BigInt(el.getAttribute("data-total-assets-raw")) : null,
        // The table ranks Total assets by what the vault holds (ui-jobs 543).
        held: el.getAttribute("data-held-assets-raw") ? BigInt(el.getAttribute("data-held-assets-raw")) : null,
        token: el.getAttribute("data-token"),
      };
    }),
  );
}

/** Pairs out of order under a comparator that says a may precede b. */
const outOfOrder = (list, ok) => list.slice(1).filter((b, i) => !ok(list[i], b)).length;

/** The table's order (ui-jobs 538): under Holders, counted rows first, most
 *  open holders first; under Total assets, by token, the larger total assets
 *  first inside one token (ui-jobs 664). */
const tableHoldersOk = (a, b) => (a.live == null ? b.live == null : b.live == null || a.live >= b.live);
const tokenCmp = (a, b) => a.token.localeCompare(b.token, "en-US", { sensitivity: "base" });
const tableAssetsOk = (a, b) => tokenCmp(a, b) < 0 || (tokenCmp(a, b) === 0 && a.raw >= b.raw);

/**
 * The default view against `?show=all`, the preset's pill, lifting and resetting it, and
 * the table's sorts.
 */
export async function checkRosterView({ page, base, route, scope, check, tag }) {
  const go = async (q) => {
    await page.goto(`${base}${route}${q}`, { waitUntil: "networkidle", timeout: 300_000 });
    await page.waitForSelector(`${scope} [data-vault-row]`, { timeout: 120_000 });
    await page.waitForTimeout(500);
  };
  const shownCount = async () =>
    page.locator(`${scope} [data-figure="shown-count"]`).evaluate((el) => ({
      shown: Number(el.getAttribute("data-shown")),
      funded: Number(el.getAttribute("data-funded")),
    }));

  // Everything, then the default.
  await go("?show=all&sort=assets");
  const all = await readRosterRows(page, scope);
  const allFunded = all.filter((r) => r.group === "funded");
  const want = new Set(allFunded.filter(presetKeeps).map((r) => r.address));
  const wantEmpty = all.filter((r) => r.group === "empty" && presetKeeps(r)).length;
  await go("");
  // The preset is the Shown pill (N1.10, ui-jobs 681): a default pill, a
  // chevron and no ×; its editor lifts it ("Every vault") and resets it.
  const pill = page.locator(`${scope} [data-filter-pill="Shown"]`);
  const pillState = async () => ((await pill.count()) ? await pill.first().getAttribute("data-pill-state") : null);
  const openShown = async () => {
    await pill.first().locator("[data-pill-open]").click();
    await page.locator('[data-pill-editor="Shown"]').first().waitFor({ state: "visible", timeout: 10_000 });
  };
  check(
    `${tag}a the roster opens on the preset, named in a default pill with no ×`,
    (await pill.count()) === 1 &&
      (await pillState()) === "default" &&
      (await pill.locator("[data-pill-remove]").count()) === 0,
    (await pill.count())
      ? `${await pillState()}: ${await pill.first().locator("[data-pill-open]").getAttribute("aria-label")}`
      : "no pill",
  );
  const def = await readRosterRows(page, scope);
  const defFunded = def.filter((r) => r.group === "funded");
  const missing = [...want].filter((a) => !defFunded.some((r) => r.address === a));
  const extra = defFunded.filter((r) => !want.has(r.address));
  check(
    `${tag}b the default rows are exactly the funded vaults the preset keeps (100+ holders, Yearn endorsed, the rest kept)`,
    want.size > 0 && missing.length === 0 && extra.length === 0 && defFunded.length < allFunded.length,
    `${defFunded.length} of ${allFunded.length} drawn, ${want.size} expected, ${missing.length} missing, ${extra.length} extra`,
  );
  const sc = await shownCount();
  check(
    `${tag}c the counts line states the shown and the funded`,
    sc.shown === want.size && sc.funded === allFunded.length,
    `line ${sc.shown} of ${sc.funded}, rows ${want.size} of ${allFunded.length}`,
  );
  const emptyDrawn = def.filter((r) => r.group === "empty").length;
  check(
    `${tag}d under the preset the empty group holds only the empty vaults it keeps`,
    emptyDrawn === wantEmpty && (await page.locator(`${scope} [data-empty-group]`).count()) > 0 === wantEmpty > 0,
    `${emptyDrawn} drawn, ${wantEmpty} kept`,
  );
  {
    const bad = outOfOrder(defFunded, tableHoldersOk);
    check(
      `${tag}e Holders is the default sort: counted rows first, most open holders first`,
      bad === 0,
      `${bad} rows out of order`,
    );
  }

  // "Every vault" in the pill's editor writes ?show=all and draws every row;
  // its "Reset to default" returns.
  await openShown();
  await page.locator('[data-pill-editor="Shown"] [data-pill-option="all"]').first().click();
  await page.locator('[data-pill-editor="Shown"] [data-pill-editor-apply]').first().click();
  await page.waitForTimeout(500);
  const lifted = (await readRosterRows(page, scope)).filter((r) => r.group === "funded").length;
  check(
    `${tag}f "Every vault" in the Shown pill writes ?show=all, sets the pill and draws every funded vault`,
    new URL(page.url()).searchParams.get("show") === "all" &&
      (await pillState()) === "set" &&
      lifted === allFunded.length,
    `${page.url()} → ${lifted} of ${allFunded.length}, pill ${await pillState()}`,
  );
  await openShown();
  await page.locator('[data-pill-editor="Shown"] [data-pill-editor-remove]').first().click();
  await page.waitForTimeout(500);
  check(
    `${tag}g the pill's Reset to default restores the preset and drops the param`,
    !new URL(page.url()).searchParams.has("show") &&
      (await shownCount()).shown === want.size &&
      (await pillState()) === "default",
    page.url(),
  );

  {
    await go("?show=all&sort=assets");
    const rows = (await readRosterRows(page, scope)).filter((r) => r.group === "funded");
    const bad = outOfOrder(rows, tableAssetsOk);
    check(
      `${tag}h ?sort=assets: by token, the largest total assets first inside each token`,
      bad === 0,
      `${bad} rows out of order`,
    );
    // The rule is the header's tip, read with the sort button (no line above the table).
    for (const [key, word, rule] of [
      ["assets", "total assets", "Sorts by token, then by total assets within each token."],
      ["price", "share price", "Sorts by token, then by share price within each token."],
    ]) {
      const th = page.locator(`${scope} [data-vault-table='funded'] th[data-sort-key='${key}']`);
      const tip = await th.locator(`[data-header-tip='${key}']`).count();
      const said = await th
        .locator("button[aria-describedby]")
        .first()
        .evaluate((b) => document.getElementById(b.getAttribute("aria-describedby"))?.textContent ?? "")
        .catch(() => "");
      check(
        `${tag}i the ${word} header's tip says how it sorts, read with its sort button`,
        tip === 1 && said === rule,
        `tip ${tip}, described as “${said}”`,
      );
    }
    check(`${tag}j no sort line above the table`, (await page.locator(`${scope} [data-sort-note]`).count()) === 0);
  }
}

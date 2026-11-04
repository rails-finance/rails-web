// The vault roster's default view and its sort (rails-ops ui-jobs 485;
// components/vaults/vault-roster.tsx), as the roster verifiers check it.
// ----------------------------------------------------------------------------
// A roster opens on its preset: a vault with a census when it counts 100+
// current holders, a Yearn vault when the Registry endorses it, any other
// vault kept. `?show=all` lifts it. The sort is Holders where a census
// exists (else Size), `?sortBy=size` and `?sortBy=newest` the others. Every
// row carries the hooks this reads (`data-holders-live`, `data-standing`,
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
        groupKey: el.closest("[data-asset-group]")
          ? `${el.closest("[data-asset-group]").getAttribute("data-asset-group-chain")}:${el
              .closest("[data-asset-group]")
              .getAttribute("data-asset-group")}`
          : null,
        family: el.getAttribute("data-vault-family"),
        live: live ? Number(live) : null,
        standing: (el.getAttribute("data-standing") ?? "").split(" ").filter(Boolean),
        created: created ? Number(created) : null,
        raw: el.getAttribute("data-total-assets-raw") ? BigInt(el.getAttribute("data-total-assets-raw")) : null,
      };
    }),
  );
}

/** Rows by group, in page order. */
function groups(rows) {
  const out = new Map();
  for (const r of rows.filter((x) => x.group === "funded")) {
    if (!out.has(r.groupKey)) out.set(r.groupKey, []);
    out.get(r.groupKey).push(r);
  }
  return [...out.values()];
}

/** Pairs out of order under a comparator that says a may precede b. */
const outOfOrder = (list, ok) => list.slice(1).filter((b, i) => !ok(list[i], b)).length;

/** a may precede b under Holders: counted first, more holders first, ties and
 *  the uncounted by size. */
const holdersOk = (a, b) =>
  a.live != null && b.live == null
    ? true
    : a.live == null && b.live != null
      ? false
      : a.live != null && a.live !== b.live
        ? a.live > b.live
        : a.raw >= b.raw;
const sizeOk = (a, b) => a.raw >= b.raw;
const newestOk = (a, b) =>
  a.created != null && b.created == null
    ? true
    : a.created == null && b.created != null
      ? false
      : a.created != null && a.created !== b.created
        ? a.created > b.created
        : a.raw >= b.raw;
/** Groups under Holders and Newest compare their first rows on the key alone. */
const holdersKeyOk = (a, b) => (a.live == null ? b.live == null : b.live == null || a.live >= b.live);
const newestKeyOk = (a, b) => (a.created == null ? b.created == null : b.created == null || a.created >= b.created);

/**
 * The default view against `?show=all`, the preset's chip and its removal, and
 * the three sorts. `holders`: the roster has a census (Holders is its default).
 */
export async function checkRosterView({ page, base, route, scope, check, tag, holders = true }) {
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
  await go("?show=all&sortBy=size");
  const all = await readRosterRows(page, scope);
  const allFunded = all.filter((r) => r.group === "funded");
  const want = new Set(allFunded.filter(presetKeeps).map((r) => r.address));
  const wantEmpty = all.filter((r) => r.group === "empty" && presetKeeps(r)).length;
  await go("");
  const chip = page.locator(`${scope} [data-default-chip="show"]`);
  check(
    `${tag}a the roster opens on the preset, named in a removable chip`,
    (await chip.count()) === 1 && (await chip.locator("button").count()) === 1,
    (await chip.count()) ? (await chip.innerText()).trim() : "no chip",
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
  if (holders) {
    const bad = groups(def).reduce((a, g) => a + outOfOrder(g, holdersOk), 0);
    const firsts = groups(def).map((g) => g[0]);
    check(
      `${tag}e Holders is the default sort: counted rows first, most current holders first, the rest by size`,
      bad === 0 && outOfOrder(firsts, holdersKeyOk) === 0,
      `${bad} rows out of order, ${outOfOrder(firsts, holdersKeyOk)} groups`,
    );
  } else {
    const bad = groups(def).reduce((a, g) => a + outOfOrder(g, sizeOk), 0);
    check(`${tag}e Size is the default sort where there is no census`, bad === 0, `${bad} rows out of order`);
  }

  // Removing the chip writes ?show=all and draws every row; Reset returns.
  await chip.locator("button").click();
  await page.waitForTimeout(500);
  const lifted = (await readRosterRows(page, scope)).filter((r) => r.group === "funded").length;
  check(
    `${tag}f removing the chip writes ?show=all and draws every funded vault`,
    new URL(page.url()).searchParams.get("show") === "all" && lifted === allFunded.length,
    `${page.url()} → ${lifted} of ${allFunded.length}`,
  );
  await page
    .locator(`${scope} button`, { hasText: /^Reset$/ })
    .first()
    .click();
  await page.waitForTimeout(500);
  check(
    `${tag}g Reset restores the preset and drops the param`,
    !new URL(page.url()).searchParams.has("show") && (await shownCount()).shown === want.size,
    page.url(),
  );

  // Size and Newest, by URL, over every row.
  const bySize = groups(all);
  const sizeGroupsBad = outOfOrder(bySize, (a, b) => a.length >= b.length);
  check(
    `${tag}h ?sortBy=size: largest first inside each group, groups by vault count`,
    bySize.reduce((a, g) => a + outOfOrder(g, sizeOk), 0) === 0 && sizeGroupsBad === 0,
    `${bySize.reduce((a, g) => a + outOfOrder(g, sizeOk), 0)} rows, ${sizeGroupsBad} groups out of order`,
  );
  if (all.some((r) => r.created != null)) {
    await go("?show=all&sortBy=newest");
    const g = groups(await readRosterRows(page, scope));
    const bad = g.reduce((a, x) => a + outOfOrder(x, newestOk), 0);
    const gBad = outOfOrder(
      g.map((x) => x[0]),
      newestKeyOk,
    );
    check(`${tag}i ?sortBy=newest: newest created block first`, bad === 0 && gBad === 0, `${bad} rows, ${gBad} groups`);
  }
}

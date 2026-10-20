// The vault page's "last 30 days" strip (V5, rails-ops ui-jobs 413), shared by
// the three vault-page verifiers: each tile's change against the two store
// reads it names, read here from /api/prices/daily directly; the line's days
// against the store's; no absolute figure in the strip; and the Holders tile.

const SERIES = {
  "total-assets": (chain, vault) => `vault-assets:${chain}:${vault.toLowerCase()}`,
  "share-price": (chain, vault) => `vault:${chain}:${vault.toLowerCase()}`,
  holders: (chain, vault) => `vault-holders:${chain}:${vault.toLowerCase()}`,
};

/** The strip as the page draws it, by the V5 mark and the tiles' hooks. */
export async function readVaultStrip(page) {
  return page.evaluate(() => {
    const strip = document.querySelector('[data-anatomy="V5"]');
    if (!strip) return null;
    const tiles = [...strip.querySelectorAll("[data-strip-tile]")].map((t) => ({
      tile: t.getAttribute("data-strip-tile"),
      fromDay: t.getAttribute("data-strip-from-day"),
      fromBlock: t.getAttribute("data-strip-from-block"),
      fromRaw: t.getAttribute("data-strip-from-raw"),
      toDay: t.getAttribute("data-strip-to-day"),
      toBlock: t.getAttribute("data-strip-to-block"),
      toRaw: t.getAttribute("data-strip-to-raw"),
      change: t.getAttribute("data-strip-change"),
      none: t.querySelector("[data-strip-none]")?.getAttribute("data-strip-none") ?? null,
      census: t.querySelector("[data-strip-census]")?.getAttribute("data-strip-census") ?? null,
      days: t.querySelector("[data-strip-line]")?.getAttribute("data-strip-days") ?? null,
      sentence: (t.querySelector("[data-strip-sentence]")?.textContent ?? "").replace(/\s+/g, " ").trim(),
    }));
    return {
      afterCard: strip.previousElementSibling?.getAttribute("data-anatomy") === "V2",
      beforeAssets: strip.nextElementSibling?.getAttribute("data-anatomy") === "V3",
      caption: strip.querySelector("[data-strip-caption]")?.textContent?.trim() ?? null,
      tiles,
    };
  });
}

/** The store's answer for the vault's three keys, the same window the page asks. */
export async function readStoreSeries(base, chain, vault, headers = {}) {
  const keys = Object.values(SERIES).map((k) => k(chain, vault));
  const from = Math.floor(Date.now() / 86_400_000) - 90;
  const res = await fetch(`${base}/api/prices/daily?chain=${chain}&series=${keys.join(",")}&from=${from}`, {
    headers,
  });
  if (!res.ok) return null;
  return (await res.json()).series ?? {};
}

/** This script's own window over a store series: the latest stored day, and
 *  the latest stored day at least 30 days before it. */
function ownWindow(series, zeroIsRead) {
  const reads = (series?.obs ?? [])
    .filter(([, raw, block]) => raw != null && /^\d+$/.test(raw) && block != null && (zeroIsRead || raw !== "0"))
    .map(([day, raw, block]) => ({ day, raw, block: String(block) }))
    .sort((a, b) => a.day - b.day);
  if (reads.length === 0) return null;
  const to = reads[reads.length - 1];
  const from = reads.filter((r) => r.day <= to.day - 30).pop() ?? null;
  return { from, to, days: reads.filter((r) => from && r.day >= from.day).map((r) => r.day) };
}

const STATED_BLOCK = /\bblock [\d,]+/g;
const DATE = /\b\d{1,2} [A-Z][a-z]{2} \d{4}\b/g;
const WINDOW = /\b\d+ days\b/g;
const PCT = /[+\-−]?[\d,]+(?:\.\d+)?%/g;

/**
 * The checks. `censusFamily`: false on Yearn, whose Holders tile states that
 * there is no census.
 */
export function vaultStripChecks(check, id, strip, store, { chain, vault, censusFamily }) {
  check(
    `${id}a the strip (V5) draws under the vault card and above "Where the assets are", tiles Total assets, Share price, Holders`,
    strip != null &&
      strip.afterCard &&
      strip.beforeAssets &&
      strip.tiles.map((t) => t.tile).join(",") === "total-assets,share-price,holders",
    strip
      ? `${strip.tiles.map((t) => t.tile).join(", ")}; after V2 ${strip.afterCard}, before V3 ${strip.beforeAssets}`
      : "no V5",
  );
  if (!strip) return;

  // Each tile's change is the two reads it names, and those are the store's.
  const bad = [];
  let measured = 0;
  for (const t of strip.tiles) {
    const own = store ? ownWindow(store[SERIES[t.tile](chain, vault)], t.tile !== "share-price") : null;
    if (t.change == null) {
      // No change drawn: the store must have no 30-day window for it.
      if (own?.from) bad.push(`${t.tile}: store has ${own.from.day}→${own.to.day}, page draws none (${t.none})`);
      continue;
    }
    measured++;
    if (!own?.from) {
      bad.push(`${t.tile}: page draws a change, the store has no window`);
      continue;
    }
    const same =
      String(own.from.day) === t.fromDay &&
      own.from.block === t.fromBlock &&
      own.from.raw === t.fromRaw &&
      String(own.to.day) === t.toDay &&
      own.to.block === t.toBlock &&
      own.to.raw === t.toRaw;
    if (!same)
      bad.push(
        `${t.tile}: page ${t.fromDay}@${t.fromBlock}=${t.fromRaw} → ${t.toDay}@${t.toBlock}=${t.toRaw}; store ${own.from.day}@${own.from.block}=${own.from.raw} → ${own.to.day}@${own.to.block}=${own.to.raw}`,
      );
    const scale = 10n ** 18n;
    const ownChange =
      BigInt(own.from.raw) === 0n
        ? "from-zero"
        : Number((BigInt(own.to.raw) * scale) / BigInt(own.from.raw)) / Number(scale) - 1;
    if (ownChange === "from-zero" ? t.change !== "from-zero" : Math.abs(Number(t.change) - ownChange) > 1e-12)
      bad.push(`${t.tile}: change ${t.change} vs own ${ownChange}`);
    if (t.days !== own.days.join(","))
      bad.push(`${t.tile}: line days ${t.days?.split(",").length} vs store's ${own.days.length}`);
    if (!t.sentence.includes(`block ${Number(t.toBlock).toLocaleString("en-US")}`))
      bad.push(`${t.tile}: sentence "${t.sentence}" does not name block ${t.toBlock}`);
  }
  check(
    `${id}b each tile's change, its two reads and its line's days equal the daily store's own answer`,
    store != null && bad.length === 0 && measured >= 2,
    store == null ? "the store did not answer" : bad.join("; ") || `${measured} tiles measured against the store`,
  );

  // No absolute figure: once the blocks, dates, the window's days and percentages are taken out
  // of each sentence, no digit is left. The two stated exceptions: a window
  // that starts at zero names where it went, and the census's read.
  const figures = strip.tiles
    .filter((t) => t.change !== "from-zero" && t.census == null)
    .map((t) => [t.tile, t.sentence.replace(STATED_BLOCK, "").replace(DATE, "").replace(WINDOW, "").replace(PCT, "")])
    .filter(([, rest]) => /\d/.test(rest));
  check(
    `${id}c the strip prints no absolute figure: its sentences name changes, blocks and dates`,
    figures.length === 0 && strip.caption != null && !/\d/.test(strip.caption),
    figures.map(([t, rest]) => `${t}: "${rest}"`).join("; ") || `caption "${strip.caption}"`,
  );

  const holders = strip.tiles.find((t) => t.tile === "holders");
  if (censusFamily) {
    check(
      `${id}d the Holders tile draws the store's series, or the census's read with no line`,
      holders != null &&
        (holders.change != null || holders.none === "young" || (holders.census != null && holders.days == null)),
      holders ? `"${holders.sentence}"` : "no tile",
    );
  } else {
    check(
      `${id}d the Holders tile on Yearn states that there is no census, and draws no line`,
      holders != null && holders.census === "none" && /no census/.test(holders.sentence) && holders.days == null,
      holders ? `"${holders.sentence}"` : "no tile",
    );
  }
}

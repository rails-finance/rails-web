/**
 * /coverage — cell-anchored popovers for column notes, essay under the name,
 * header-anchored popovers for capability definitions.
 *
 * Asserts the current interaction model: an info mark (ⓘ) beside each Protocol
 * views ✓ tick opens a POPOVER pinned to that cell showing the explorer's own
 * VIEW_NOTES one-liner; an info mark on each ⊘ ("can't provide") cell opens a
 * popover pinned to THAT cell showing its own `{ why }` string — two ⊘ cells
 * in the same row show two DIFFERENT strings, never a shared one. Separately,
 * EVERY protocol carrying a COVERAGE_NOTES entry (whether or not it also
 * carries a ⊘ cell) gets a "Why not deeper" trigger under its name that opens
 * the full essay as a push-down row. A THIRD grammar sits in `<thead>`: an
 * info mark beside each column's label opens a popover pinned to that header
 * showing `CAPABILITIES[].detail`, sentence-cased for display — what
 * replaced the standalone `<dl>` legend this page used to open with on both
 * viewports. Below md, the definitions live one tap away instead: each
 * included-capability pill on a mobile card is its own trigger, opening a
 * bottom sheet with that capability's `detail` (capability-sheet.tsx) — see
 * mobile()'s own assertions. Single-open accordion across all THREE header/
 * cell/essay grammars; zebra-by-data-index, full-bleed colSpan and border-t
 * seams all still hold. The mobile card stack's own disclosure (protocol view
 * + structural note, unrelated to the capability sheet) is unchanged.
 *
 * Visibility is asserted with innerText / bounding boxes, never textContent —
 * textContent returns the text of `display:none` nodes, so a collapsed-panel
 * check written with it passes in every state and can never go red. A cell
 * popover, the essay drawer, and a header popover are all always-mounted-
 * and-hidden, so this discipline is checked on one of each.
 *
 * Roster and trigger counts are derived from the source modules, never
 * hardcoded.
 *
 * ⚠️ Every trigger's open state reads through the ⓘ mark's COLOUR, never a
 * rotation — `23419cb7` retired the chevrons deliberately (one there reads as
 * table-sort). An assertion on `rotate` can only ever go red; two of them sat
 * here doing exactly that, alongside six comparing the raw `detail` source
 * against copy the page sentence-cases. Both were fixed 2026-08-30.
 *
 * The matrix also seats each `COMING_SOON` entry as its own row now (spliced
 * alphabetically by `lib/shared/coverage.ts`'s `coverageRows()`), and the
 * mobile card stack the same way — no more paragraph below either layout.
 * That row makes NO capability claims: an icon, a linked name, a neutral
 * "Coming soon" pill, and one muted note spanned across every capability
 * column, never a mark or a disclosure trigger of its own. Row order, pill
 * neutrality, the spanned colSpan, the absent marks/triggers, and zebra
 * parity through that row are all asserted below, with the row count and its
 * expected neighbours derived from the page's own `COMING_SOON` array (never
 * hardcoded to "LlamaLend V2" specifically).
 */
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log("  ok:", msg);
  } else {
    failures++;
    console.log("  FAIL:", msg);
  }
}

/* ── Derive the expected counts from the data modules ─────────────────── */
const coverageSrc = fs.readFileSync("lib/shared/coverage.ts", "utf8");
// COVERAGE_NOTES is the last export in the file, so everything after its
// declaration is its own keys. VIEW_NOTES sits above it, so bound its slice
// at the record's closing `};` (mirroring the CAPABILITIES `];` bound below).
const ALL_NOTE_IDS = [...coverageSrc.split("export const COVERAGE_NOTES")[1].matchAll(/^ {2}("?[a-z0-9-]+"?):/gm)].map(
  (m) => m[1].replace(/"/g, ""),
);
const ALL_VIEW_IDS = [
  ...coverageSrc
    .split("export const VIEW_NOTES")[1]
    .split("};")[0]
    .matchAll(/^ {2}("?[a-z0-9-]+"?):/gm),
].map((m) => m[1].replace(/"/g, ""));
const protocolsSrc = fs.readFileSync("lib/shared/protocols.ts", "utf8");
const ALL_PROTO_IDS = [...protocolsSrc.matchAll(/^ {4}id: "([^"]+)"/gm)].map((m) => m[1]);
const ALL_PROTO_LABELS = [...protocolsSrc.matchAll(/^ {4}label: "([^"]+)"/gm)].map((m) => m[1]);
// The coverage surface is per-chain routes (/coverage/ethereum,
// /coverage/base) since the chain-directory retirement, so every derived
// expectation below is scoped to ONE chain's slice of the roster. The deep
// multi-theme desktop/mobile passes run against the Ethereum page (the larger
// slice, and the one carrying every disclosure grammar); base() at the end
// holds the Base page to its own roster.
const PROTO_CHAINS = [...protocolsSrc.matchAll(/^ {4}chainId: (\d+),/gm)].map((m) => Number(m[1]));
assert(
  PROTO_CHAINS.length === ALL_PROTO_IDS.length,
  `parsed a chainId for every roster id (${PROTO_CHAINS.length} vs ${ALL_PROTO_IDS.length})`,
);
// Which entries are UNLAUNCHED (lib/shared/protocols.ts `unlaunched`) — read
// per spec block, since the flag is optional and the parallel arrays above are
// index-aligned. An unlaunched explorer serves at its URL and is linked from
// nowhere, so it is not a matrix row on a LAUNCHED chain's coverage page.
const SPEC_BLOCKS = protocolsSrc.split(/^ {4}id: "/gm).slice(1);
const PROTO_UNLAUNCHED = SPEC_BLOCKS.map((b) => /^ {4}unlaunched: true,$/m.test(b));
assert(
  PROTO_UNLAUNCHED.length === ALL_PROTO_IDS.length,
  `parsed an unlaunched flag for every roster id (${PROTO_UNLAUNCHED.length} vs ${ALL_PROTO_IDS.length})`,
);
// The page's own rule (lib/shared/coverage.ts `coverageExplorers`): a chain
// with at least one launched explorer lists its launched ones; a chain with
// none is itself unlaunched, and its page lists the whole chain for whoever
// typed the URL.
const sliceForChain = (chainId) => {
  const all = ALL_PROTO_IDS.map((id, i) => ({
    id,
    label: ALL_PROTO_LABELS[i],
    chain: PROTO_CHAINS[i],
    unlaunched: PROTO_UNLAUNCHED[i],
  })).filter((e) => e.chain === chainId);
  const launched = all.filter((e) => !e.unlaunched);
  return launched.length > 0 ? launched : all;
};
const ETH_SLICE = sliceForChain(1);
const BASE_SLICE = sliceForChain(8453);
const PROTO_IDS = ETH_SLICE.map((e) => e.id);
const PROTO_LABELS = ETH_SLICE.map((e) => e.label);
const ETH_ID_SET = new Set(PROTO_IDS);
const NOTE_IDS = ALL_NOTE_IDS.filter((id) => ETH_ID_SET.has(id));
const VIEW_IDS = ALL_VIEW_IDS.filter((id) => ETH_ID_SET.has(id));

// The coming-soon roster, read from the page's own COMING_SOON array — never
// hardcoded, so a second entry (or a removed one) changes these counts with
// no edit here.
// The page component moved when /coverage split into per-chain routes — the
// two thin route files share components/coverage/coverage-page.tsx, and the
// COMING_SOON array lives there. (An entry may carry `chainId: 8453` to land
// on the Base page; this script's expectations assume the Ethereum page, the
// component's default for an entry without one.)
const pageSrc = fs.readFileSync("components/coverage/coverage-page.tsx", "utf8");
// ⚠️ Handle the EMPTY form. The list is currently `= [];` on one line, which has
// no "\n];" terminator — splitting on that alone would hand the rest of the FILE
// to the id/label regexes below and invent entries out of unrelated code.
const comingSoonTail = pageSrc.split("const COMING_SOON")[1] ?? "";
const comingSoonSrc = /^[^\n]*\[\s*\];/.test(comingSoonTail) ? "" : comingSoonTail.split("\n];")[0];
const COMING_SOON_IDS = [...comingSoonSrc.matchAll(/^ {4}id: "([^"]+)"/gm)].map((m) => m[1]);
const COMING_SOON_LABELS = [...comingSoonSrc.matchAll(/^ {4}label: "([^"]+)"/gm)].map((m) => m[1]);
// Note + href derived too, so the row's copy and link are asserted without this
// script naming any particular announced explorer (it used to hardcode
// "deployed but still empty" and "/llamalend-v2", both of which then had to be
// hand-edited when that entry retired).
const COMING_SOON_NOTES = [...comingSoonSrc.matchAll(/^ {4}note: "([^"]+)"/gm)].map((m) => m[1]);
const COMING_SOON_HREFS = [...comingSoonSrc.matchAll(/^ {4}href: "([^"]+)"/gm)].map((m) => m[1]);
assert(COMING_SOON_IDS.length === COMING_SOON_LABELS.length, "COMING_SOON ids and labels parse to the same count");

// Mirrors lib/shared/coverage.ts's coverageRows(): splice each coming-soon
// label into its alphabetical slot among the (already-alphabetical) protocol
// labels — insert, never re-sort. Lets the row-order assertions below check
// the WHOLE merged order end-to-end without hardcoding which two protocols
// end up as neighbours.
function deriveRowLabels(protoLabels, comingSoonLabels) {
  const rows = protoLabels.map((label) => ({ kind: "explorer", label }));
  for (const label of comingSoonLabels) {
    const at = rows.findIndex((r) => r.label.localeCompare(label) > 0);
    const row = { kind: "soon", label };
    if (at === -1) rows.push(row);
    else rows.splice(at, 0, row);
  }
  return rows;
}
const EXPECTED_ROWS = deriveRowLabels(PROTO_LABELS, COMING_SOON_LABELS);
const TOTAL_ROWS = EXPECTED_ROWS.length;
const SOON_IDX = EXPECTED_ROWS.findIndex((r) => r.kind === "soon");
const SOON_BEFORE = EXPECTED_ROWS[SOON_IDX - 1]?.label;
const SOON_AFTER = EXPECTED_ROWS[SOON_IDX + 1]?.label;
// COMING_SOON is EMPTY today: LlamaLend V2 shipped inside the llamalend
// explorer rather than as its own, so the announcement retired with it. The
// soon-specific assertions below are gated on this rather than deleted — the
// machinery still works and the next announced explorer must be checked, not
// silently unverified. ⚠️ Gate on it wherever `EXPECTED_ROWS[SOON_IDX]` is
// dereferenced: at SOON_IDX === -1 that is `undefined` and `.label` throws.
const HAS_SOON = SOON_IDX !== -1;

const CAP_BLOCK = coverageSrc.split("export const CAPABILITIES")[1].split("];")[0];
const CAP_COUNT = [...CAP_BLOCK.matchAll(/^ {4}key:/gm)].length;
// Per-capability { key, label, detail }, parsed off the same block — each
// entry's own "detail:" is matched non-greedily starting from its "key:", so
// it can't cross into a later entry's fields (the comment inside the
// `verification` entry contains neither literal, so it can't confuse this).
// Used for the header-popover assertions: derived expected copy, not
// hardcoded strings.
const CAP_ENTRIES = [
  ...CAP_BLOCK.matchAll(
    // key is camelCase (oracleUsd), not just lowercase — the WHY_CELLS regex
    // above only needs kebab-case protocol ids, but DepthKey mixes case.
    /key:\s*"([a-zA-Z0-9]+)"[\s\S]*?label:\s*"([^"]+)"[\s\S]*?detail:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g,
  ),
].map(([, key, label, detail]) => ({ key, label, detail }));

// Every popover body renders `sentenceCase(text)` — the page capitalises the
// first character of the raw `detail` / `why` / view one-liner for display
// (components/coverage/depth-matrix.tsx). Mirror it here rather than
// comparing case-insensitively, so the assertion still pins the exact string
// the reader sees. Six of the seven `detail` strings start lower-case, so
// comparing the raw source string went red on a correct page.
const sentenceCase = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const NOTED = PROTO_IDS.filter((id) => NOTE_IDS.includes(id));
// The mobile card stack (asserted by mobile(), untouched by this change) keeps
// ONE combined disclosure per card — the protocols with a protocol-view
// one-liner UNION the protocols with a structural note. Desktop's essay rows
// are a DIFFERENT, smaller census now (see NOTED below) — this one stays for
// mobile()'s own assertion.
const DRAWERED = PROTO_IDS.filter((id) => NOTE_IDS.includes(id) || VIEW_IDS.includes(id));

// Which capability keys carry a `{ why }` cell, per protocol — parsed off the
// DEPTH object's own source rather than imported (the file is TS, and this
// script stays a plain no-build .mjs). Each protocol entry reads
// `  <id>: explorerDepth({ ...cells... }),` at 2-space indent; a nested
// `{ why }` or `{ awaiting }` cell sits at 4-space indent, so a non-greedy
// match up to the next 2-space `}),` closes on the OUTER brace, never a
// nested one.
const depthSrc = coverageSrc.split("export const DEPTH")[1].split("\nexport function cellFor")[0];
const WHY_CELLS = Object.fromEntries(
  [...depthSrc.matchAll(/^ {2}"?([a-z0-9-]+)"?: explorerDepth\(\{([\s\S]*?)\n {2}\}\),/gm)].map(([, id, body]) => [
    id,
    // `\s*` already spans newlines, so this catches both the single-line
    // `key: { why: "…" }` cells (morpho, pwn) and the multi-line ones
    // (fluid, maple) alike.
    [...body.matchAll(/(\w+):\s*\{\s*why:/g)].map((m) => m[1]),
  ]),
);
// The protocols carrying at least one ⊘ ("can't provide") cell — each cell
// now opens its OWN popover, anchored to that cell. Ethereum-scoped like
// every other derived set: the passes below run against /coverage/ethereum.
const WHY_CELL_IDS = Object.keys(WHY_CELLS).filter((id) => WHY_CELLS[id]?.length > 0 && ETH_ID_SET.has(id));
// The 8 ⊘-cell popover triggers: one per {why} cell, wherever it sits.
const WHY_CELL_TRIGGER_COUNT = WHY_CELL_IDS.reduce((n, id) => n + WHY_CELLS[id].length, 0);
// The views-tick chevron popover: one per protocol with a VIEW_NOTES entry —
// the invariant in coverage.ts is that this coincides exactly with
// `views: true`.
const VIEWS_TRIGGER_COUNT = VIEW_IDS.length;
// The name-level "Why not deeper" essay trigger now shows for EVERY protocol
// with a COVERAGE_NOTES entry — `Boolean(note)`, no longer gated on whether
// the row also carries a ⊘ cell. So the roster IS NOTE_IDS; several of them
// (fluid, maple, morpho, pwn, frankencoin) carry BOTH a name trigger AND one
// or more ⊘-cell popovers of their own — the two disclosures coexist.
const NAME_TRIGGER_IDS = NOTE_IDS;

console.log(
  `derived: ${PROTO_IDS.length} protocols, ${VIEW_IDS.length} with a view one-liner, ${NOTED.length} with a structural note, ${CAP_COUNT} capabilities`,
);
console.log(
  `derived coming-soon: ${COMING_SOON_IDS.length} entries (${COMING_SOON_LABELS.join(", ")}) → ${TOTAL_ROWS} total matrix rows; "${EXPECTED_ROWS[SOON_IDX]?.label}" sits between "${SOON_BEFORE}" and "${SOON_AFTER}"`,
);
console.log(
  `derived triggers: ${VIEWS_TRIGGER_COUNT} views-tick popovers, ${WHY_CELL_TRIGGER_COUNT} ⊘-cell popovers (${WHY_CELL_IDS.join(", ")}), ${NAME_TRIGGER_IDS.length} name-level essay triggers (${NAME_TRIGGER_IDS.join(", ")})`,
);

// Derived invariants the new model depends on — asserted here (no browser
// needed yet) so a coverage.ts edit that breaks the shape goes red immediately,
// not just silently changes the derived counts below it.
const WHY_CELL_IDS_UNNOTED = WHY_CELL_IDS.filter((id) => !NOTE_IDS.includes(id));
assert(
  WHY_CELL_IDS_UNNOTED.length === 0,
  `every ⊘-cell protocol also carries a COVERAGE_NOTES entry (so it has a name trigger to reach the essay from)${WHY_CELL_IDS_UNNOTED.length ? ` — missing: ${WHY_CELL_IDS_UNNOTED.join(", ")}` : ""}`,
);
assert(
  ["pwn", "maple"].some((id) => WHY_CELL_IDS.includes(id) && NAME_TRIGGER_IDS.includes(id)),
  "a ⊘-cell protocol (pwn or maple) is ALSO among the name-trigger roster — the old !hasWhyCell gate is gone",
);
assert(CAP_ENTRIES.length === CAP_COUNT, `parsed ${CAP_ENTRIES.length} capability entries, matching CAP_COUNT`);
assert(
  new Set(CAP_ENTRIES.map((c) => c.detail)).size === CAP_ENTRIES.length,
  "every capability's detail string is genuinely distinct from the others",
);

const browser = await chromium.launch();

/* ── Desktop ──────────────────────────────────────────────────────────── */
async function desktop(theme) {
  console.log(`\n== desktop 1280px · ${theme} ==`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 1800 }, colorScheme: theme });
  await page.goto(BASE + "/coverage/ethereum", { waitUntil: "networkidle" });
  await page.evaluate((t) => document.documentElement.classList.toggle("dark", t === "dark"), theme);
  await page.waitForTimeout(250);
  const viewportWidth = page.viewportSize().width;

  // Guard: the page really rendered. Without this every "does NOT contain"
  // assertion below would pass against an error page or an empty body.
  const h1 = await page.locator("h1").first().innerText();
  assert(/What Rails Covers/.test(h1), `page loaded (h1 = ${JSON.stringify(h1)})`);

  const table = page.locator("table");
  assert((await table.count()) === 1, "one matrix table");

  // The old standalone prose section is gone.
  const headings = (await page.locator("h2").allTextContents()).map((s) => s.replace(/\s+/g, " ").trim());
  assert(
    !headings.some((h) => /can.t be captured from the chain/i.test(h)),
    "no standalone 'What can't be captured from the chain' section",
  );

  // The standalone `<dl>` legend retired for good (both viewports): desktop's
  // definitions live in the header popovers, mobile's in each capability
  // pill's own bottom sheet (capability-sheet.tsx) — asserted in mobile()
  // below. No `<dl>` should remain anywhere in the DOM.
  assert((await page.locator("dl").count()) === 0, "the old capability-definitions <dl> is gone from the DOM");

  // The section-level heading that used to sit above the legend read as
  // filler over a self-explanatory table — retired to an sr-only node, so
  // no visible "How deep each explorer goes" text renders anywhere.
  assert(
    !/how deep each explorer goes/i.test(await page.locator("body").innerText()),
    "the retired 'How deep each explorer goes' heading text is not visible anywhere",
  );

  // Width: max-w-7xl (80rem = 1280px) not max-w-5xl (64rem = 1024px). At a
  // 1280 viewport the shell is viewport-width; assert it beats the 5xl cap.
  const sectionBox = await table.locator("xpath=ancestor::section[1]").boundingBox();
  assert(sectionBox.width > 1100, `matrix section is wide (${Math.round(sectionBox.width)}px > 1100)`);

  // Rows: one per protocol PLUS one per coming-soon entry (both use
  // `<th scope="row">`, so both land in this census; the always-mounted essay
  // rows use only `<td>` and so add no extra rows here).
  const markRows = table.locator("tbody tr").filter({ has: page.locator("th[scope=row]") });
  assert(
    (await markRows.count()) === TOTAL_ROWS,
    `${TOTAL_ROWS} matrix rows (${PROTO_IDS.length} protocols + ${COMING_SOON_IDS.length} coming-soon)`,
  );

  // Placement: the merged row order matches the shared coverageRows() splice
  // end-to-end, derived from source rather than asserting two hardcoded
  // neighbour names — a second coming-soon entry (or a reordered roster)
  // moves the expectation with it.
  const rowLabels = (await table.locator("th[scope=row] a").allTextContents()).map((s) =>
    s.replace(/\s+/g, " ").trim(),
  );
  assert(rowLabels.length === TOTAL_ROWS, `${TOTAL_ROWS} row-header labels found`);
  assert(
    rowLabels.every((label, idx) => label === EXPECTED_ROWS[idx].label),
    `row order matches the alphabetical splice end-to-end (first mismatch at index ${rowLabels.findIndex((l, idx) => l !== EXPECTED_ROWS[idx].label)})`,
  );
  if (HAS_SOON) {
    assert(
      SOON_IDX > 0 && rowLabels[SOON_IDX - 1] === SOON_BEFORE && rowLabels[SOON_IDX + 1] === SOON_AFTER,
      `soon row "${EXPECTED_ROWS[SOON_IDX]?.label}" sits between "${SOON_BEFORE}" and "${SOON_AFTER}" in document order`,
    );

    // The coming-soon row itself: an icon + linked label + a neutral "Coming
    // soon" pill, and ONE muted note cell spanning every capability column —
    // no capability marks, no essay/popover trigger of its own. That's what
    // keeps it unaudited: a matrix row makes an audited per-capability claim,
    // and this row makes none.
    const soonRow = markRows.filter({ hasText: EXPECTED_ROWS[SOON_IDX].label });
    assert((await soonRow.count()) === 1, "exactly one coming-soon row found");
    const soonPill = soonRow.locator("th span", { hasText: "Coming soon" });
    assert((await soonPill.count()) === 1, "the coming-soon row carries a 'Coming soon' pill");
    const soonPillClass = (await soonPill.first().getAttribute("class")) ?? "";
    assert(/\brb-/.test(soonPillClass), `the pill uses neutral rb tones (class: ${soonPillClass})`);
    assert(
      !/\bgreen\b|\bblue\b/.test(soonPillClass),
      "the pill carries NO green (marketing) or blue (interaction) tones — color grammar reserves those",
    );
    const soonNoteCell = soonRow.locator("td[colspan]");
    assert((await soonNoteCell.count()) === 1, "the coming-soon row has one spanned note cell");
    const soonColSpan = await soonNoteCell.getAttribute("colspan");
    assert(
      Number(soonColSpan) === CAP_COUNT,
      `the note cell spans all ${CAP_COUNT} capability columns (colspan=${soonColSpan})`,
    );
    assert((await soonNoteCell.innerText()).length > 0, "the coming-soon note text renders in the spanned cell");
    assert((await soonRow.locator("td svg").count()) === 0, "the coming-soon row carries NO capability marks");
    assert((await soonRow.locator("button").count()) === 0, "the coming-soon row has no essay or popover trigger");
  } else {
    // Empty list — assert the ABSENCE rather than skipping, or an accidental
    // stray row would sail through unnoticed. Every matrix row must be a real
    // audited explorer.
    assert(
      (await table.locator("th span", { hasText: "Coming soon" }).count()) === 0,
      "COMING_SOON is empty, so NO 'Coming soon' pill renders in the matrix",
    );
    // ⚠️ Do NOT assert `td[colspan] === 0` here: the essay push-down row uses a
    // spanned cell too, so that reads as a coming-soon row on every protocol
    // carrying a structural note. Assert the row COUNT instead — the derived
    // TOTAL_ROWS already excludes soon rows, so a stray one shows up as a row
    // the alphabetical splice did not predict.
    assert(
      rowLabels.length === PROTO_LABELS.length,
      `every matrix row is a real explorer (${rowLabels.length} rows vs ${PROTO_LABELS.length} protocols)`,
    );
  }

  // Three distinct trigger shapes, not one generic disclosure — the
  // affordance lives on the cell (or name) it describes.
  const viewsTriggers = table.locator('button[aria-label*="protocol view shows"]');
  const whyCellTriggers = table.locator('button[aria-label*="can\'t provide"]');
  const nameTriggers = table.locator('button[aria-label*="doesn\'t go deeper"]');
  assert((await viewsTriggers.count()) === VIEWS_TRIGGER_COUNT, `${VIEWS_TRIGGER_COUNT} views-tick popover triggers`);
  assert(
    (await whyCellTriggers.count()) === WHY_CELL_TRIGGER_COUNT,
    `${WHY_CELL_TRIGGER_COUNT} ⊘-cell popover triggers`,
  );
  assert(
    (await nameTriggers.count()) === NAME_TRIGGER_IDS.length,
    `${NAME_TRIGGER_IDS.length} name-level essay triggers (ALL protocols with a note, incl. ⊘-cell ones)`,
  );

  // Header-anchored popover triggers — one per capability column, showing
  // that column's own `detail`. Count is derived from CAPABILITIES, not
  // hardcoded.
  const headerTriggers = table.locator("button[aria-controls^='coverage-header-']");
  assert((await headerTriggers.count()) === CAP_COUNT, `${CAP_COUNT} header popover triggers`);

  // Every disclosure trigger controls a cell popover (`coverage-cell-`), the
  // name-level essay (`coverage-details-`), or a header popover
  // (`coverage-header-`) — the three id families are disjoint, so this also
  // proves no trigger controls a fourth, unaccounted shape.
  const allTriggers = table.locator("button[aria-controls^='coverage-']");
  assert(
    (await allTriggers.count()) === VIEWS_TRIGGER_COUNT + WHY_CELL_TRIGGER_COUNT + NAME_TRIGGER_IDS.length + CAP_COUNT,
    "every disclosure trigger is one of the four known shapes",
  );

  // Every protocol desc renders as an always-visible second line.
  const descs = await table.locator("th[scope=row] p").count();
  assert(descs >= PROTO_IDS.length, `desc line under every protocol name (${descs} >= ${PROTO_IDS.length})`);

  // Essay rows span the whole table, derived width — one per NOTED protocol,
  // not the old view∪note union (that union is still correct for mobile()'s
  // combined disclosure, just not for desktop's essay row anymore). Scoped to
  // `td`s that wrap an essay panel div — the coming-soon row's own spanned
  // `<td>` also carries a `colspan` (asserted separately above, at CAP_COUNT
  // not CAP_COUNT + 1) and must NOT be counted as an essay row here.
  const spans = await table
    .locator("tbody tr td[colspan]")
    .filter({ has: page.locator("[id^='coverage-details-']") })
    .evaluateAll((tds) => tds.map((td) => Number(td.getAttribute("colspan"))));
  assert(spans.length === NOTED.length, `${NOTED.length} essay rows (one per protocol with a structural note)`);
  assert(
    spans.every((s) => s === CAP_COUNT + 1),
    `every essay row spans ${CAP_COUNT + 1} columns`,
  );

  // Divider sits ABOVE each row (border-t), not below — otherwise the seam
  // falls between a row and its own note.
  const borderT = await markRows.evaluateAll((trs) => trs.map((tr) => getComputedStyle(tr).borderTopWidth !== "0px"));
  assert(borderT[0] === false, "first row has no top border");
  assert(
    borderT.slice(1).every(Boolean),
    `rows 2..${borderT.length} each carry a top border (${borderT.slice(1).filter(Boolean).length}/${borderT.length - 1})`,
  );
  const borderB = await markRows.evaluateAll((trs) =>
    trs.map((tr) => getComputedStyle(tr).borderBottomWidth !== "0px"),
  );
  assert(!borderB.some(Boolean), "no row carries a bottom border");

  /* Zebra striping — asserted in BOTH themes (this fn runs for each). Row 1 is
     canvas; row 2 carries the alternate tint, so their computed backgrounds
     must differ. Parity is by data index, not nth-child, so the always-mounted
     essay rows can't shift the pattern. */
  const bg1 = await markRows.nth(0).evaluate((tr) => getComputedStyle(tr).backgroundColor);
  const bg2 = await markRows.nth(1).evaluate((tr) => getComputedStyle(tr).backgroundColor);
  assert(bg1 !== bg2, `zebra: data row 2 background differs from row 1 (${bg1} vs ${bg2})`);

  // The coming-soon row participates in the SAME merged-index parity as any
  // other row — no reset, no row of its own outside the pattern. Read every
  // markRow's background + text once, locate the soon row by its label, and
  // check it differs from its immediate neighbours (alternation holds right
  // across it, not just at rows 1/2 above).
  const zebraRows = await markRows.evaluateAll((trs) =>
    trs.map((tr) => ({ bg: getComputedStyle(tr).backgroundColor, text: tr.innerText })),
  );
  if (HAS_SOON) {
    const soonZebraIdx = zebraRows.findIndex((r) => r.text.includes(EXPECTED_ROWS[SOON_IDX].label));
    assert(soonZebraIdx !== -1, "the coming-soon row is found among the striped rows");
    if (soonZebraIdx > 0) {
      assert(
        zebraRows[soonZebraIdx].bg !== zebraRows[soonZebraIdx - 1].bg,
        "the coming-soon row's stripe differs from the row above it",
      );
    }
    if (soonZebraIdx < zebraRows.length - 1) {
      assert(
        zebraRows[soonZebraIdx].bg !== zebraRows[soonZebraIdx + 1].bg,
        "the coming-soon row's stripe differs from the row below it",
      );
    }
  }

  /* Collapsed state — visibility asserted two independent ways, once for each
     always-mounted shape (the essay row, and a cell popover). Checked BEFORE
     any interaction below. */
  const frankencoinFragment = "posts collateral against it";
  const frankencoinPanel = page.locator("#coverage-details-frankencoin");
  assert((await frankencoinPanel.count()) === 1, "frankencoin essay panel is in the DOM when collapsed");
  assert(
    (await frankencoinPanel.textContent()).includes(frankencoinFragment),
    "frankencoin's structural note ships in the DOM by default (textContent)",
  );
  assert(!(await frankencoinPanel.isVisible()), "frankencoin essay panel is NOT visible when collapsed (isVisible)");
  assert((await frankencoinPanel.boundingBox()) === null, "frankencoin essay panel has no bounding box when collapsed");
  const bodyTextCollapsed = await page.locator("body").innerText();
  assert(
    !bodyTextCollapsed.includes(frankencoinFragment),
    "frankencoin's structural note is NOT in body innerText when collapsed",
  );
  // Sanity on the trap itself: textContent DOES contain it, so a textContent
  // check here would be unfalsifiable. Prove the two disagree.
  assert(
    (await page.locator("body").textContent()).includes(frankencoinFragment) &&
      !bodyTextCollapsed.includes(frankencoinFragment),
    "textContent and innerText genuinely disagree (the check can go red)",
  );

  // Same trap, the cell-popover side: morpho's views-cell popover carries the
  // VIEW_NOTES one-liner ("immutable loan-to-value" — morpho's structural
  // note says "loan-to-value" but never "immutable"), collapsed by default.
  const viewFragment = "immutable loan-to-value";
  const morphoViewsPopover = page.locator("#coverage-cell-morpho-views");
  assert((await morphoViewsPopover.count()) === 1, "morpho's views-cell popover is in the DOM when collapsed");
  assert(
    (await morphoViewsPopover.textContent()).includes(viewFragment),
    "a protocol-view one-liner ships in the popover's DOM by default (textContent)",
  );
  assert(!(await morphoViewsPopover.isVisible()), "morpho's views popover is NOT visible when collapsed (isVisible)");
  assert(
    !bodyTextCollapsed.includes(viewFragment),
    "the protocol-view one-liner is NOT in body innerText when collapsed",
  );

  /* PWN: three ⊘ cells (dashboard, oracleUsd, forensics) — each opens its OWN
     popover, never the shared essay, so two of them show genuinely DIFFERENT
     text. forensics and views are also PWN's last-two capability columns —
     used below for the edge-clamp assertion. */
  const pwnDashboardTrigger = page.locator("button[aria-controls='coverage-cell-pwn-dashboard']");
  const pwnOracleTrigger = page.locator("button[aria-controls='coverage-cell-pwn-oracleUsd']");
  const pwnForensicsTrigger = page.locator("button[aria-controls='coverage-cell-pwn-forensics']");
  const pwnViewsTrigger = page.locator("button[aria-controls='coverage-cell-pwn-views']");
  const pwnNameTrigger = page.locator("button[aria-controls='coverage-details-pwn']");
  const pwnDashboardPopover = page.locator("#coverage-cell-pwn-dashboard");
  const pwnOraclePopover = page.locator("#coverage-cell-pwn-oracleUsd");
  const pwnForensicsPopover = page.locator("#coverage-cell-pwn-forensics");
  const pwnViewsPopover = page.locator("#coverage-cell-pwn-views");
  const pwnEssay = page.locator("#coverage-details-pwn");
  assert((await pwnDashboardTrigger.count()) === 1, "pwn dashboard ⊘ trigger present");
  assert((await pwnOracleTrigger.count()) === 1, "pwn oracleUsd ⊘ trigger present");
  assert((await pwnNameTrigger.count()) === 1, "pwn (a ⊘-cell protocol) ALSO carries the name-level essay trigger now");

  await pwnDashboardTrigger.click();
  await page.waitForTimeout(150);
  assert(await pwnDashboardPopover.isVisible(), "pwn dashboard popover opens");
  const pwnDashboardText = await pwnDashboardPopover.innerText();
  assert(
    pwnDashboardText.includes("no health factor or floating rate"),
    "pwn dashboard popover shows its OWN why (innerText)",
  );
  assert(
    (await pwnDashboardTrigger.getAttribute("aria-expanded")) === "true",
    "pwn dashboard aria-expanded flips true",
  );

  await pwnOracleTrigger.click();
  await page.waitForTimeout(150);
  assert(await pwnOraclePopover.isVisible(), "pwn oracleUsd popover opens");
  assert(
    !(await pwnDashboardPopover.isVisible()),
    "opening a second pwn cell closed the first (single-open across cells)",
  );
  assert(
    (await pwnDashboardTrigger.getAttribute("aria-expanded")) === "false",
    "pwn dashboard aria-expanded dropped back to false",
  );
  const pwnOracleText = await pwnOraclePopover.innerText();
  assert(
    pwnOracleText.includes("the two parties set the price"),
    "pwn oracleUsd popover shows its OWN why (innerText)",
  );
  assert(pwnDashboardText !== pwnOracleText, "pwn's two ⊘ cells show genuinely DIFFERENT text");

  await pwnViewsTrigger.click();
  await page.waitForTimeout(150);
  assert(await pwnViewsPopover.isVisible(), "pwn views popover opens (last capability column)");
  assert(!(await pwnOraclePopover.isVisible()), "opening the views popover closed the oracleUsd popover");
  const pwnViewsBox = await pwnViewsPopover.boundingBox();
  assert(
    pwnViewsBox.x + pwnViewsBox.width <= viewportWidth + 1,
    `pwn views popover (last column) stays inside the viewport (right edge ${Math.round(pwnViewsBox.x + pwnViewsBox.width)} <= ${viewportWidth})`,
  );

  await pwnForensicsTrigger.click();
  await page.waitForTimeout(150);
  assert(await pwnForensicsPopover.isVisible(), "pwn forensics ⊘ popover opens (2nd-to-last capability column)");
  assert(!(await pwnViewsPopover.isVisible()), "opening the forensics popover closed the views popover");
  const pwnForensicsBox = await pwnForensicsPopover.boundingBox();
  assert(
    pwnForensicsBox.x + pwnForensicsBox.width <= viewportWidth + 1,
    `pwn forensics popover (2nd-to-last column) stays inside the viewport (right edge ${Math.round(pwnForensicsBox.x + pwnForensicsBox.width)} <= ${viewportWidth})`,
  );

  await pwnNameTrigger.click();
  await page.waitForTimeout(150);
  assert(await pwnEssay.isVisible(), "pwn's name-level essay drawer opens");
  assert(
    !(await pwnForensicsPopover.isVisible()),
    "opening the essay closed the previously-open cell popover (single-open across kinds)",
  );
  assert((await pwnEssay.innerText()).includes("peer-to-peer"), "pwn essay shows the protocol-level note");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  assert(!(await pwnEssay.isVisible()), "Escape closed the open essay drawer");

  /* Dismissal: outside pointerdown closes an open CELL popover. */
  await pwnOracleTrigger.click();
  await page.waitForTimeout(150);
  assert(await pwnOraclePopover.isVisible(), "pwn oracleUsd popover reopened for the dismissal test");
  await page.locator("h1").first().click();
  await page.waitForTimeout(150);
  assert(!(await pwnOraclePopover.isVisible()), "outside pointerdown closed the open cell popover");
  assert(
    (await pwnOracleTrigger.getAttribute("aria-expanded")) === "false",
    "aria-expanded dropped back to false after outside dismissal",
  );

  /* Maple: a views-tick popover, a ⊘-cell popover, and the name essay are
     THREE DISTINCT panels now (not one shared drawer multiplexing content). */
  const mapleViewsTrigger = page.locator("button[aria-controls='coverage-cell-maple-views']");
  const mapleViewsPopover = page.locator("#coverage-cell-maple-views");
  const mapleForensicsTrigger = page.locator("button[aria-controls='coverage-cell-maple-forensics']");
  const mapleForensicsPopover = page.locator("#coverage-cell-maple-forensics");
  const mapleNameTrigger = page.locator("button[aria-controls='coverage-details-maple']");
  const mapleEssay = page.locator("#coverage-details-maple");
  assert((await mapleViewsTrigger.count()) === 1, "maple has one views-tick popover trigger");
  assert((await mapleForensicsTrigger.count()) === 1, "maple has a forensics ⊘-cell popover trigger");
  assert((await mapleViewsTrigger.getAttribute("aria-expanded")) === "false", "maple views trigger starts collapsed");

  // ⚠️ The open-state affordance is the ⓘ mark's COLOUR, not a rotation. The
  // trigger carries a STATIC Info glyph beside the ✓ — `23419cb7` replaced the
  // chevron deliberately ("a chevron here reads as table-sort"), so `rotate`
  // reads "none" in both states and the rotation assertion this replaces could
  // only ever go red. Read the closed colour before opening, and compare.
  const mapleInfoGlyph = mapleViewsTrigger.locator("svg").last();
  const mapleInfoClosedColor = await mapleInfoGlyph.evaluate((el) => getComputedStyle(el).color);

  await mapleViewsTrigger.click();
  await page.waitForTimeout(150);
  assert(await mapleViewsPopover.isVisible(), "maple's views popover opens");
  const mapleViewsText = await mapleViewsPopover.innerText();
  assert(mapleViewsText.includes("syrup pools"), "maple's views popover shows the syrup-pools one-liner (innerText)");
  assert(!mapleViewsText.includes("tri-party"), "maple's views popover does NOT carry the essay's tri-party text");
  assert(!/Protocol view/i.test(mapleViewsText), "no 'Protocol view' header renders in the popover");
  assert(
    (await mapleViewsTrigger.getAttribute("aria-expanded")) === "true",
    "maple views trigger aria-expanded flips true",
  );
  // ⚠️⚠️ MOVE THE POINTER OFF FIRST. `TRIGGER_CLASS` carries
  // `hover:text-foreground`, and Playwright's click leaves the cursor parked on
  // the button — so a colour read straight after the click shows the HOVER
  // colour and this assertion passes with the open-state class deliberately
  // removed (it did, on the first draft). Park the pointer somewhere inert and
  // let the 150ms `transition-colors` settle, so open state is the only
  // difference between the two reads.
  await page.mouse.move(4, 4);
  await page.waitForTimeout(300);
  const mapleInfoOpenColor = await mapleInfoGlyph.evaluate((el) => getComputedStyle(el).color);
  assert(
    mapleInfoOpenColor !== mapleInfoClosedColor,
    `maple views ⓘ mark changes colour when open (${mapleInfoClosedColor} → ${mapleInfoOpenColor})`,
  );

  await mapleForensicsTrigger.click();
  await page.waitForTimeout(150);
  assert(await mapleForensicsPopover.isVisible(), "maple's forensics ⊘ popover opens");
  assert(
    !(await mapleViewsPopover.isVisible()),
    "opening the forensics popover closed the views popover (single-open across cells)",
  );
  assert(
    (await mapleViewsTrigger.getAttribute("aria-expanded")) === "false",
    "maple views trigger aria-expanded dropped back to false",
  );
  const mapleForensicsText = await mapleForensicsPopover.innerText();
  assert(mapleForensicsText.includes("off-chain custodians"), "maple forensics popover shows its OWN why (innerText)");
  assert(!/What the chain can.t say/i.test(mapleForensicsText), "no 'What the chain can't say' header renders");

  await mapleNameTrigger.click();
  await page.waitForTimeout(150);
  assert(await mapleEssay.isVisible(), "maple's name-level essay drawer opens");
  assert(
    !(await mapleForensicsPopover.isVisible()),
    "opening the essay closed the forensics popover (single-open across kinds)",
  );
  const mapleEssayText = await mapleEssay.innerText();
  assert(mapleEssayText.includes("tri-party"), "maple's name drawer shows the tri-party ESSAY (innerText)");
  assert(!mapleEssayText.includes("syrup pools"), "maple's essay does NOT carry the views popover's syrup-pools text");

  // Full-bleed: the essay cell is as wide as the table.
  const tableBox = await table.boundingBox();
  const mapleCellBox = await mapleEssay.locator("xpath=ancestor::td[1]").boundingBox();
  assert(Math.abs(mapleCellBox.width - tableBox.width) < 4, "essay panel cell spans the full table width");
  // The open essay row shares its parent data row's background, so it reads
  // as part of that row rather than a band of its own.
  const rowBgs = await mapleEssay.evaluate((el) => {
    const noteRow = el.closest("tr");
    const dataRow = noteRow.previousElementSibling;
    return { note: getComputedStyle(noteRow).backgroundColor, data: getComputedStyle(dataRow).backgroundColor };
  });
  assert(
    rowBgs.note === rowBgs.data,
    `open essay row shares its parent's background (${rowBgs.note} === ${rowBgs.data})`,
  );

  /* Single-open ACROSS ROWS, and across kinds: opening morpho's views popover
     closes maple's essay drawer entirely. */
  const morphoViewsTrigger = page.locator("button[aria-controls='coverage-cell-morpho-views']");
  await morphoViewsTrigger.click();
  await page.waitForTimeout(150);
  assert(await page.locator("#coverage-cell-morpho-views").isVisible(), "morpho's views popover opened");
  assert(
    !(await mapleEssay.isVisible()),
    "opening a popover on a different row CLOSED the essay drawer (single-open across rows AND kinds)",
  );

  /* Keyboard: Enter and Space both toggle a focused trigger. */
  await morphoViewsTrigger.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
  assert(!(await page.locator("#coverage-cell-morpho-views").isVisible()), "Enter closed the popover");
  await page.keyboard.press("Space");
  await page.waitForTimeout(120);
  assert(await page.locator("#coverage-cell-morpho-views").isVisible(), "Space re-opened the popover");
  assert(await morphoViewsTrigger.evaluate((b) => document.activeElement === b), "focus stays on the trigger");

  /* Escape also closes a plain cell popover (not just the essay drawer). */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);
  assert(!(await page.locator("#coverage-cell-morpho-views").isVisible()), "Escape closed the open cell popover");

  /* Clicking a lit trigger closes it (toggle-off), not just switches. */
  await morphoViewsTrigger.click();
  await page.waitForTimeout(120);
  assert(await page.locator("#coverage-cell-morpho-views").isVisible(), "re-opened for the toggle-off check");
  await morphoViewsTrigger.click();
  await page.waitForTimeout(120);
  assert(!(await page.locator("#coverage-cell-morpho-views").isVisible()), "clicking the open trigger again closes it");

  /* ── Column-header popovers: the third disclosure grammar, replacing the
       standalone <dl> legend on desktop ────────────────────────────────── */

  // Every header label is forced onto exactly two stacked lines
  // (splitHeaderLabel splits at the first space, not the browser's own
  // width-dependent wrap) — so every column's label block renders at the
  // SAME height, keeping the row aligned regardless of word count
  // ("Copy for LLM" is three words; the rest are two).
  const labelHeights = await page
    .locator("thead button span.flex.flex-col")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
  assert(labelHeights.length === CAP_COUNT, `${CAP_COUNT} two-line header label blocks`);
  assert(
    new Set(labelHeights).size === 1,
    `every header label block renders at the same height (uniform two lines: ${labelHeights.join(", ")})`,
  );

  // Each header popover's own detail ships in the DOM (collapsed) — checked
  // against the parsed CAPABILITIES source, not a hardcoded string, and for
  // every column (cheap: only 7).
  for (const cap of CAP_ENTRIES) {
    const panel = page.locator(`#coverage-header-${cap.key}`);
    assert((await panel.count()) === 1, `header popover for "${cap.label}" is in the DOM`);
    assert(
      (await panel.textContent()).includes(sentenceCase(cap.detail)),
      `header popover for "${cap.label}" carries its own detail text, sentence-cased (textContent)`,
    );
    assert(!(await panel.isVisible()), `header popover for "${cap.label}" is collapsed by default`);
  }

  // Spot-check two different columns show genuinely DIFFERENT detail text
  // when opened, aria-expanded flips, and opening a second header popover
  // closes the first (single-open within the header kind itself).
  const dashboardHeaderTrigger = page.locator("button[aria-controls='coverage-header-dashboard']");
  const oracleHeaderTrigger = page.locator("button[aria-controls='coverage-header-oracleUsd']");
  const dashboardHeaderPopover = page.locator("#coverage-header-dashboard");
  const oracleHeaderPopover = page.locator("#coverage-header-oracleUsd");
  // Same static-ⓘ grammar as the cells (see the maple check above): read the
  // closed colour first, because rotation is not what changes here.
  const oracleHeaderGlyph = oracleHeaderTrigger.locator("svg").last();
  const oracleHeaderClosedColor = await oracleHeaderGlyph.evaluate((el) => getComputedStyle(el).color);
  assert(
    (await dashboardHeaderTrigger.getAttribute("aria-expanded")) === "false",
    "dashboard header trigger starts collapsed",
  );
  await dashboardHeaderTrigger.click();
  await page.waitForTimeout(150);
  assert(await dashboardHeaderPopover.isVisible(), "dashboard header popover opens");
  assert(
    (await dashboardHeaderTrigger.getAttribute("aria-expanded")) === "true",
    "dashboard header trigger aria-expanded flips true",
  );
  const dashboardHeaderText = await dashboardHeaderPopover.innerText();
  await oracleHeaderTrigger.click();
  await page.waitForTimeout(150);
  assert(await oracleHeaderPopover.isVisible(), "oracleUsd header popover opens");
  assert(
    !(await dashboardHeaderPopover.isVisible()),
    "opening a second header popover closed the first (single-open within the header kind)",
  );
  assert(
    (await dashboardHeaderTrigger.getAttribute("aria-expanded")) === "false",
    "dashboard header trigger aria-expanded dropped back to false",
  );
  const oracleHeaderText = await oracleHeaderPopover.innerText();
  assert(
    dashboardHeaderText !== oracleHeaderText && dashboardHeaderText.length > 0 && oracleHeaderText.length > 0,
    "two different header popovers show genuinely DIFFERENT detail text",
  );

  // Pointer parked off the trigger for the same reason as the maple check above.
  await page.mouse.move(4, 4);
  await page.waitForTimeout(300);
  const oracleHeaderOpenColor = await oracleHeaderGlyph.evaluate((el) => getComputedStyle(el).color);
  assert(
    oracleHeaderOpenColor !== oracleHeaderClosedColor,
    `oracleUsd header ⓘ mark changes colour when open (${oracleHeaderClosedColor} → ${oracleHeaderOpenColor})`,
  );

  // innerText-vs-textContent discipline, same trap as the essay/cell checks
  // above, now proven on a header popover: "Event explainers" detail's
  // "plain-language explainer" fragment ships in the DOM but is absent from
  // collapsed innerText.
  await oracleHeaderTrigger.click(); // close it — back to nothing open
  await page.waitForTimeout(150);
  const explainersFragment = "plain-language explainer";
  const explainersHeaderPopover = page.locator("#coverage-header-explainers");
  assert(
    (await explainersHeaderPopover.textContent()).includes(explainersFragment),
    "explainers header popover carries its detail in the DOM by default (textContent)",
  );
  const bodyTextHeaderCollapsed = await page.locator("body").innerText();
  assert(
    !bodyTextHeaderCollapsed.includes(explainersFragment),
    "explainers header detail is NOT in body innerText when collapsed",
  );

  // Edge clamp: the last two capability columns (Liquidation forensics,
  // Protocol views) open their header popover inward, never clipping the
  // page's right edge.
  const forensicsHeaderTrigger = page.locator("button[aria-controls='coverage-header-forensics']");
  const forensicsHeaderPopover = page.locator("#coverage-header-forensics");
  await forensicsHeaderTrigger.click();
  await page.waitForTimeout(150);
  assert(await forensicsHeaderPopover.isVisible(), "forensics header popover opens (2nd-to-last column)");
  const forensicsHeaderBox = await forensicsHeaderPopover.boundingBox();
  assert(
    forensicsHeaderBox.x + forensicsHeaderBox.width <= viewportWidth + 1,
    `forensics header popover stays inside the viewport (right edge ${Math.round(forensicsHeaderBox.x + forensicsHeaderBox.width)} <= ${viewportWidth})`,
  );

  const viewsHeaderTrigger = page.locator("button[aria-controls='coverage-header-views']");
  const viewsHeaderPopover = page.locator("#coverage-header-views");
  await viewsHeaderTrigger.click();
  await page.waitForTimeout(150);
  assert(await viewsHeaderPopover.isVisible(), "views header popover opens (last column)");
  assert(
    !(await forensicsHeaderPopover.isVisible()),
    "opening the views header popover closed the forensics one (single-open)",
  );
  const viewsHeaderBox = await viewsHeaderPopover.boundingBox();
  assert(
    viewsHeaderBox.x + viewsHeaderBox.width <= viewportWidth + 1,
    `views header popover (last column) stays inside the viewport (right edge ${Math.round(viewsHeaderBox.x + viewsHeaderBox.width)} <= ${viewportWidth})`,
  );

  // Escape closes a header popover.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);
  assert(!(await viewsHeaderPopover.isVisible()), "Escape closed the open header popover");

  // Outside pointerdown closes a header popover.
  await viewsHeaderTrigger.click();
  await page.waitForTimeout(150);
  assert(await viewsHeaderPopover.isVisible(), "views header popover reopened for the dismissal test");
  await page.locator("h1").first().click();
  await page.waitForTimeout(150);
  assert(!(await viewsHeaderPopover.isVisible()), "outside pointerdown closed the open header popover");

  /* Single-open ACROSS ALL THREE KINDS: a header popover closes an open cell
     popover / essay drawer, and opening a cell popover or the essay closes an
     open header popover — proven in both directions. */
  await pwnDashboardTrigger.click();
  await page.waitForTimeout(150);
  assert(await pwnDashboardPopover.isVisible(), "pwn dashboard cell popover reopened for the cross-kind test");
  await dashboardHeaderTrigger.click();
  await page.waitForTimeout(150);
  assert(await dashboardHeaderPopover.isVisible(), "dashboard header popover opened");
  assert(
    !(await pwnDashboardPopover.isVisible()),
    "opening a header popover closed the open cell popover (single-open, cell -> header)",
  );

  await pwnNameTrigger.click();
  await page.waitForTimeout(150);
  assert(await pwnEssay.isVisible(), "pwn essay reopened for the cross-kind test");
  assert(
    !(await dashboardHeaderPopover.isVisible()),
    "opening the essay closed the open header popover (single-open, header -> essay)",
  );

  await dashboardHeaderTrigger.click();
  await page.waitForTimeout(150);
  assert(await dashboardHeaderPopover.isVisible(), "dashboard header popover reopened");
  assert(
    !(await pwnEssay.isVisible()),
    "opening a header popover closed the open essay drawer (single-open, essay -> header)",
  );

  await mapleViewsTrigger.click();
  await page.waitForTimeout(150);
  assert(await mapleViewsPopover.isVisible(), "maple views cell popover opened");
  assert(
    !(await dashboardHeaderPopover.isVisible()),
    "opening a cell popover closed the open header popover (single-open, header -> cell)",
  );
  // Return to nothing-open for the assertions below.
  await mapleViewsTrigger.click();
  await page.waitForTimeout(150);
  assert(!(await mapleViewsPopover.isVisible()), "closed for a clean slate");

  /* Accessible names stay distinct across every trigger, and every popover /
     essay panel id is unique — two different cells never collide on either. */
  const labels = await allTriggers.evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
  assert(new Set(labels).size === labels.length, "all trigger accessible names are distinct across the table");
  const panelIds = await page
    .locator("[id^='coverage-cell-'], [id^='coverage-details-'], [id^='coverage-header-']")
    .evaluateAll((els) => els.map((e) => e.id));
  assert(new Set(panelIds).size === panelIds.length, "every popover/essay/header panel id is unique across the table");

  /* Theme sanity with a panel open. */
  const seam = await markRows.nth(3).evaluate((tr) => getComputedStyle(tr).borderTopColor);
  console.log(`  (${theme} seam colour: ${seam})`);

  await page.close();
  return { seam, width: sectionBox.width };
}

/* ── Mobile ───────────────────────────────────────────────────────────── */
async function mobile(theme) {
  console.log(`\n== mobile 375px · ${theme} ==`);
  const page = await browser.newPage({ viewport: { width: 375, height: 1400 }, colorScheme: theme });
  await page.goto(BASE + "/coverage/ethereum", { waitUntil: "networkidle" });
  await page.evaluate((t) => document.documentElement.classList.toggle("dark", t === "dark"), theme);
  await page.waitForTimeout(250);

  assert(/What Rails Covers/.test(await page.locator("h1").first().innerText()), "page loaded");

  // The two sides of `md` must be genuinely different layouts. Only one
  // section carries `md:hidden` now (the card stack; the old legend section
  // retired) — still scoped through a filter rather than a bare
  // `section.md\\:hidden`, so a stray `md:hidden` section added elsewhere
  // can't silently turn any single-element method below (.innerText() etc)
  // into a strict-mode violation.
  assert(!(await page.locator("table").isVisible()), "desktop matrix is hidden below md");
  const cardSection = page.locator("section.md\\:hidden").filter({ has: page.locator("div.rounded-2xl.bg-raised") });
  assert((await cardSection.count()) === 1, "exactly one md:hidden section holds the card stack");
  const cards = cardSection.locator("div.rounded-2xl.bg-raised");
  assert(await cards.first().isVisible(), "mobile card stack is visible below md");
  assert(
    (await cards.count()) === TOTAL_ROWS,
    `${TOTAL_ROWS} mobile cards (${PROTO_IDS.length} protocols + ${COMING_SOON_IDS.length} coming-soon)`,
  );

  // The capability-definitions <dl> legend retired for good — no top-of-page
  // block, mobile or otherwise. Each included-capability pill on a card is
  // now its own trigger: tap it and its `detail` slides up as a bottom sheet
  // (components/coverage/capability-sheet.tsx), the mobile-only equivalent of
  // desktop's header popovers.
  assert((await page.locator("dl").count()) === 0, "the old capability-definitions <dl> is gone from the DOM");
  const dialog = page.locator('div[role="dialog"][aria-modal="true"]');
  assert(!(await dialog.isVisible().catch(() => false)), "no capability sheet is open by default");

  const firstPill = cards.first().locator("button[aria-haspopup='dialog']").first();
  assert((await firstPill.count()) === 1, "an included capability renders as a tappable pill (button)");
  const pillLabel = (await firstPill.innerText()).replace(/\s+/g, " ").trim();

  // Pre-hydration clicks are silently lost, not queued — poll for the open
  // state and re-click if the first tap landed before hydration finished.
  let sheetOpen = false;
  for (let i = 0; i < 5 && !sheetOpen; i++) {
    await firstPill.click();
    await page.waitForTimeout(250);
    sheetOpen = await dialog.isVisible().catch(() => false);
  }
  assert(sheetOpen, "tapping a capability pill opens its bottom sheet");
  assert((await dialog.getAttribute("aria-label")) === pillLabel, "sheet's aria-label matches the pill's capability");
  const dialogText = await dialog.innerText();
  assert(dialogText.includes(pillLabel), "sheet title shows the capability's own label");
  const capEntry = CAP_ENTRIES.find((c) => c.label === pillLabel);
  assert(Boolean(capEntry), `"${pillLabel}" matches a parsed CAPABILITIES entry`);
  if (capEntry) {
    assert(dialogText.includes(capEntry.detail), "sheet body carries the capability's own detail text (unmodified)");
  }

  // Backdrop tap closes it.
  const backdrop = page.locator('div[role="dialog"][aria-modal="true"]').locator("xpath=preceding-sibling::div[1]");
  await backdrop.click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(400);
  assert(!(await dialog.isVisible().catch(() => false)), "backdrop tap closes the capability sheet");

  // Escape closes it too.
  sheetOpen = false;
  for (let i = 0; i < 5 && !sheetOpen; i++) {
    await firstPill.click();
    await page.waitForTimeout(250);
    sheetOpen = await dialog.isVisible().catch(() => false);
  }
  assert(sheetOpen, "capability sheet reopens for the Escape check");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  assert(!(await dialog.isVisible().catch(() => false)), "Escape closes the capability sheet");

  assert(
    !/the deeper capabilities/i.test(await page.locator("body").innerText()),
    "the retired 'The deeper capabilities' heading text is not visible anywhere",
  );

  // Cards carry the desc line too (the coming-soon card's own note is a
  // `p.text-xs` direct child on the same shape, so it counts toward this floor).
  const cardDescs = await cardSection.locator("div.rounded-2xl.bg-raised > p.text-xs").count();
  assert(cardDescs >= TOTAL_ROWS, `desc/note under every mobile card (${cardDescs} >= ${TOTAL_ROWS})`);

  // Every drawered protocol has its drawer reachable on mobile — the
  // coming-soon card is deliberately NOT among them (no drawer at all).
  const discs = cardSection.locator("button[aria-label^='Show about']");
  assert((await discs.count()) === DRAWERED.length, `${DRAWERED.length} mobile drawer disclosures`);
  if (HAS_SOON) {
    const soonDisc = page.locator(`section.md\\:hidden button[aria-label*='${EXPECTED_ROWS[SOON_IDX].label}']`);
    assert((await soonDisc.count()) === 0, "the coming-soon card carries no drawer disclosure trigger");
  }

  // Placement: the mobile card order matches the SAME alphabetical splice as
  // desktop — both read from the one shared coverageRows() helper, so a drift
  // between the two layouts would show up here.
  const mobileLabels = (
    await page.locator("section.md\\:hidden div.rounded-2xl.bg-raised span.font-semibold").allTextContents()
  ).map((s) => s.trim());
  assert(mobileLabels.length === TOTAL_ROWS, `${TOTAL_ROWS} mobile card labels found`);
  assert(
    mobileLabels.every((label, idx) => label === EXPECTED_ROWS[idx].label),
    "mobile card order matches the same alphabetical splice as desktop",
  );

  // The coming-soon card itself: pill present, no capability pills (the
  // included-capability chip carries text-green-500 on its Check icon, so its
  // absence on this card proves no capability claim rides along).
  if (HAS_SOON) {
    const soonCard = cards.filter({ hasText: EXPECTED_ROWS[SOON_IDX].label });
    assert((await soonCard.count()) === 1, "exactly one coming-soon mobile card found");
    assert(
      (await soonCard.locator("span", { hasText: "Coming soon" }).count()) === 1,
      "the coming-soon card carries a 'Coming soon' pill",
    );
    assert(
      (await soonCard.locator("svg.text-green-500").count()) === 0,
      "the coming-soon card carries no included-capability pills",
    );
  } else {
    assert(
      (await cardSection.locator("span", { hasText: "Coming soon" }).count()) === 0,
      "COMING_SOON is empty, so no mobile card carries a 'Coming soon' pill",
    );
  }

  // Open one and read it — both blocks (view one-liner + structural note).
  const mapleDisc = cardSection.locator("button[aria-label*='Maple']");
  assert(!(await cardSection.innerText()).includes("tri-party"), "maple note closed on mobile");
  await mapleDisc.scrollIntoViewIfNeeded();
  await mapleDisc.click();
  await page.waitForTimeout(150);
  const mobileOpen = await cardSection.innerText();
  assert(mobileOpen.includes("tri-party"), "maple note opens on mobile (innerText)");
  assert(mobileOpen.includes("syrup pools"), "maple view one-liner opens on mobile (innerText)");

  await page.close();
}

/* ── COVERAGE_NOTES has exactly one consumer now ──────────────────────── */
// The listing intro drawer (InfoDisclosure) retired on 2026-09-01: the intro
// prose moved to each rail's /info page, and the structural notes render only
// on /coverage — the surface this whole script asserts. That the drawer is
// gone (and the (i) points at /info) is verify-polish-batch.mjs's check 2,
// so nothing is asserted here; this marker stays so the next reader doesn't
// reintroduce a "second consumer" check against a surface that no longer
// exists.

/* ── Coming-soon roster ───────────────────────────────────────────────── */
// Ported from the retired verify-coverage-glyph-stats, then reworked again
// when the coming-soon entry moved OFF the below-matrix paragraph and INTO
// the matrix as a real row (lib/shared/coverage.ts's coverageRows() splice,
// asserted end-to-end in desktop()/mobile() above). A coming-soon entry is not
// in protocols.ts/PROTO_IDS — it is read from the page own COMING_SOON array
// instead — but it IS now one of the derived TOTAL_ROWS matrix rows, not a
// standalone tile. This function's job narrows to: the note and link render
// exactly once, inside the table (desktop viewport here), and the OLD
// trailing-paragraph phrasing is gone for good.
async function comingSoon() {
  console.log("\n== /coverage coming-soon row (desktop viewport) ==");
  const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } });
  await page.goto(BASE + "/coverage/ethereum", { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();

  if (!HAS_SOON) {
    // ⚠️ COMING_SOON is EMPTY today — LlamaLend V2 shipped inside the llamalend
    // explorer rather than as its own, so the announcement retired with it.
    // Assert the page says NOTHING of the kind, and specifically that the
    // retired entry is gone: a stale "coming soon" for something already built
    // is exactly the perishable launch-state claim this page must not carry.
    assert(!/Coming soon/i.test(body), "no 'Coming soon' pill renders anywhere on /coverage");
    assert(!/LlamaLend V2/.test(body), "the retired LlamaLend V2 announcement is gone");
    assert(!/deployed but still empty/.test(body), "the retired coming-soon note is gone");
    assert(!/is coming soon —/.test(body), "the old trailing-paragraph phrasing is still gone");
    await page.close();
    return;
  }

  assert(body.includes(EXPECTED_ROWS[SOON_IDX].label), "the coming-soon row advertises the announced explorer");
  assert(body.includes("Coming soon"), "the neutral 'Coming soon' pill text renders");

  // The old below-matrix paragraph read "<Label> is coming soon — <note>" as
  // a standalone <p> after the table. That phrasing is gone for good — the
  // note now lives ONLY inside a table `<td>`.
  assert(!/is coming soon —/.test(body), "the old trailing-paragraph phrasing ('… is coming soon — …') is gone");
  // Derived from the page's own array, not named here — see COMING_SOON_NOTES.
  const soonPos = COMING_SOON_LABELS.indexOf(EXPECTED_ROWS[SOON_IDX].label);
  const soonNote = COMING_SOON_NOTES[soonPos];
  const soonHref = COMING_SOON_HREFS[soonPos];
  assert(Boolean(soonNote && soonHref), "the announced entry parses a note and an href");
  const noteCell = page.locator("td", { hasText: soonNote });
  assert((await noteCell.count()) === 1, "the note text renders exactly once, inside a table cell");
  // The mobile card carries the SAME note in a `<p>` too, but it's CSS-hidden
  // at this desktop viewport (`md:hidden`) — `count()` alone would still see
  // it in the DOM, so check visibility (offsetParent) per match rather than
  // presence, or the always-mounted mobile copy would false-positive this.
  const noteParagraphs = page.locator("p", { hasText: soonNote });
  const paragraphVisible = await noteParagraphs.evaluateAll((els) => els.map((el) => el.offsetParent !== null));
  assert(
    !paragraphVisible.some(Boolean),
    "no VISIBLE <p> (the old trailing-paragraph shape) carries the note at this viewport",
  );

  // Scoped to the table: the mobile card carries the same link, but it's
  // CSS-hidden (`md:hidden`) at this desktop viewport — `a[href]` presence
  // alone doesn't tell hidden from shown, so this counts only the copy inside
  // the (visible) table.
  const tableLinks = await page.locator(`table a[href='${soonHref}']`).count();
  assert(tableLinks === 1, `exactly one ${soonHref} link renders in the table row (${tableLinks})`);
  await page.close();
}

/* ── The Base page — its own roster, nothing else's ───────────────────── */
// The deep passes above pin /coverage/ethereum; this holds /coverage/base to
// the Base slice of the roster: exactly its rows in roster order, the toggle's
// active side, no Ethereum row leaking across, and a Base essay opening if
// the notes roster has one.
async function base() {
  console.log("\n== /coverage/base (desktop viewport) ==");
  const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } });
  await page.goto(BASE + "/coverage/base", { waitUntil: "networkidle" });
  assert(/What Rails Covers/.test(await page.locator("h1").first().innerText()), "base page loaded");

  // Base is launched (rails-ops decision 0030, 2026-09-23), so the toggle
  // carries a Base segment marked active, and no work-in-progress strip.
  assert(
    (await page.locator('a[href="/coverage/base"][aria-current="page"]').count()) === 1,
    "the toggle's Base segment is the active one",
  );
  assert((await page.locator("[data-work-in-progress]").count()) === 0, "the Base page carries no strip");
  assert(
    (await page.locator('a[href="/coverage/ethereum"]').count()) >= 1,
    "the toggle's other side links /coverage/ethereum",
  );

  const rowLabels = await page.locator("table tbody th a > span").allInnerTexts();
  const expected = BASE_SLICE.map((e) => e.label);
  assert(
    rowLabels.length === expected.length && rowLabels.every((l, i) => l === expected[i]),
    `Base matrix rows are exactly the Base roster in order (${rowLabels.join(", ")})`,
  );
  // Label overlap between chains is real (Aave V3 on both) — leak-detect by
  // HREF, which is chain-qualified.
  const ethLeaks = await page.locator('table a[href^="/ethereum/"]').count();
  assert(ethLeaks === 0, `no Ethereum explorer link leaks into the Base matrix (${ethLeaks})`);

  const baseNoteIds = ALL_NOTE_IDS.filter((id) => BASE_SLICE.some((e) => e.id === id));
  if (baseNoteIds.length > 0) {
    const trigger = page.locator('table button[aria-label^="Show why"]').first();
    await trigger.click();
    const openPanel = page.locator('table [id^="coverage-details-"]:visible');
    assert((await openPanel.count()) === 1, `a Base essay opens (${baseNoteIds.length} noted Base explorers)`);
  } else {
    assert(
      (await page.locator('table button[aria-label^="Show why"]').count()) === 0,
      "no essay triggers on the Base page while no Base explorer carries a note",
    );
  }
  await page.close();
}

const light = await desktop("light");
const dark = await desktop("dark");
assert(light.seam !== dark.seam, `light and dark seams differ (${light.seam} vs ${dark.seam})`);
await mobile("light");
await comingSoon();
await base();

await browser.close();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

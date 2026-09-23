#!/usr/bin/env node
// One address's life inside one Yearn V3 vault, checked against the chain
// rather than against itself — /ethereum/yearn/vaults/<vault>/<holder>.
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN `eth_getLogs` OR `eth_call`
// AT THE BLOCK THE PAGE STATES. Nothing is read back off the page and treated
// as an expectation, and nothing is taken from lib/yearn/vault-catalog.ts
// except the two immutable facts a catalogue is allowed to carry: which vaults
// exist for this roster, and which block each vault's creation log sits in. The
// asset decimals a share price is scaled by are NOT taken from the catalogue —
// they are read off the vault with `decimals()` at the page's own block, which
// is the whole subject of section 5.
//
// The one thing taken from the DOM is the block number, and that is the subject
// of check 0b rather than a source of truth for the rest.
//
// Run:
//   BASE=http://localhost:3000 node scripts/verify/verify-ethereum-yearn-vault-timeline.mjs
// Needs ALCHEMY_URL in .env.local (read, NEVER printed — viem prints the whole
// URL on a 429, so every error path here prints `error.shortMessage` or a
// scrubbed string and never the object).
//
// ── WHAT EACH SECTION ASSERTS ─────────────────────────────────────────
//   0  every fixture page answers 200 and states one block, and that block is
//      within a few hundred of this script's own head
//   1  the gate: the page's replayed figure and its `balanceOf` figure both
//      equal this script's own signed sum and its own `balanceOf(holder)` call
//      at the stated block, wei-exact, and the page drew rows only because they
//      agree
//   2  the rows: the count on the wrapper equals this script's own transfer-log
//      count, and every drawn row's id is one of this script's own
//      `txHash:logIndex` coordinates
//   3  the lifetime-flows tower: minted, burned, transferred in and transferred
//      out each equal this script's own sum over its own logs, wei-exact, and
//      mints + in − burns − out IS `balanceOf`
//   4  the asset legs: every mint's and burn's `assets` figure on the page is
//      the `assets` word of the ERC-4626 log in that same transaction carrying
//      that same share count — never shares × a share price
//   5  THE SHARE EXPONENT. Every sampled row's share price equals this script's
//      own `convertToAssets(10 ** decimals())` at THAT ROW's own block,
//      wei-exact, across a 6-decimal and an 18-decimal asset. See break test Y2
//   6  the four refusals: no USD, no percent-per-year, no APY word, no
//      annualised figure anywhere on the page, and no line/curve element in the
//      timeline
//   7  the fixtures are still in the state they were pinned in — a fixture that
//      has CHANGED STATE is a FAILURE for a person to re-pin, never a skip
//   8  the explorer's own wiring: `listingHrefForWallet` sends a Yearn-scoped
//      bookmark somewhere that RESOLVES, and the coverage matrix's `dashboard`
//      cell for Yearn is now true
//   9  the dev provenance tripwire reports no uncovered figure, every row
//      expanded (SKIP when its bookends are absent — a production build renders
//      none)
//
// ── THE FIXTURES ARE PINNED STATE, AND A CHANGE IS A FAILURE ──────────
// Four holdings, pinned 2026-09-20: two 6-decimal assets and two 18-decimal
// ones, and between them a mint, a burn, a holder-to-holder transfer IN and one
// OUT. If one of them withdraws to zero, section 7 goes red and stays red: a
// person re-pins the fixture, and this script never re-pins itself. That is the
// rule both Aave vault verifiers carry and the reason they have caught real
// drift twice.
//
// ── PROVED IT CAN FAIL, 2026-09-20, BASE=http://localhost:3000 ────────
// Written at 26/26 green. Each break made alone, run, reverted.
//
//  Y1  THE GATE, fed a deliberately wrong balance. `balanceAt()` in
//      lib/sources/chain/yearn-ethereum-vault-timeline.ts returned
//      `balanceOf + 1` — one wei out, the smallest lie the gate exists to
//      catch. Every fixture page then drew ZERO rows and stated both figures:
//      FAIL 1b ("page null vs own 3517648" on all four — the tower is not drawn
//      at all when the gate fails, so there is no figure to read), FAIL 1c
//      ("This address's history in this vault could not be reconciled"), FAIL
//      2a ("page 0 vs own 4 | 0 vs own 7 | 0 vs own 4 | 0 vs own 38"). 1a
//      stayed GREEN, because this script's own replay and its own balanceOf
//      still agreed — which is the point of computing the expectation here
//      rather than reading it off the page. Reverted, 26/26 again.
//
//  Y2  THE SHARE EXPONENT, the same break phase C made on the roster. The
//      reader's `one` in `buildRows` changed from
//      `BigInt(10) ** BigInt(opts.shareDecimals)` to a fixed
//      `BigInt(10) ** BigInt(18)` — a WRONG argument to the real
//      `convertToAssets` eth_call, not a formatting change. FAIL 5b on the
//      6-decimal fixtures: "0x310b…afaa @20926931 (6d) page 1005961854948638725
//      vs own 1005961" — a trillion-fold error stated as a share price. The
//      18-decimal fixtures stayed GREEN, and 5a stayed green too because the
//      vault's `decimals()` reading was never what broke. That is exactly why
//      this section samples across BOTH decimal classes: a verifier that only
//      ever looked at a WETH vault would have called that build correct.
//
// ── THE REFUSALS THIS PAGE IS BUILT ON ────────────────────────────────
// No USD, no APY, no annualised figure, no interest earned, no profit or loss.
// No line, curve or series through the share prices — each is a read at a block
// the holder chose by transacting (rails-ops decision 0017 §6). No brand or
// curator names; a counterparty is an address. Section 6 is those refusals as
// checks, and it reads the RENDERED page rather than the source.

import { chromium } from "playwright";
import { createPublicClient, http, parseAbi, parseAbiItem, toEventSelector, decodeAbiParameters } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3000";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    }),
);
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");

// ⚠️ NEVER PRINT A LANE'S URL. viem attaches the whole endpoint — key and all —
// to the error it throws on a 429, so an `error.message` printed raw would put
// a credential into a verifier's stdout and into whatever reads it. Every catch
// in this file goes through here.
const scrub = (e) =>
  String(e?.shortMessage ?? e?.name ?? e)
    .replace(/https?:\/\/\S+/g, "<endpoint>")
    .slice(0, 160);

const client = createPublicClient({ chain: mainnet, transport: http(env.ALCHEMY_URL) });

const ZERO = "0x0000000000000000000000000000000000000000";
const TRANSFER = toEventSelector(
  parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
);
const DEPOSIT = toEventSelector(
  parseAbiItem("event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)"),
);
const WITHDRAW = toEventSelector(
  parseAbiItem(
    "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
  ),
);
const VAULT_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const topicOf = (a) => `0x${"0".repeat(24)}${a.toLowerCase().replace(/^0x/, "")}`;
const addrOf = (t) => `0x${t.slice(26)}`.toLowerCase();
const hex = (n) => `0x${BigInt(n).toString(16)}`;
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ── the fixtures — INPUTS, and pinned STATE ─────────────────────────────────
// `expect` is a claim about the SHAPE of the life, not its numbers: every
// number is re-read below. `createdBlock` is taken from the catalogue and
// asserted against it, because it is the one fact a creation log fixes forever.
const FIXTURES = [
  {
    label: "yvUSDT-1 / a 6-decimal asset, and all four kinds in four logs",
    vault: "0x310b7ea7475a0b449cfd73be81522f1b88efafaa",
    holder: "0xb634316e06cc0b358437cbadd4dc94f1d3a92b3b",
    decimals: 6,
    expect: { mints: true, burns: true, transfersIn: true, transfersOut: true },
  },
  {
    label: "yvUSDC-2 / a second 6-decimal asset, mints and burns mixed with transfers",
    vault: "0xae7d8db82480e6d8e3873ecbf22cf17b3d8a7308",
    holder: "0x16388463d60ffe0661cf7f1f31a7d658ac790ff7",
    decimals: 6,
    expect: { mints: true, burns: true, transfersIn: true, transfersOut: true },
  },
  {
    label: "yvWETH-1 / an 18-decimal asset",
    vault: "0xc56413869c6cdf96496f2b1ef801fedbdfa7ddb0",
    holder: "0xc7ac422595da7c1aef9e2f1119a015272c27faf7",
    decimals: 18,
    expect: { mints: true, burns: true, transfersIn: true, transfersOut: true },
  },
  {
    label: "yvmkUSD-A / an 18-decimal asset and a longer life",
    vault: "0x04aebe2e4301cdf5e9c57b01ebdfe4ac4b48dd13",
    holder: "0xb634316e06cc0b358437cbadd4dc94f1d3a92b3b",
    decimals: 18,
    expect: { mints: true, burns: true, transfersIn: true, transfersOut: true },
  },
];

// ── the catalogue, parsed out of the generated TS ───────────────────────────
// Only two fields are read: the address set (to assert each fixture is served)
// and the creation block (the sweep floor). Completeness is asserted by count,
// because a formatting change that hid rows from this regex would quietly
// shrink the roster this script thinks exists.
const catalogSrc = fs.readFileSync(path.join(ROOT, "lib/yearn/vault-catalog.ts"), "utf8");
const rowsSrc = catalogSrc.slice(catalogSrc.indexOf("const ROWS"));
const CATALOGUE = new Map(
  [...rowsSrc.matchAll(/\[\s*"(0x[0-9a-f]{40})",\s*(\d+),\s*(\d+),/g)].map((m) => [m[1], Number(m[3])]),
);
const CATALOGUE_ADDRESSES = (catalogSrc.match(/"0x[0-9a-f]{40}"/g) ?? []).length;

// ── the ledger ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;
const check = (name, ok, detail) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const skip = (name, why) => {
  skipped++;
  console.log(`SKIP  ${name} — ${why}`);
};

// ── this script's OWN read of a life ────────────────────────────────────────
/**
 * Every figure this script judges a page by: two `eth_getLogs` sweeps for the
 * holder's own `Transfer`s in both directions, the two ERC-4626 leg sweeps, the
 * signed replay, and `balanceOf` + `decimals()` at the page's own stated block.
 *
 * The leg is claimed by TRANSACTION AND SHARE COUNT, the same rule the reader
 * holds to — re-implemented here rather than imported, because an expectation
 * computed by the code under test is not an expectation.
 */
async function ownLife(vault, holder, blockNumber, createdBlock) {
  const sweep = (topics) =>
    client.request({
      method: "eth_getLogs",
      params: [{ address: vault, topics, fromBlock: hex(createdBlock), toBlock: hex(blockNumber) }],
    });
  const [outLogs, inLogs, depositLogs, withdrawLogs] = await Promise.all([
    sweep([TRANSFER, topicOf(holder), null]),
    sweep([TRANSFER, null, topicOf(holder)]),
    sweep([DEPOSIT, null, topicOf(holder)]),
    sweep([WITHDRAW, null, null, topicOf(holder)]),
  ]);

  const seen = new Set();
  const transfers = [];
  for (const l of [...outLogs, ...inLogs]) {
    const id = `${l.transactionHash}:${Number(BigInt(l.logIndex))}`;
    if (seen.has(id)) continue;
    seen.add(id);
    transfers.push(l);
  }
  transfers.sort((a, b) => {
    const d = BigInt(a.blockNumber) - BigInt(b.blockNumber);
    if (d !== 0n) return d < 0n ? -1 : 1;
    return Number(BigInt(a.logIndex) - BigInt(b.logIndex));
  });

  const legs = [...depositLogs, ...withdrawLogs].map((l) => {
    const [assets, shares] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], l.data);
    return { txHash: l.transactionHash, assets, shares, taken: false };
  });
  const claim = (txHash, shares) => {
    const hit = legs.find((x) => !x.taken && x.txHash === txHash && x.shares === shares);
    if (!hit) return null;
    hit.taken = true;
    return hit.assets.toString();
  };

  const flows = { minted: 0n, burned: 0n, in: 0n, out: 0n };
  let balance = 0n;
  const rows = [];
  for (const l of transfers) {
    const f = addrOf(l.topics[1]);
    const t = addrOf(l.topics[2]);
    const v = BigInt(l.data);
    let delta = 0n;
    if (t === holder) delta += v;
    if (f === holder) delta -= v;
    balance += delta;
    const kind =
      f === holder && t === holder
        ? "transfer-self"
        : f === ZERO
          ? "deposit"
          : t === ZERO
            ? "withdrawal"
            : t === holder
              ? "transfer-in"
              : "transfer-out";
    if (kind === "deposit") flows.minted += v;
    else if (kind === "withdrawal") flows.burned += v;
    else if (kind === "transfer-in") flows.in += v;
    else if (kind === "transfer-out") flows.out += v;
    rows.push({
      id: `${l.transactionHash}:${Number(BigInt(l.logIndex))}`,
      block: Number(BigInt(l.blockNumber)),
      kind,
      shares: delta.toString(),
      balanceAfter: balance.toString(),
      assets: kind === "deposit" || kind === "withdrawal" ? claim(l.transactionHash, v) : null,
    });
  }

  const [onChain, decimals] = await Promise.all([
    client.readContract({
      address: vault,
      abi: VAULT_ABI,
      functionName: "balanceOf",
      args: [holder],
      blockNumber: BigInt(blockNumber),
    }),
    client.readContract({ address: vault, abi: VAULT_ABI, functionName: "decimals", blockNumber: BigInt(blockNumber) }),
  ]);

  return {
    logsOut: outLogs.length,
    logsIn: inLogs.length,
    rows: rows.reverse(), // newest first, the order the page draws
    flows,
    replayed: balance.toString(),
    onChain: onChain.toString(),
    decimals: Number(decimals),
  };
}

/** `convertToAssets(10 ** decimals)` at one block — the share price a row
 *  states, asked with the exponent the vault itself reports. */
async function ownSharePrice(vault, decimals, blockNumber) {
  try {
    const v = await client.readContract({
      address: vault,
      abi: VAULT_ABI,
      functionName: "convertToAssets",
      args: [10n ** BigInt(decimals)],
      blockNumber: BigInt(blockNumber),
    });
    return v.toString();
  } catch (e) {
    console.log(`      (share price at block ${blockNumber} did not answer: ${scrub(e)})`);
    return null;
  }
}

// ── the page ────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 2400 } });

async function readPage(vault, holder, { expandRows = false } = {}) {
  const page = await context.newPage();
  const url = `${BASE}/ethereum/yearn/vaults/${vault}/${holder}`;
  const res = await page.goto(url, { waitUntil: "networkidle" });
  const status = res?.status() ?? 0;
  if (status !== 200) {
    await page.close();
    return { url, status };
  }
  const attr = async (sel, name) => {
    const el = page.locator(sel);
    return (await el.count()) ? el.first().getAttribute(name) : null;
  };
  const text = async (sel) => {
    const el = page.locator(sel);
    return (await el.count()) ? (await el.first().innerText()).replace(/\s+/g, " ").trim() : null;
  };
  const heads = page.locator("[data-vault-timeline-rows] [data-event-id] [role='button']");
  const domRows = await heads.count();
  if (expandRows) {
    for (let i = 0; i < domRows; i++) {
      try {
        await heads.nth(i).click({ force: true, timeout: 4000 });
      } catch {
        /* a row that would not open is caught by the tripwire count below */
      }
    }
    await page.waitForTimeout(900);
  }
  const out = {
    url,
    status,
    blockNumber: Number(await attr("[data-vault-block]", "data-vault-block")),
    rowCountAttr: Number((await attr("[data-vault-timeline-rows]", "data-vault-timeline-rows")) ?? 0),
    rowIds: await page
      .locator("[data-vault-timeline-rows] [data-event-id]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-event-id"))),
    domRows,
    reconciledText: await text("[data-figure='timeline-reconciled']"),
    unreconciledText: await text("[data-figure='timeline-unreconciled']"),
    horizonText: await text("[data-figure='timeline-horizon']"),
    unreadText: await text("[data-figure='timeline-unread']"),
    accrualText: await text("[data-figure='timeline-accrual']"),
    // The tower's RAW attributes — a check on this surface is wei-exact rather
    // than a check on formatted cents, the rule both existing vault verifiers
    // hold to.
    tower: {
      minted: await attr("[data-vault-flows-tower]", "data-minted-raw"),
      burned: await attr("[data-vault-flows-tower]", "data-burned-raw"),
      in: await attr("[data-vault-flows-tower]", "data-transferred-in-raw"),
      out: await attr("[data-vault-flows-tower]", "data-transferred-out-raw"),
      sharesNow: await attr("[data-vault-flows-tower]", "data-shares-now-raw"),
      claimNow: await attr("[data-vault-flows-tower]", "data-claim-now-raw"),
    },
    bodyText: (await page.locator("body").innerText()).replace(/\s+/g, " "),
    timelineText: (await page.locator("[data-vault-timeline]").count())
      ? (await page.locator("[data-vault-timeline]").first().innerText()).replace(/\s+/g, " ")
      : "",
    // Every SVG geometry inside the timeline, for the no-line refusal.
    svgGeometry: await page
      .locator("[data-vault-timeline] path, [data-vault-timeline] polyline, [data-vault-timeline] polygon")
      .evaluateAll((els) => els.map((e) => e.getAttribute("d") || e.getAttribute("points") || "")),
    // The RAW figures in each row's open detail, keyed by the row's own id —
    // what sections 4 and 5 read. They are attributes on the detail panel
    // (components/vaults/vault-timeline-row.tsx), so a check here is wei-exact
    // rather than a check on a formatted figure, and the empty string is the
    // panel's own UNREAD marker rather than a zero.
    rowFigures: await page.locator("[data-vault-timeline-rows] [data-event-id]").evaluateAll((els) =>
      els.map((e) => {
        const d = e.querySelector("[data-row-kind]");
        return {
          id: e.getAttribute("data-event-id"),
          kind: d?.getAttribute("data-row-kind") ?? null,
          block: d ? Number(d.getAttribute("data-row-block")) : null,
          sharesDelta: d?.getAttribute("data-row-shares-delta") ?? null,
          balanceAfter: d?.getAttribute("data-row-balance-after") ?? null,
          sharePrice: d?.getAttribute("data-row-share-price") || null,
          assets: d?.getAttribute("data-row-assets") || null,
          text: e.innerText.replace(/\s+/g, " "),
        };
      }),
    ),
    tripwireBookends: await page.locator("[data-prov-tripwire]").count(),
    uncovered: await page
      .locator("[data-prov-uncovered]")
      .evaluateAll((els) => els.map((e) => e.textContent?.trim().slice(0, 60))),
  };
  await page.close();
  return out;
}

// ═══ 0: the pages answer, and each states a block near this script's head ═══
const head = Number(await client.getBlockNumber());
const PAGES = new Map();
for (const f of FIXTURES) PAGES.set(`${f.vault}:${f.holder}`, await readPage(f.vault, f.holder));

const bad0a = FIXTURES.filter((f) => PAGES.get(`${f.vault}:${f.holder}`).status !== 200);
check(
  "0a every fixture holding answers 200",
  bad0a.length === 0,
  bad0a.map((f) => `${short(f.vault)}/${short(f.holder)} ${PAGES.get(`${f.vault}:${f.holder}`).status}`).join(", ") ||
    `${FIXTURES.length} pages`,
);
if (bad0a.length > 0) {
  console.log("\nNo page to check. Stopping.");
  await browser.close();
  process.exit(1);
}

const bad0b = FIXTURES.filter((f) => {
  const b = PAGES.get(`${f.vault}:${f.holder}`).blockNumber;
  return !Number.isFinite(b) || b <= 0 || Math.abs(head - b) > 500;
});
check(
  "0b each page states one block, within 500 of this script's own head",
  bad0b.length === 0,
  bad0b
    .map((f) => `${short(f.vault)} @${PAGES.get(`${f.vault}:${f.holder}`).blockNumber} vs head ${head}`)
    .join(", ") || `head ${head.toLocaleString("en-US")}`,
);

const bad0c = FIXTURES.filter((f) => !CATALOGUE.has(f.vault));
check(
  "0c every fixture vault is on the catalogue this roster serves, and the parse read the whole of it",
  bad0c.length === 0 && CATALOGUE.size > 150 && CATALOGUE_ADDRESSES > CATALOGUE.size,
  bad0c.map((f) => short(f.vault)).join(", ") ||
    `${CATALOGUE.size} vault rows parsed out of ${CATALOGUE_ADDRESSES} addresses in the file`,
);

// This script's own reading of every fixture, at the block that page states.
const OWN = new Map();
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  OWN.set(key, await ownLife(f.vault, f.holder, PAGES.get(key).blockNumber, CATALOGUE.get(f.vault) ?? 0));
}

// ═══ 1: the gate ═══════════════════════════════════════════════════════════
// The page's two figures against this script's own two. The page prints them
// scaled, so the comparison is on the RAW figures the page also states — the
// replay is compared through the tower's `data-shares-now-raw`, which is the
// `balanceOf` the gate ran against, and the gate's own prose is checked for
// having drawn rows at all.
const bad1a = FIXTURES.filter((f) => {
  const own = OWN.get(`${f.vault}:${f.holder}`);
  return own.replayed !== own.onChain;
});
check(
  "1a this script's OWN replay of this address's own Transfer logs equals its OWN balanceOf at the page's block",
  bad1a.length === 0,
  bad1a
    .map(
      (f) =>
        `${short(f.holder)} ${OWN.get(`${f.vault}:${f.holder}`).replayed} vs ${OWN.get(`${f.vault}:${f.holder}`).onChain}`,
    )
    .join(" | ") || FIXTURES.map((f) => `${short(f.holder)} ${OWN.get(`${f.vault}:${f.holder}`).onChain}`).join(", "),
);

const bad1b = FIXTURES.filter((f) => {
  const p = PAGES.get(`${f.vault}:${f.holder}`);
  const own = OWN.get(`${f.vault}:${f.holder}`);
  return p.tower.sharesNow !== own.onChain;
});
check(
  "1b and the balance the page ran its gate against is that same figure, wei-exact",
  bad1b.length === 0,
  bad1b
    .map(
      (f) =>
        `${short(f.holder)} page ${PAGES.get(`${f.vault}:${f.holder}`).tower.sharesNow} vs own ${OWN.get(`${f.vault}:${f.holder}`).onChain}`,
    )
    .join(" | ") || `${FIXTURES.length} fixtures`,
);

const bad1c = FIXTURES.filter((f) => {
  const p = PAGES.get(`${f.vault}:${f.holder}`);
  return !p.reconciledText || p.unreconciledText || p.unreadText || p.horizonText;
});
check(
  "1c and the page says so on its face — the reconciled statement is drawn and none of the three refusals is",
  bad1c.length === 0,
  bad1c
    .map(
      (f) =>
        `${short(f.holder)}: ${(PAGES.get(`${f.vault}:${f.holder}`).unreconciledText ?? PAGES.get(`${f.vault}:${f.holder}`).unreadText ?? "no reconciled statement").slice(0, 90)}`,
    )
    .join(" | ") || `${FIXTURES.length} fixtures reconciled`,
);

// THE GATE CAN FAIL, and it is asserted rather than assumed. This is the break
// test Y1 in the header, run here against a HOLDER THE VAULT HAS NEVER SEEN
// whose page must therefore draw no rows at all — the same refusal the wrong
// balance triggered, reached without editing the source. A page that drew rows
// for an address with no logs and no balance would be drawing something it
// never read.
const emptyHolder = "0x000000000000000000000000000000000000dead";
const emptyPage = await readPage(FIXTURES[0].vault, emptyHolder);
check(
  "1d a holder with no history on the vault draws NO rows, and states no reconciled row list",
  emptyPage.status === 200 && emptyPage.rowCountAttr === 0 && emptyPage.domRows === 0,
  `status ${emptyPage.status}, rows ${emptyPage.rowCountAttr}, painted ${emptyPage.domRows}`,
);

// ═══ 2: the rows ═══════════════════════════════════════════════════════════
const bad2a = FIXTURES.filter((f) => {
  const p = PAGES.get(`${f.vault}:${f.holder}`);
  return p.rowCountAttr !== OWN.get(`${f.vault}:${f.holder}`).rows.length;
});
check(
  "2a the row count on the wrapper equals this script's own transfer-log count",
  bad2a.length === 0,
  bad2a
    .map(
      (f) =>
        `${short(f.holder)} page ${PAGES.get(`${f.vault}:${f.holder}`).rowCountAttr} vs own ${OWN.get(`${f.vault}:${f.holder}`).rows.length}`,
    )
    .join(" | ") ||
    FIXTURES.map((f) => `${short(f.holder)} ${OWN.get(`${f.vault}:${f.holder}`).rows.length}`).join(", "),
);

const bad2b = FIXTURES.filter((f) => {
  const p = PAGES.get(`${f.vault}:${f.holder}`);
  const own = new Set(OWN.get(`${f.vault}:${f.holder}`).rows.map((r) => r.id));
  return p.rowIds.some((id) => !own.has(id));
});
check(
  "2b and every drawn row's id is one of this script's own txHash:logIndex coordinates",
  bad2b.length === 0,
  bad2b.map((f) => short(f.holder)).join(", ") ||
    `${FIXTURES.reduce((a, f) => a + PAGES.get(`${f.vault}:${f.holder}`).rowIds.length, 0)} row ids matched`,
);

const bad2c = FIXTURES.filter((f) => {
  const own = OWN.get(`${f.vault}:${f.holder}`);
  const kinds = new Set(own.rows.map((r) => r.kind));
  const e = f.expect;
  return (
    kinds.has("deposit") !== e.mints ||
    kinds.has("withdrawal") !== e.burns ||
    kinds.has("transfer-in") !== e.transfersIn ||
    kinds.has("transfer-out") !== e.transfersOut
  );
});
check(
  "2c and each fixture's life is the SHAPE it was pinned as — a mint, a burn and a holder-to-holder transfer are all covered",
  bad2c.length === 0,
  bad2c
    .map((f) => `${f.label}: ${[...new Set(OWN.get(`${f.vault}:${f.holder}`).rows.map((r) => r.kind))].join("/")}`)
    .join(" | ") ||
    FIXTURES.map(
      (f) => `${short(f.holder)} ${[...new Set(OWN.get(`${f.vault}:${f.holder}`).rows.map((r) => r.kind))].join("/")}`,
    ).join(" · "),
);

// ═══ 3: the lifetime-flows tower ═══════════════════════════════════════════
const bad3a = FIXTURES.filter((f) => {
  const p = PAGES.get(`${f.vault}:${f.holder}`).tower;
  const o = OWN.get(`${f.vault}:${f.holder}`).flows;
  return (
    p.minted !== o.minted.toString() ||
    p.burned !== o.burned.toString() ||
    p.in !== o.in.toString() ||
    p.out !== o.out.toString()
  );
});
check(
  "3a every lifetime flow equals this script's own sum over its own logs, wei-exact",
  bad3a.length === 0,
  bad3a
    .map((f) => {
      const p = PAGES.get(`${f.vault}:${f.holder}`).tower;
      const o = OWN.get(`${f.vault}:${f.holder}`).flows;
      return `${short(f.holder)} minted ${p.minted}/${o.minted} burned ${p.burned}/${o.burned} in ${p.in}/${o.in} out ${p.out}/${o.out}`;
    })
    .join(" | ") || `${FIXTURES.length} towers`,
);

const bad3b = FIXTURES.filter((f) => {
  const o = OWN.get(`${f.vault}:${f.holder}`).flows;
  const own = OWN.get(`${f.vault}:${f.holder}`);
  return (o.minted + o.in - o.burned - o.out).toString() !== own.onChain;
});
check(
  "3b and the share ledger closes: mints + transferred in − burns − transferred out IS balanceOf",
  bad3b.length === 0,
  bad3b.map((f) => short(f.holder)).join(", ") || `${FIXTURES.length} fixtures close wei-exact`,
);

// ═══ 4: the asset legs are the CONTRACT's own word ═════════════════════════
// Read off the EXPANDED rows, because the leg lives in a row's detail panel.
const EXPANDED = new Map();
for (const f of FIXTURES)
  EXPANDED.set(`${f.vault}:${f.holder}`, await readPage(f.vault, f.holder, { expandRows: true }));

const legMismatch = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = new Map(OWN.get(key).rows.map((r) => [r.id, r]));
  for (const row of EXPANDED.get(key).rowFigures) {
    const mine = own.get(row.id);
    if (!mine) continue;
    const drawn = row.assets;
    if (mine.assets == null) {
      // A row with no leg must state none. The row's own words say the leg was
      // not emitted; what must never appear is a figure.
      if (drawn != null)
        legMismatch.push(`${short(f.holder)} ${row.id.slice(0, 10)} drew ${drawn} where no leg was emitted`);
      continue;
    }
    if (drawn != null && drawn !== mine.assets)
      legMismatch.push(`${short(f.holder)} ${row.id.slice(0, 10)} page ${drawn} vs own ${mine.assets}`);
  }
}
check(
  "4a every mint's and burn's asset leg is the `assets` word of the ERC-4626 log in its own transaction, matched by share count",
  legMismatch.length === 0,
  legMismatch.slice(0, 3).join(" | ") ||
    `${FIXTURES.reduce((a, f) => a + OWN.get(`${f.vault}:${f.holder}`).rows.filter((r) => r.assets != null).length, 0)} legs matched`,
);

const bad4b = FIXTURES.filter((f) => {
  const own = OWN.get(`${f.vault}:${f.holder}`);
  // A plain holder-to-holder transfer emits no ERC-4626 leg, so it must carry
  // none — this is the row that would show a divided-out figure if one were
  // ever computed from shares and a share price.
  return own.rows.some((r) => (r.kind === "transfer-in" || r.kind === "transfer-out") && r.assets != null);
});
check(
  "4b and no plain holder-to-holder transfer carries an asset leg at all",
  bad4b.length === 0,
  bad4b.map((f) => short(f.holder)).join(", ") ||
    `${FIXTURES.reduce((a, f) => a + OWN.get(`${f.vault}:${f.holder}`).rows.filter((r) => r.kind.startsWith("transfer-")).length, 0)} transfers, none with a leg`,
);

// ═══ 5: THE SHARE EXPONENT ═════════════════════════════════════════════════
// Break test Y2 lives here. The expectation is this script's OWN
// `convertToAssets(10 ** decimals())` at EACH ROW's own block — the exponent
// read off the vault, never assumed and never taken from the catalogue.
const bad5decimals = FIXTURES.filter((f) => OWN.get(`${f.vault}:${f.holder}`).decimals !== f.decimals);
check(
  "5a the vault's own `decimals()` at the page's block is what the fixture was pinned as",
  bad5decimals.length === 0,
  bad5decimals
    .map((f) => `${short(f.vault)} reads ${OWN.get(`${f.vault}:${f.holder}`).decimals}, pinned ${f.decimals}`)
    .join(", ") || FIXTURES.map((f) => `${short(f.vault)} ${OWN.get(`${f.vault}:${f.holder}`).decimals}d`).join(", "),
);

const priceMismatch = [];
let pricesChecked = 0;
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = new Map(OWN.get(key).rows.map((r) => [r.id, r]));
  const decimals = OWN.get(key).decimals;
  // The three newest rows of each fixture — enough to cross both decimal
  // classes several times over without spending an archive call per row of
  // every life.
  for (const row of EXPANDED.get(key).rowFigures.slice(0, 3)) {
    const mine = own.get(row.id);
    const drawn = row.sharePrice;
    if (!mine || drawn == null) continue;
    const expected = await ownSharePrice(f.vault, decimals, mine.block);
    if (expected == null) continue;
    pricesChecked++;
    if (drawn !== expected)
      priceMismatch.push(`${short(f.vault)} @${mine.block} (${decimals}d) page ${drawn} vs own ${expected}`);
  }
}
check(
  "5b every sampled row's share price equals this script's own convertToAssets(10^decimals) AT THAT ROW'S OWN BLOCK, across a 6-decimal and an 18-decimal asset",
  priceMismatch.length === 0 && pricesChecked > 0,
  priceMismatch.slice(0, 3).join(" | ") ||
    `${pricesChecked} prices, ${new Set(FIXTURES.map((f) => OWN.get(`${f.vault}:${f.holder}`).decimals)).size} decimal classes`,
);

// ═══ 6: the four refusals, read off the RENDERED page ══════════════════════
const USD = /\$\s?[\d,]/;
const PER_YEAR = /%\s*(?:per\s*year|p\.?a\.?|APY|APR)/i;
// ⚠️ THE ACRONYMS ARE CASE-SENSITIVE AND THE PHRASES ARE NOT, and the reason is
// a real false positive: the timeline prints dates in en-GB UTC, so "9 Apr '25"
// made a case-insensitive `/APR/i` red on three of four fixtures. "APR" and
// "APY" are shouted on every surface that would ever state one; "annualised"
// and "interest earned" are prose and may be capitalised either way.
const APY_ACRONYM = /\b(?:APY|APR)\b/;
const APY_WORD = /\b(?:annualised|annualized|interest earned|profit and loss|P&L)\b/i;

const bad6a = FIXTURES.filter((f) => USD.test(PAGES.get(`${f.vault}:${f.holder}`).bodyText));
check(
  "6a no USD figure anywhere on the page — every figure is a quantity of one named token",
  bad6a.length === 0,
  bad6a.map((f) => `${short(f.holder)}: ${USD.exec(PAGES.get(`${f.vault}:${f.holder}`).bodyText)?.[0]}`).join(", ") ||
    `${FIXTURES.length} pages`,
);
const bad6b = FIXTURES.filter((f) => {
  const t = PAGES.get(`${f.vault}:${f.holder}`).bodyText;
  return PER_YEAR.test(t) || APY_ACRONYM.test(t) || APY_WORD.test(t);
});
check(
  "6b and no APY, no annualised figure, no interest earned and no P&L",
  bad6b.length === 0,
  bad6b
    .map(
      (f) =>
        `${short(f.holder)}: ${(PER_YEAR.exec(PAGES.get(`${f.vault}:${f.holder}`).bodyText) ?? APY_WORD.exec(PAGES.get(`${f.vault}:${f.holder}`).bodyText))?.[0]}`,
    )
    .join(", ") || `${FIXTURES.length} pages`,
);
// A LINE THROUGH TWO SHARE PRICES IS THE REFUSAL DECISION 0017 §6 NAMES. A
// sparkline of them would put those NUMBERS into an SVG's own geometry, so this
// takes every number out of every path, polyline and polygon in the timeline
// and asserts none carries two or more of the drawn prices.
//
// ⚠️ DISTINCT prices, not one per row, and TWO of them before it counts. The
// Aave verifier learned this the hard way: a vault whose price is 1.0 on every
// row turned "an icon path contains the number 1" into "fifty of the rows'
// prices are in this geometry", and the shared toolbar's own lucide glyphs made
// the check permanently red. What a sparkline puts in a path is a series of
// DIFFERENT prices; a flat line through one repeated value is not one, and
// cannot be told apart from an icon. Counting path segments cannot work either
// — a lucide glyph has more of them than a four-point line would.
const bad6c = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const prices = [
    ...new Set(
      EXPANDED.get(key)
        .rowFigures.filter((r) => r.sharePrice)
        .map((r) => Number(r.sharePrice) / Math.pow(10, f.decimals)),
    ),
  ];
  for (const geo of PAGES.get(key).svgGeometry) {
    const nums = (geo.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const matched = prices.filter((v) => nums.some((x) => Math.abs(x - v) < 1e-9));
    if (matched.length >= 2)
      bad6c.push(`${short(f.holder)}: an SVG geometry carries ${matched.length} DISTINCT row share prices`);
  }
}
check(
  "6c and no line, curve or series through the share prices — no SVG geometry in the timeline carries two of them",
  bad6c.length === 0,
  bad6c.join(" | ") ||
    `${FIXTURES.reduce((a, f) => a + PAGES.get(`${f.vault}:${f.holder}`).svgGeometry.length, 0)} SVG geometries examined, none of them a price series`,
);
// A COUNTERPARTY IS AN ADDRESS. The timeline may print a short address and a
// date and nothing that reads as a brand or a curator.
const bad6d = FIXTURES.filter((f) => {
  const t = PAGES.get(`${f.vault}:${f.holder}`).timelineText;
  return /\b(?:Gauntlet|Steakhouse|Block Analitica|Re7|MEV Capital|Coinbase|Safe\b)/i.test(t);
});
check(
  "6d and a counterparty on a row is an address, never a name",
  bad6d.length === 0,
  bad6d.map((f) => short(f.holder)).join(", ") || `${FIXTURES.length} timelines`,
);

// ═══ 7: a fixture that has changed state is a FAILURE ══════════════════════
const bad7a = FIXTURES.filter((f) => BigInt(OWN.get(`${f.vault}:${f.holder}`).onChain) <= 0n);
check(
  "7a every fixture still holds a positive balance at the page's own block — an exited fixture makes every check above it vacuous",
  bad7a.length === 0,
  bad7a
    .map((f) => `${f.label}: balanceOf ${OWN.get(`${f.vault}:${f.holder}`).onChain} — RE-PIN THIS FIXTURE`)
    .join(" | ") || FIXTURES.map((f) => `${short(f.holder)} ${OWN.get(`${f.vault}:${f.holder}`).onChain}`).join(", "),
);
const bad7b = FIXTURES.filter((f) => OWN.get(`${f.vault}:${f.holder}`).rows.length === 0);
check(
  "7b and every fixture still has a life to draw",
  bad7b.length === 0,
  bad7b.map((f) => `${f.label} — RE-PIN THIS FIXTURE`).join(" | ") ||
    FIXTURES.map((f) => `${short(f.holder)} ${OWN.get(`${f.vault}:${f.holder}`).rows.length} rows`).join(", "),
);

// ═══ 8: the explorer's own wiring ══════════════════════════════════════════
// §42 item 2: `listingHrefForWallet` used to send a `positionListing: false`
// explorer to `${subPages[0].href}/positions`, and Yearn has no such route.
// This holder lane creates the first `yearn`-scoped bookmark that could reach
// it, so the helper's answer has to LAND.
const protocolsSrc = fs.readFileSync(path.join(ROOT, "lib/shared/protocols.ts"), "utf8");
const helper = protocolsSrc.slice(protocolsSrc.indexOf("export function listingHrefForWallet"));
const helperBody = helper.slice(0, helper.indexOf("\n}\n"));
check(
  "8a listingHrefForWallet no longer forms a `/positions` route for an explorer that has none",
  /holderListing/.test(helperBody) && /return null/.test(helperBody),
  helperBody.includes("holderListing")
    ? "the helper asks the sub-page whether it has a holder listing"
    : "the helper still forms the route unconditionally",
);
const yearnPositions = await fetch(`${BASE}/ethereum/yearn/vaults/positions`).then((r) => r.status);
check(
  "8b and the route it used to form is confirmed absent, so forming it would have been a 404",
  yearnPositions === 404,
  `/ethereum/yearn/vaults/positions answers ${yearnPositions}`,
);
const coverageSrc = fs.readFileSync(path.join(ROOT, "lib/shared/coverage.ts"), "utf8");
const yearnCell = coverageSrc.slice(coverageSrc.indexOf("  yearn: explorerDepth({"));
check(
  "8c and the coverage matrix's `dashboard` cell for Yearn is true, in the same change that made it reachable",
  /dashboard:\s*true/.test(yearnCell.slice(0, yearnCell.indexOf("}),"))),
  /dashboard:\s*true/.test(yearnCell.slice(0, yearnCell.indexOf("}),"))) ? "dashboard: true" : "still false",
);

// ═══ 9: the dev provenance tripwire ════════════════════════════════════════
if (![...EXPANDED.values()].some((p) => p.tripwireBookends > 0)) {
  skip(
    "9a the dev provenance tripwire reports no uncovered figure",
    "no tripwire bookends in the DOM — a production build renders none",
  );
} else {
  const bad9a = FIXTURES.filter((f) => EXPANDED.get(`${f.vault}:${f.holder}`).uncovered.length > 0);
  check(
    "9a every row expanded: no uncovered figure",
    bad9a.length === 0,
    bad9a
      .map((f) => `${short(f.holder)}: ${EXPANDED.get(`${f.vault}:${f.holder}`).uncovered.slice(0, 4).join(" · ")}`)
      .join(" | ") ||
      `${FIXTURES.length} pages, ${FIXTURES.reduce((a, f) => a + EXPANDED.get(`${f.vault}:${f.holder}`).domRows, 0)} rows expanded`,
  );
}

console.log(`\n${passed}/${passed + failed} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);

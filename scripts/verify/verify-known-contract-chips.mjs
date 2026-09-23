// A transfer to or from a known protocol contract names it on the chip, with
// the protocol's mark where one exists ("to CoW Protocol"); every other
// counterparty keeps ENS or hex. The registry is lib/shared/known-infrastructure.ts,
// keyed by chain and address, and rails-ops TO-DO-ui-jobs §14 is the build.
//
// Three things must hold, one fixture set each:
//   1. The named chip renders on Ethereum (Aave V3 Core) AND on Base, where the
//      same GPv2Settlement address is a separate chain-keyed entry. A lookup
//      that ignored the chain, or read the wrong one, fails the Base fixture.
//   2. An EOA counterparty is untouched: no registry name, no mark.
//   3. Maple's CCIP escrow chip survives the registry's signature change
//      (Maple now reads the escrow-only lookup).
//
// Fixtures are pinned by the chain facts that put the chip there, not by event
// counts: every wallet is live and may gain rows.
//   0x2206…e639  tx 0x484417d5…9f2a (block 25,919,705): aTokens to CoW with no
//     Trade the wallet owns in that tx, so no swap rule pairs it
//   0x4950…e61a  tx 0x5bbf6573…637e (block 25,928,040): aDAI from CoW with no
//     Trade the wallet owns in that tx, so no swap rule pairs it
//   The earlier Ethereum fixtures 0xfe28, 0x81dbec, 0xbc8c and 0xb0f3 are position
//   swaps (0xbc8c a withdraw and swap, 0xb0f3's bought aTokens a supply from a swap), which draw one "via CoW Protocol" card since §15
//   (verify-swap-cards.mjs).
//   Base 0x0750…5556 tx 0x01312813…9192 (block 51,280,115): aUSDC to CoW, aWETH from CoW
//   control 0x020b73…65be tx 0xb6b6100c…e1cf: transfer_in from EOA 0x1a76…56d5
//     (eth_getCode "0x", 2026-09-14)
//   Maple 0x6823…a4af tx 0xda8afb8e…95eb (block 25,549,556): syrupUSDC released
//     from CCIP escrow 0x20b7…6491
//
// Break test (2026-09-14): with the Ethereum GPv2Settlement entry removed from
// the registry, the two Ethereum fixtures FAIL and Base still passes, which
// proves the chain key as well as the chip.
//
// Run with the dev server up:
//   BASE=http://localhost:3000 node scripts/verify/verify-known-contract-chips.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const COW_ICON = "/icons/protocols/cow.png";
// The served-folder header and its read, as verify-served-folders-standard.mjs
// selects them.
const FOLDER_HEADER = '[role="button"][aria-expanded][aria-label*=" consecutive "]';
const FOLDER_READ = /\/timeline\/folder\?/;

const FIXTURES = [
  {
    label: "aave-v3 core 0x2206 (unpaired transfer, to CoW)",
    path: "/ethereum/aave-v3/0x220690e908d51d564099649469e423568f70e639?market=core",
    expect: [{ text: "to CoW Protocol", icon: COW_ICON }],
  },
  {
    label: "aave-v3 core 0x4950 (aToken from CoW, no Trade of its own)",
    path: "/ethereum/aave-v3/0x4950def53a9ef494b3e03d1fd5750a846a7ee61a?market=core",
    expect: [{ text: "from CoW Protocol", icon: COW_ICON }],
  },
  {
    label: "aave-v3 base 0x0750 (CoW swap on Base)",
    path: "/base/aave-v3/0x07502bf24fe1a4d81254900a693b7dce64945556",
    expect: [
      { text: "to CoW Protocol", icon: COW_ICON },
      { text: "from CoW Protocol", icon: COW_ICON },
    ],
  },
  {
    label: "aave-v3 core 0x020b73 (EOA control)",
    path: "/ethereum/aave-v3/0x020b73cba0b177a4f4931e481283ba672d2065be?market=core",
    // ENS or hex, whichever the reverse record gives; never a registry name.
    control: { prefix: "from", hex: "0x1a76…56d5" },
  },
  {
    label: "maple 0x6823 (CCIP escrow)",
    path: "/ethereum/maple/0x68230e37b83fd2b586b51f3e58f6ed4a0689a4af",
    expect: [{ text: "from CCIP escrow · syrupUSDC", icon: null }],
  },
];

// Every registry display name the control must NOT show.
const REGISTRY_NAMES =
  /CoW Protocol|WETH gateway|ParaSwap|Uniswap|PancakeSwap|1inch|Odos|Magpie|Enso|Multicall|CCIP escrow/;

const only = process.env.FIXTURES ? new RegExp(process.env.FIXTURES) : null;
let pass = 0;
let fail = 0;
const ok = (msg) => {
  pass++;
  console.log(`PASS  ${msg}`);
};
const bad = (msg) => {
  fail++;
  console.log(`FAIL  ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

for (const fx of FIXTURES) {
  if (only && !only.test(fx.label)) continue;
  let chips;
  try {
    await page.goto(`${BASE}${fx.path}`, { waitUntil: "load", timeout: 120000 });
    // The chip is the PartyChip seam: a `text-rb-500` to/from prefix span whose
    // parent is the chip. A served timeline may hold the transfer rows in a
    // folder ("Sent ×4" on 0xfe28, two CoW swaps ten blocks apart), and a
    // folder header carries no chip. So wait for either, then open every
    // closed folder the way a reader does, one click and one folder read each.
    await page.waitForFunction(
      (folderHeader) =>
        document.querySelector(folderHeader) ||
        [...document.querySelectorAll("span.text-rb-500")].some((s) =>
          /^(to|from)$/.test((s.textContent || "").trim()),
        ),
      FOLDER_HEADER,
      { timeout: 90000 },
    );
    for (let i = 0; i < 12; i++) {
      const closed = page.locator(`${FOLDER_HEADER}[aria-expanded="false"]`).first();
      if ((await closed.count()) === 0) break;
      const answered = page.waitForResponse((r) => FOLDER_READ.test(r.url()), { timeout: 120000 }).catch(() => null);
      await closed.click();
      await answered;
    }
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("span.text-rb-500")].some((s) =>
          /^(to|from)$/.test((s.textContent || "").trim()),
        ),
      null,
      { timeout: 60000 },
    );
    // Let ENS settle so the control reads its final label.
    await page.waitForTimeout(2500);
    chips = await page.evaluate(() =>
      [...document.querySelectorAll("span.text-rb-500")]
        .filter((s) => /^(to|from)$/.test((s.textContent || "").trim()))
        .map((p) => {
          const chip = p.parentElement;
          const icon = chip.querySelector("img[data-party-icon]");
          return {
            text: (chip.textContent || "").replace(/\s+/g, " ").trim(),
            prefix: (p.textContent || "").trim(),
            icon: icon ? new URL(icon.getAttribute("src"), location.href).pathname : null,
          };
        }),
    );
  } catch (err) {
    bad(`${fx.label}: threw during the run — ${err && err.message}`);
    continue;
  }

  if (chips.length === 0) {
    bad(`${fx.label}: no party chip rendered at all`);
    continue;
  }

  // The chip's text is prefix + label with no separator in textContent.
  const norm = (s) => s.replace(/^(to|from)\s*/, "$1 ");

  for (const want of fx.expect ?? []) {
    const hit = chips.find((c) => norm(c.text) === want.text);
    if (!hit) {
      bad(
        `${fx.label}: no chip reads "${want.text}" (saw ${[...new Set(chips.map((c) => norm(c.text)))].join(" | ")})`,
      );
    } else if (hit.icon !== want.icon) {
      bad(`${fx.label}: "${want.text}" icon is ${hit.icon ?? "none"}, expected ${want.icon ?? "none"}`);
    } else {
      ok(`${fx.label}: "${want.text}"${want.icon ? ` with ${want.icon}` : ", no icon"}`);
    }
  }

  if (fx.control) {
    const mine = chips.filter((c) => c.prefix === fx.control.prefix);
    const named = mine.filter((c) => REGISTRY_NAMES.test(c.text) || c.icon);
    if (mine.length === 0) bad(`${fx.label}: no "${fx.control.prefix}" chip to test`);
    else if (named.length > 0) bad(`${fx.label}: EOA chip shows a registry name or mark: ${norm(named[0].text)}`);
    else
      ok(
        `${fx.label}: EOA chip keeps its own label (${[...new Set(mine.map((c) => norm(c.text)))].join(" | ")}; hex ${fx.control.hex})`,
      );
  }
}

await browser.close();
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (pass + fail === 0) {
  console.log("No checks ran — a verdict over zero checks is not a pass.");
  process.exit(1);
}
process.exit(fail === 0 ? 0 : 1);

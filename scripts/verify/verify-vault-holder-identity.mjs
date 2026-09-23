#!/usr/bin/env node
// The naming ladder — who gets named, on whose authority, and who stays unnamed.
// ----------------------------------------------------------------------------
// Subject: `lib/shared/attested-addresses.ts` and the two surfaces that render
// it — the position page's shape sentence (`HolderShapeLine`) and the listing
// card's one mechanism phrase. Half the money in this section is held by code,
// and the biggest of those holdings read as "a contract, 1,096 bytes" while being
// Aave's own GHO peg module parking its reserves in Aave's own vault.
//
// ── WHERE THE EXPECTATIONS COME FROM, AND WHY THAT MATTERS HERE ─────────────
// Three different outside sources, none of them this repo and none of them the
// code under test:
//
//   • AAVE'S ADDRESS BOOK AT THE PINNED COMMIT, fetched from GitHub raw. The
//     commit is parsed out of lib/aave-vaults/vault-catalog.ts — that much is
//     ours — but the constant → address mapping is read from the published file
//     at that commit, so a transcription that drifted goes red here rather than
//     agreeing with itself (the `verify-ethereum-vaults` precedent).
//   • THE CHAIN, for the enumerator rung: `GsmRegistry.getGsmList()` at this
//     script's own block.
//   • ETHERSCAN, for the REFUSAL. N3's forbidden strings are fetched rather than
//     written down: the verified contract name of the refusal fixture's
//     implementation, and the address that deployed it. The check then asserts
//     those strings are ABSENT from the page. A list of banned words kept in this
//     repo would go stale the moment the fixture's explorer entry changed; this
//     way the thing being refused is the actual thing a careless build would
//     render.
//
// ⚠️ AND THAT IS THE ONLY PLACE EITHER STRING MAY APPEAR. A verified source name
// is the name a deployer gave a file — anyone can deploy a contract under any
// name — so it is research material, never a rendered fact. It is fetched here
// to be asserted absent.
//
// ⚠️ THE ABSENCE IS READ OFF `innerText`, NOT OFF THE HTML, and that is not
// fussiness: every page in this app carries the site-wide protocol roster in a
// `<meta name="keywords">` tag, and that roster names a lending protocol whose
// name this fixture's implementation shares. Measured on the deployed site —
// `curl … | grep -ci morpho` returns 2 on F5's page, both of them inside that
// meta tag and neither of them a claim about this address. A raw-HTML grep would
// be red for a reason that has nothing to do with the subject; what a reader sees
// is what the check is about.
//
// ── FIXTURES (plan §1), AS INPUTS ──────────────────────────────────────────
//   F1  waEthUSDT `0x7bc3…3af8` / `0x8822…f5e3` — Aave's GHO Stability Module
//       for USDT, `GhoEthereum.GSM_USDT` in the book, 23.8% of the vault at the
//       census. The page that must gain a name.
//   F3  waEthUSDC `0xd4fa…d23e` / `0x6bf1…8aa6` — the catalogue holding itself.
//   F5  waEthUSDC `0xd4fa…d23e` / `0xde6e…ecbc` — the REFUSAL. A transparent
//       proxy whose implementation carries a third-party protocol's name in a
//       block explorer, deployed by an externally owned account, enumerated by no
//       registry of that protocol. Its page must name no protocol at all.
// A fixture that has exited is a FAILURE, never a skip (N0).
//
// Run:
//   BASE=http://localhost:3767 node scripts/verify/verify-vault-holder-identity.mjs
// Needs ALCHEMY_URL and ETHERSCAN_API_KEY in .env.local (read, never printed).
//
// ── PROVED IT CAN FAIL, 2026-09-10, BASE=http://localhost:3767 ─────────────
// Restored run: 12/12. Six breaks, applied one at a time to a throwaway copy of
// the tree and reverted; the lines are those runs' own output.
//
//  (a) A CONSTANT NAME THE BOOK DOES NOT CARRY — `GhoEthereum.GSM_USDT` renamed
//      to `GHO_GSM_USDT` in the table (which is, as it happens, the name the plan
//      guessed before the file was fetched). 10/12.
//      FAIL N2 — "GhoEthereum.GHO_GSM_USDT: ladder 0x8822…f5e3, book not found"
//      FAIL N1 — 'constant GhoEthereum.GHO_GSM_USDT via book … "named
//                 GHO_GSM_USDT — Aave publishes this address as
//                 GhoEthereum.GHO_GSM_USDT in its own address book"'
//      🔑 The page renders the wrong citation perfectly happily. Only the fetch
//      of the published file can see it, which is the whole reason N2 exists.
//
//  (b) THE CONSTANT POINTED AT A NEAR-MISS ADDRESS — last nibble changed. 8/12.
//      FAIL N2  — "ladder 0x8822…f5e4, book 0x8822…f5e3"
//      FAIL N2c — "getGsmList() … · missing GhoEthereum.GSM_USDT"
//      FAIL N1  — "constant GhoEthereum.GSM_REGISTRY via enumerator"
//      FAIL N6  — "1 card(s), 0 named"
//      🔑 N1's line is the interesting one: the real GSM still gets a name,
//      through RUNG 2 — the registry's own answer at that block — and the check
//      catches it because it asserts WHICH rung answered, not merely that some
//      name appeared. The enumerator rung is live, and this is the run that
//      proves it.
//
//  (c) THE LADDER CONSULTED FOR NOBODY — the `attested` lookup forced to null in
//      the shape reader. 10/12.
//      FAIL N1  — "kind erc1967-proxy … 'is a proxy to 0x31fe…8788 … nothing here
//                  names it'"
//      FAIL N1b — the UNDERLYING_ASSET clause gone with it
//      🔑 This is exactly the page as it read before this phase: a correct
//      sentence about a proxy, and not one word about whose it is.
//
//  (d) A VERIFIED-SOURCE NAME RENDERED on the unnamed proxy — the refusal undone
//      in `HolderShapeLine`'s `erc1967-proxy` arm. 11/12.
//      FAIL N3 — 'the implementation\'s verified contract name ("MorphoCredit")
//                 appears on the page · the protocol word inside it ("Morpho")
//                 appears on the page'
//      🔑 Both needles were FETCHED from Etherscan in the same run, not written
//      down here, so the check refuses the actual string a careless build would
//      render rather than a guess about it.
//
//  (e) THE LISTING CARD'S NAMED CASE REMOVED. 11/12.
//      FAIL N6 — "1 card(s), 0 named"
//
//  (f) THE NAMED ADDRESS ADDED TO THE VAULT CATALOGUE — the scope-discipline
//      mistake §4 forbids. 9/12.
//      FAIL N5  — "/ethereum/aave/vaults/0x8822…f5e3 → 200"
//      FAIL N1  — 'kind aave-vault … "a vault in this same catalogue."'
//      FAIL N1b — the same line
//      🔑 A GSM is a HOLDER identity. Made a catalogue row it would grow a market
//      view about a contract that is not a vault, and lose the citation it was
//      given — two wrongs from one tidy-looking edit.
//
import { chromium } from "playwright";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3767";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");

const F1 = {
  vault: "0x7bc3485026ac48b6cf9baf0a377477fff5703af8",
  holder: "0x882285e62656b9623af136ce3078c6bdcc33f5e3",
};
const F3 = {
  vault: "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e",
  holder: "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6",
};
const F5 = {
  vault: "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e",
  holder: "0xde6e08ac208088cc62812ba30608d852c6b0ecbc",
};

/** The module under test, read as TEXT for its own claims — the commit it pins,
 *  the registry address it asks, and which constant it says names which address.
 *  Parsed rather than imported because every one of those claims is then checked
 *  against the published file and the chain; importing the module and comparing
 *  it to itself is the shape of check that cannot fail. */
const LADDER = (() => {
  const src = fs.readFileSync(path.join(ROOT, "lib/shared/attested-addresses.ts"), "utf8");
  const registry = src.match(/AAVE_GSM_REGISTRY = "(0x[0-9a-f]{40})"/)?.[1];
  const entries = [
    ...src.matchAll(/address: "(0x[0-9a-f]{40})",\s*\n\s*publisher: "(\w+)",\s*\n\s*constant: "([\w.]+)"/g),
  ].map((m) => ({ address: m[1], publisher: m[2], constant: m[3] }));
  const commit = fs
    .readFileSync(path.join(ROOT, "lib/aave-vaults/vault-catalog.ts"), "utf8")
    .match(/AAVE_ADDRESS_BOOK_COMMIT = "([0-9a-f]{40})"/)?.[1];
  if (!registry || !commit || entries.length === 0)
    throw new Error("attested-addresses parse: registry, commit or entries missing");
  return { registry, commit, entries };
})();

const client = createPublicClient({
  chain: mainnet,
  transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 3 }),
});

let passes = 0;
let failures = 0;
let skipped = 0;
const check = (name, cond, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const skip = (name, why) => {
  skipped++;
  console.log(`SKIP ${name} — ${why}`);
};
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const VAULT_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const REGISTRY_ABI = parseAbi(["function getGsmList() view returns (address[])"]);

const browser = await chromium.launch();
const page = await browser.newPage();
console.log(`\n── the naming ladder · ${BASE} ──\n`);

/** One position page, read as a reader sees it. */
async function readPage(f) {
  const url = `${BASE}/ethereum/aave/vaults/${f.vault}/${f.holder}`;
  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  const status = res?.status() ?? 0;
  if (status !== 200) return { url, status };
  const grab = async (sel, attr) => {
    const el = page.locator(sel);
    if ((await el.count()) === 0) return null;
    return attr ? el.first().getAttribute(attr) : (await el.first().innerText()).replace(/\s+/g, " ").trim();
  };
  return {
    url,
    status,
    block: Number(await grab("[data-vault-block]", "data-vault-block")),
    shapeKind: await grab("[data-holder]", "data-holder-shape-kind"),
    shapeLine: await grab('[data-figure="holder-shape"]'),
    attestedConstant: await grab('[data-figure="holder-shape"]', "data-attested-constant"),
    attestedVia: await grab('[data-figure="holder-shape"]', "data-attested-via"),
    cataloguedLine: await grab('[data-figure="holder-catalogued"]'),
    // The body as a READER sees it — innerText, never the flight payload: a
    // string that reaches only the RSC payload is not on the page, and an
    // absence check against the payload would have been the vacuous version of
    // N3 (memory `vaults-section-build`).
    body: (await page.locator("main, body").first().innerText()).replace(/\s+/g, " "),
  };
}

// ── N0: the fixtures still are what every check below assumes ───────────────
const [f1Balance, f5Balance] = await Promise.all([
  client.readContract({ address: F1.vault, abi: VAULT_ABI, functionName: "balanceOf", args: [F1.holder] }),
  client.readContract({ address: F5.vault, abi: VAULT_ABI, functionName: "balanceOf", args: [F5.holder] }),
]);
check(
  "N0 F1 and F5 both still hold a positive balance — an exited fixture makes every check below it vacuous",
  f1Balance > 0n && f5Balance > 0n,
  `F1 ${f1Balance}, F5 ${f5Balance}`,
);

// ── N2: the register's expectation comes from the published file ────────────
// Fetched FIRST, because N1 asserts the page states what the book says — so the
// book's answer has to be in hand before the page is judged against it.
const BOOK_BASE = `https://raw.githubusercontent.com/aave-dao/aave-address-book/${LADDER.commit}/src/ts`;
let book = null;
try {
  const files = [...new Set(LADDER.entries.map((e) => e.constant.split(".")[0]))];
  const texts = await Promise.all(
    files.map(async (f) => {
      const r = await fetch(`${BOOK_BASE}/${f}.ts`);
      if (!r.ok) throw new Error(`${f}.ts ${r.status}`);
      return [f, await r.text()];
    }),
  );
  book = new Map(texts);
} catch (error) {
  console.log(`      (address book fetch failed: ${error.message})`);
}
const bookAddress = (dotted) => {
  const [file, name] = dotted.split(".");
  const src = book?.get(file);
  return src?.match(new RegExp(`export const ${name} =\\s*'(0x[0-9a-fA-F]{40})'`))?.[1]?.toLowerCase() ?? null;
};
if (!book) {
  skip("N2 every attested address is the one Aave's book publishes at the pinned commit", "address book fetch failed");
  skip("N2b the registry the ladder asks is the one the book names", "address book fetch failed");
} else {
  const wrong = LADDER.entries
    .map((e) => ({ e, published: bookAddress(e.constant) }))
    .filter(({ e, published }) => published !== e.address);
  check(
    "N2 every address the ladder names is that constant's address in Aave's own book at the pinned commit",
    wrong.length === 0 && LADDER.entries.length > 0,
    wrong
      .map(({ e, published }) => `${e.constant}: ladder ${short(e.address)}, book ${published ?? "not found"}`)
      .join("; ") || `${LADDER.entries.length} constants checked at ${LADDER.commit.slice(0, 10)}`,
  );
  const publishedRegistry = bookAddress("GhoEthereum.GSM_REGISTRY");
  check(
    "N2b the enumerator rung asks the registry the book publishes, not an address of ours",
    publishedRegistry === LADDER.registry,
    `ladder ${LADDER.registry}, book ${publishedRegistry ?? "not found"}`,
  );
}

// ── N2c: the enumerator rung against the chain ──────────────────────────────
const head = await client.getBlockNumber();
const gsmList = (
  await client.readContract({
    address: LADDER.registry,
    abi: REGISTRY_ABI,
    functionName: "getGsmList",
    blockNumber: head,
  })
).map((a) => a.toLowerCase());
const missingFromRoster = LADDER.entries.filter((e) => !gsmList.includes(e.address));
check(
  "N2c the registry's own answer at this block still contains every address the table names",
  gsmList.length > 0 && missingFromRoster.length === 0,
  `getGsmList() at ${head} returned ${gsmList.length}: ${gsmList.map(short).join(", ")}${
    missingFromRoster.length ? ` · missing ${missingFromRoster.map((e) => e.constant).join(", ")}` : ""
  }`,
);

// ── N1: F1's page states the name, and whose claim it is ────────────────────
const f1 = await readPage(F1);
const f1Entry = LADDER.entries.find((e) => e.address === F1.holder);
const f1Published = book ? bookAddress(f1Entry?.constant ?? "") : null;
const shortConstant = (f1Entry?.constant ?? "").split(".").pop();
check(
  "N1 F1's page names it from the book — the constant, the commit, and whose book it is",
  f1.status === 200 &&
    f1.shapeKind === "attested" &&
    f1.attestedConstant === f1Entry?.constant &&
    f1.attestedVia === "book" &&
    (f1.shapeLine ?? "").includes(shortConstant ?? " ") &&
    (f1.shapeLine ?? "").includes(LADDER.commit.slice(0, 10)) &&
    /Aave publishes this address/.test(f1.shapeLine ?? "") &&
    (book ? f1Published === F1.holder : true),
  `status ${f1.status}, kind ${f1.shapeKind}, constant ${f1.attestedConstant} via ${f1.attestedVia}, book says ${
    f1Published ?? "(not fetched)"
  } · "${(f1.shapeLine ?? "").slice(0, 170)}"`,
);
check(
  "N1b and it states the read that says WHY this address holds this vault, not the name alone",
  /UNDERLYING_ASSET\(\) is this vault/.test(f1.shapeLine ?? ""),
  `"${(f1.shapeLine ?? "").slice(-120)}"`,
);

// ── N6: the listing row says it too, in the card's own register ─────────────
const listingUrl = `${BASE}/ethereum/aave/vaults/positions?q=${F1.holder}`;
const listingRes = await page.goto(listingUrl, { waitUntil: "networkidle", timeout: 120_000 });
const listing = await page.evaluate(() => ({
  cards: [...document.querySelectorAll("[data-position-card]")].map((e) => e.getAttribute("data-position-card")),
  attested: [...document.querySelectorAll("[data-attested-constant]")].map((e) =>
    e.getAttribute("data-attested-constant"),
  ),
  text: document.body.innerText.replace(/\s+/g, " "),
}));
check(
  "N6 the listing's own rows for that address carry the name, in the card's one-phrase register",
  listingRes?.status() === 200 &&
    listing.cards.length > 0 &&
    listing.attested.length === listing.cards.length &&
    listing.attested.every((c) => c === f1Entry?.constant) &&
    new RegExp(`${shortConstant} in Aave`).test(listing.text),
  `status ${listingRes?.status()}, ${listing.cards.length} card(s), ${listing.attested.length} named: ${[
    ...new Set(listing.attested),
  ].join(", ")}`,
);

// ── N5: a name is not a vault — the GSM keeps 404-ing on its own route ──────
const gsmPage = await page.goto(`${BASE}/ethereum/aave/vaults/${F1.holder}`, {
  waitUntil: "domcontentloaded",
  timeout: 120_000,
});
check(
  "N5 the named address has no vault page of its own — it is a holder identity, not a catalogue row",
  gsmPage?.status() === 404,
  `/ethereum/aave/vaults/${short(F1.holder)} → ${gsmPage?.status()}`,
);

// ── N3: THE REFUSAL ────────────────────────────────────────────────────────
// The forbidden strings are fetched from Etherscan, not written down here: the
// verified contract name of the fixture's implementation, and the address that
// deployed it. Then the page is required NOT to contain them — and to still say
// what it CAN read, because "names no protocol" must not be achievable by
// rendering nothing at all.
const f5 = await readPage(F5);
let forbidden = null;
if (!env.ETHERSCAN_API_KEY) {
  skip(
    "N3 F5's page names no protocol",
    "no ETHERSCAN_API_KEY — the forbidden strings come from there, never from a list here",
  );
} else {
  try {
    const es = async (params) => {
      const r = await fetch(`https://api.etherscan.io/v2/api?chainid=1&apikey=${env.ETHERSCAN_API_KEY}&${params}`);
      const j = await r.json();
      return j.result;
    };
    const creation = await es(`module=contract&action=getcontractcreation&contractaddresses=${F5.holder}`);
    const source = await es(`module=contract&action=getsourcecode&address=${F5.holder}`);
    const impl = source?.[0]?.Implementation;
    const implSource = impl ? await es(`module=contract&action=getsourcecode&address=${impl}`) : null;
    forbidden = {
      deployer: creation?.[0]?.contractCreator?.toLowerCase() ?? null,
      factory: creation?.[0]?.contractFactory || null,
      implName: implSource?.[0]?.ContractName || null,
      proxyName: source?.[0]?.ContractName || null,
    };
  } catch (error) {
    console.log(`      (Etherscan fetch failed: ${error.message})`);
  }
  if (!forbidden?.implName || !forbidden?.deployer) {
    skip("N3 F5's page names no protocol", "Etherscan did not answer the fixture's implementation name or its creator");
  } else {
    // The protocol name inside the verified contract name — "FooCredit" is
    // Foo's claim about itself at most, and this page may not repeat even the
    // first word of it.
    const word = forbidden.implName.replace(/[^A-Za-z].*$/, "").replace(/(Credit|Vault|Pool|Token|Proxy)$/i, "");
    const hits = [
      ["the implementation's verified contract name", forbidden.implName],
      ["the protocol word inside it", word.length >= 4 ? word : null],
      ["the deploying address", forbidden.deployer],
    ].filter(([, needle]) => needle && f5.body.toLowerCase().includes(needle.toLowerCase()));
    check(
      "N3 F5's page names no protocol — not the verified implementation name, not the word inside it, not the deployer",
      f5.status === 200 && hits.length === 0,
      hits.length
        ? hits.map(([what, needle]) => `${what} ("${needle}") appears on the page`).join(" · ")
        : `checked "${forbidden.implName}", "${word}", ${short(forbidden.deployer)} against ${f5.body.length} characters of rendered page`,
    );
    check(
      "N3b it was DEPLOYED BY AN ACCOUNT, not by any factory — which is why no registry of that protocol can attest it",
      forbidden.factory == null || forbidden.factory === "",
      `contractFactory "${forbidden.factory ?? ""}" · creator ${short(forbidden.deployer)}`,
    );
  }
}
check(
  "N3c and the refusal is stated rather than silent — the page still says what it can read of that address",
  f5.status === 200 &&
    f5.shapeKind !== "attested" &&
    /is a proxy to 0x/.test(f5.shapeLine ?? "") &&
    /nothing here names it/.test(f5.shapeLine ?? ""),
  `kind ${f5.shapeKind} · "${(f5.shapeLine ?? "").slice(0, 150)}"`,
);

// ── N4: the two surfaces about one pair agree ──────────────────────────────
// F3 is the catalogue holding itself. Its position page names the holder as a
// catalogue member; the VAULT page names the same token as this vault's backing
// with the share it holds. One relationship, stated from both ends.
const f3 = await readPage(F3);
const vaultRes = await page.goto(`${BASE}/ethereum/aave/vaults/${F3.vault}`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
const vaultFace = await page.evaluate(() => ({
  backedBy: document.querySelector("[data-backed-by]")?.getAttribute("data-backed-by") ?? null,
  sentence: document.querySelector('[data-figure="vault-backed-by"]')?.innerText?.replace(/\s+/g, " ") ?? "",
}));
check(
  "N4 F3's position page names the holder as a catalogue member, and the vault's own page names it as this vault's backing",
  f3.status === 200 &&
    f3.shapeKind === "aave-vault" &&
    // TWO LINES, TWO PHRASES: the catalogued line is the cross-link's own
    // sentence, the shape line is the code read's. Testing one phrase against
    // "either line" would pass on whichever happened to carry it.
    /one vault in Aave/.test(f3.cataloguedLine ?? "") &&
    /a vault in this same catalogue/.test(f3.shapeLine ?? "") &&
    vaultRes?.status() === 200 &&
    vaultFace.backedBy === F3.holder &&
    /holds \d/.test(vaultFace.sentence),
  `position kind ${f3.shapeKind}; vault page backed-by ${vaultFace.backedBy} · "${vaultFace.sentence.slice(0, 120)}"`,
);

await browser.close();
console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
process.exit(failures ? 1 : 0);

#!/usr/bin/env node
// Aave V4 collateral factors match the spoke (rails-ops TO-DO-ui-jobs items
// 103 and 131).
// ----------------------------------------------------------------------------
// A spoke sets each reserve's collateral factor under a dynamic config key
// (getReserve(id).dynamicConfigKey → getDynamicReserveConfig(id, key)), and a
// position keeps the key it last took (getUserPosition(id, user)
// .dynamicConfigKey), so a position can hold an older factor than the one the
// reserve offers now. EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN READ.
//
//   H. /api/aave-v4/hubs — every line's `lt` is the reserve's factor at its
//      current key, null where that is 0, with `ltBlock` set. Bluechip USDC
//      (borrow-only, factor 0) reads null; the index held 0.80.
//   P. /api/chain/aave-v4/spoke-position — on single-collateral positions the
//      collateral reserve's `lt` equals getUserAccountData.avgCollateralFactor
//      (a Kelp rsETH position reads 0.95 though the reserve's key now reads 0).
//      With ?block=N the read is pinned to N and cached immutable.
//   C. A closed position's card states the factor that applied while it was
//      open ("While it was open, …"), the figure this script reads at the
//      block before its collateral's last event.
//
//   BASE=http://localhost:3000 node scripts/verify/verify-aave-v4-collateral-factors.mjs
//
// Needs ALCHEMY_URL in .env.local. Prints lane names only, never a URL.

import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, hostFetch, bypassHeaders } from "./lib/host.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l
        .slice(l.indexOf("=") + 1)
        .trim()
        .replace(/^"|"$/g, ""),
    ]),
);
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");
const scrub = (text) => String(text).replace(/https?:\/\/[^\s"'`)}\]]+/g, "<lane URL redacted>");
for (const signal of ["uncaughtException", "unhandledRejection"])
  process.on(signal, (error) => {
    console.error(`\nFAILED (${signal}) — ${scrub(error?.stack ?? error?.message ?? error)}`);
    process.exit(1);
  });

const c = createPublicClient({ chain: mainnet, transport: http(env.ALCHEMY_URL, { retryCount: 6 }) });
const ABI = parseAbi([
  "function getReserveCount() view returns (uint256)",
  "function getReserve(uint256 id) view returns ((address underlying, address hub, uint256 assetId, uint256 decimals, uint256 collateralRisk, uint256 flags, uint32 dynamicConfigKey))",
  "function getDynamicReserveConfig(uint256 id, uint32 key) view returns ((uint256 collateralFactor, uint256 maxLiquidationBonus, uint256 liquidationFee))",
  "function getUserAccountData(address user) view returns (uint256 riskPremium, uint256 avgCollateralFactor, uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValueRay, uint256 activeCollateralCount, uint256 borrowCount)",
]);
const SPOKES = {
  main: "0x94e7a5dcbe816e498b89ab752661904e2f56c485",
  bluechip: "0x973a023a77420ba610f06b3858ad991df6d85a08",
  ethena_corr: "0x58131e79531cab1d52301228d1f7b842f26b9649",
  ethena_eco: "0xba1b3d55d249692b669a164024a838309b7508af",
  etherfi: "0xbf10bdfe177de0336afd7fccf80a904e15386219",
  forex: "0xd8b93635b8c6d0ff98cbe90b5988e3f2d1cd9da1",
  gold: "0x65407b940966954b23dfa3caa5c0702bb42984dc",
  kelp: "0x3131fe68c4722e726fe6b2819ed68e514395b9a4",
  lido: "0xe1900480ac69f0b296841cd01cc37546d92f35cd",
  lombard: "0x7ec68b5695e803e98a21a9a05d744f28b0a7753d",
  usdg_pendle: "0x956d8e0a89cfa3744428c4641b5a53b56167a7f9",
  usdg_syrup: "0x774b9655413c34809c1f1b16b654465a89ebe989",
  usdg_paxg: "0xad75ce6354f87f3135ce10621d385d8d1e2562c2",
};
const HUB_KEY_BY_ADDR = {
  "0xcca852bc40e560adc3b1cc58ca5b55638ce826c9": "core",
  "0x06002e9c4412cb7814a791ea3666d905871e536a": "plus",
  "0x943827dca022d0f354a8a8c332da1e5eb9f9f931": "prime",
  "0x62d63197660c080236193ca60b70e49a08e90368": "paxos",
};
// Single-collateral open positions (P), and closed positions (C) with the
// spoke page slug the card renders on.
const OPEN = [
  { spoke: "kelp", wallet: "0xabfe00f81c2b9734c2fecec3f1996e18611ce658" },
  { spoke: "main", wallet: "0x05453676e8525e4f206950b5e1c6fd380a068ee7" },
];
const CLOSED = [
  { spoke: "main", slug: "main", wallet: "0x13460df7915105277fa9bd598496f329b80ee44a" },
  { spoke: "bluechip", slug: "bluechip", wallet: "0xff6614ee884bfdf3d03a5bf7bee85187b828e4b0" },
];

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const getJson = async (p) => {
  const r = await hostFetch(`${BASE}${p}`);
  if (!r.ok) throw new Error(`${p.split("?")[0]} answered ${r.status}`);
  return { body: await r.json(), headers: r.headers };
};

console.log(`\n── aave v4 collateral factors · ${BASE.startsWith("http://localhost") ? "local" : "hosted"} ──`);

// ── H. hubs ──────────────────────────────────────────────────────────────────
console.log("\n## H. /api/aave-v4/hubs");
const { body: hubs } = await getJson("/api/aave-v4/hubs");
const chainCf = new Map();
for (const [key, a] of Object.entries(SPOKES)) {
  const addr = getAddress(a);
  const n = Number(await c.readContract({ address: addr, abi: ABI, functionName: "getReserveCount" }));
  for (let i = 0; i < n; i++) {
    const r = await c.readContract({ address: addr, abi: ABI, functionName: "getReserve", args: [BigInt(i)] });
    const d = await c.readContract({
      address: addr,
      abi: ABI,
      functionName: "getDynamicReserveConfig",
      args: [BigInt(i), r.dynamicConfigKey],
    });
    chainCf.set(
      `${key}|${HUB_KEY_BY_ADDR[r.hub.toLowerCase()]}|${Number(r.assetId)}`,
      Number(d.collateralFactor) / 1e4,
    );
  }
}
let matched = 0;
const wrong = [];
for (const l of hubs.lines) {
  const cf = chainCf.get(`${l.spoke}|${l.hub}|${l.assetId}`);
  if (cf == null) continue;
  matched++;
  const want = cf > 0 ? cf : null;
  if (l.lt !== want || l.ltBlock == null) wrong.push(`${l.spoke} ${l.symbol} (${l.hub}) lt ${l.lt} chain ${cf}`);
}
check(
  "every line the spokes list is on the wire",
  matched > 0 && matched === hubs.lines.length,
  `${matched} of ${hubs.lines.length}`,
);
check(
  "every line's lt is the spoke's current factor, null at 0, with ltBlock",
  wrong.length === 0,
  wrong.slice(0, 4).join("; "),
);
const bluechipUsdc = hubs.lines.filter((l) => l.spoke === "bluechip" && l.symbol === "USDC");
check("Bluechip USDC reads no collateral factor", bluechipUsdc.length > 0 && bluechipUsdc.every((l) => l.lt === null));

// ── P. position factors at the position's own key ─────────────────────────────
console.log("\n## P. /api/chain/aave-v4/spoke-position");
for (const f of OPEN) {
  const { body } = await getJson(`/api/chain/aave-v4/spoke-position?wallet=${f.wallet}&spoke=${f.spoke}`);
  const acct = await c.readContract({
    address: getAddress(SPOKES[f.spoke]),
    abi: ABI,
    functionName: "getUserAccountData",
    args: [getAddress(f.wallet)],
  });
  const avg = Number(acct[1]) / 1e18;
  const coll = body.reserves.filter((r) => r.isCollateral && r.supplyBalanceRaw !== "0");
  check(
    `${f.spoke} ${f.wallet.slice(0, 6)}: collateral lt equals avgCollateralFactor`,
    acct[5] === 1n && coll.length === 1 && Math.abs(coll[0].lt - avg) < 1e-9,
    `${coll[0]?.symbol} lt ${coll[0]?.lt}, chain ${avg}`,
  );
}

// ── C. closed card ───────────────────────────────────────────────────────────
console.log("\n## C. closed position card");
const browser = await chromium.launch();
const context = await browser.newContext({ extraHTTPHeaders: bypassHeaders() });
for (const f of CLOSED) {
  // The block before the last collateral event, read here independently.
  const { body: tl } = await getJson(`/api/aave-v4/timeline?wallet=${f.wallet}&recent=200`);
  const rows = (tl.events ?? tl.rows ?? tl).filter?.((e) => e.context?.data?.spokeName != null) ?? [];
  const coll = rows.filter((e) => ["supply", "withdraw", "collateral_toggle"].includes(e.context.data.eventType));
  const spokeRows = coll.filter((e) => (e.context.data.spokeAddress ?? "").toLowerCase() === SPOKES[f.spoke]);
  const last = Math.max(...spokeRows.map((e) => e.blockNumber));
  const { body: then, headers } = await getJson(
    `/api/chain/aave-v4/spoke-position?wallet=${f.wallet}&spoke=${f.spoke}&block=${last - 1}`,
  );
  check(
    `${f.spoke} ${f.wallet.slice(0, 6)}: ?block= pins the read and caches it`,
    then.blockNumber === last - 1 && /immutable/.test(headers.get("cache-control") ?? ""),
    `block ${then.blockNumber}`,
  );
  const held = then.reserves.filter((r) => r.isCollateral && r.lt > 0);
  const page = await context.newPage();
  await page.goto(`${BASE}/ethereum/aave-v4/spoke/${f.slug}/${f.wallet}`, { waitUntil: "domcontentloaded" });
  // The Explanation pane stays mounted while collapsed, so its text is in the
  // DOM once the read lands.
  const text = await page
    .waitForFunction(
      () => {
        const t = document.body.textContent ?? "";
        const m = t.match(/(While it was open|Today [^.]*collateral factor)[^•]*/);
        return m ? m[0] : null;
      },
      null,
      { timeout: 90_000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => "");
  const pcts = held.map((r) => `${Math.round(r.lt * 100)}%`);
  check(
    `${f.spoke} ${f.wallet.slice(0, 6)}: card states the factors that applied while open`,
    /While it was open/.test(text) && pcts.length > 0 && pcts.every((p) => text.includes(p)),
    `${pcts.join(", ")} · "${text.slice(0, 90)}…"`,
  );
  await page.close();
}
await browser.close();

console.log(failures === 0 ? "\nALL CHECKS PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

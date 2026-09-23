// Sweeps every listing + a detail page and reports any <Prov> that rendered
// OUTSIDE a receipts scope — i.e. any figure whose receipt silently does not
// exist. Needs a dev server (the warning is dev-only): `npm run dev`, then
// `node scripts/verify/verify-unscoped-prov.mjs`.
//
// ⚠️ A GREEN RUN ONLY MEANS SOMETHING IF THE PAGES LOADED. The first version of
// this swallowed navigation errors, and reported a clean zero while every page
// was returning 500 (a production `npm run build` had clobbered `.next` under
// the running dev server). It now aborts on any non-2xx rather than reporting
// a zero it did not earn.
//
// To confirm the tripwire still has teeth, break a scope on purpose — change
// position-card-shell.tsx's `receipts ? <ProvReceiptsScope…>` to `false ?` —
// and re-run: it should report ~250 labels.

import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3000";
const PAGES = [
  "/",
  "/coverage/ethereum",
  "/ethereum/liquity-v1",
  "/ethereum/liquity-v1/0x8eb2e0cebcd191625037a042c9edf67b7f7fd74c",
  "/ethereum/llamalend",
  "/ethereum/llamalend/0x100daa78fc509db39ef7d04de0c1abd299f4c6ce/0xe32a8cf93af8661ec4708ef627b255801184ad2f",
  "/ethereum/aave-v4",
  "/ethereum/morpho",
  "/ethereum/fluid",
  "/ethereum/compound-v3",
  "/ethereum/spark",
  "/ethereum/makerdao",
  "/ethereum/frankencoin",
  "/ethereum/fx",
  "/ethereum/maple",
  "/ethereum/pwn",
  "/ethereum/dolomite",
  "/ethereum/moonwell",
];
const hits = new Map();
let bad = 0;
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
page.on("console", (m) => {
  const t = m.text();
  if (!t.includes("[provenance]")) return;
  const label = (t.match(/"([^"]+)"/) || [])[1] ?? t.slice(0, 80);
  if (!hits.has(label)) hits.set(label, page.url().replace(BASE, ""));
});
for (const p of PAGES) {
  const r = await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 90000 });
  if (!r || r.status() >= 400) {
    console.log(`!! ${p} → ${r ? r.status() : "no response"}`);
    bad++;
  }
  await page.waitForTimeout(2500);
}
await b.close();
if (bad) {
  console.log(`\nABORT — ${bad} page(s) did not load; this sweep proves nothing.`);
  process.exit(1);
}
console.log(`\n${hits.size} distinct unscoped receipt label(s):`);
for (const [l, u] of hits) console.log(`  ${l}   ← first seen ${u}`);

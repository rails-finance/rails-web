// A sweep chain 1's logs lane REFUSES comes back as a stated floor, not as an
// unread history. Run: `npx tsx scripts/verify/verify-aave-vault-timeline-refused-sweep.ts`
// ----------------------------------------------------------------------------
// The loader is called directly rather than through a page, because what is
// under test is the loader's own branch: chain 1's logs lane will not answer a
// one-direction `eth_getLogs` past 10,000 logs, and before this check existed
// such a holder fell to the outer catch and rendered as "could not be read".
//
// TWO FIXTURES, BECAUSE ONE BRANCH IS NOT A PROOF. The refused holder shows the
// floor path; a small holder on the SAME vault shows that the ordinary path
// still sweeps, reconciles and returns rows. A run where only the first passed
// would be indistinguishable from a loader that had stopped reading anything.
//
// The store is not written to by this script and no page is rendered: `tail` is
// null on both calls, so each life is swept from block 0 on this request.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  if (!line.includes("=") || line.trim().startsWith("#")) continue;
  const key = line.slice(0, line.indexOf("=")).trim();
  if (!process.env[key]) process.env[key] = line.slice(line.indexOf("=") + 1).trim();
}
if (!process.env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");

// Imported after the env file is read, and inside `main()` rather than at the
// top: this repo's package.json declares no module type, so a top-level await
// here is a CommonJS transform error rather than a script.

/** The policy figure this check judges a floor against, RESTATED rather than
 *  imported: an expectation read out of the thing under test cannot catch a
 *  change to it. `VAULT_TIMELINE_HORIZON` in lib/shared/vault-holder-timeline.ts. */
const HORIZON = 5000;

/** waEthUSDC, and the address the TO-DO named — 63,180 of its own transfers
 *  there on 2026-09-09, which is six times what one direction of this lane will
 *  hand over. */
const REFUSED = {
  label: "waEthUSDC / 0xba13…9ba9 — the lane refuses both directions",
  vault: "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e",
  holder: "0xba1333333333a1ba1108e8412f11850a5c319ba9",
};
/** The same vault, a life the lane answers whole — the control. From
 *  verify-ethereum-vault-timeline.mjs's own fixture list. */
const ORDINARY = {
  label: "waEthUSDC / 0xab67…e34b — an ordinary life on the same vault",
  vault: "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e",
  holder: "0xab6752ad54f05fb40c7eccee4fb11a78a322e34b",
};

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function read(fixture: { label: string; vault: string; holder: string }) {
  const { loadAaveEthereumVault } = await import("@/lib/sources/chain/aave-ethereum-vault");
  const { loadAaveEthereumVaultTimelineWithTail } = await import("@/lib/sources/chain/aave-ethereum-vault-timeline");
  const data = await loadAaveEthereumVault(fixture.vault, fixture.holder);
  if (data.chainStale || data.vault.shareDecimals == null)
    throw new Error(`${fixture.label}: the vault read did not answer, so nothing below can be judged`);
  const started = Date.now();
  const result = await loadAaveEthereumVaultTimelineWithTail(data.vault.address, fixture.holder, {
    blockNumber: data.blockNumber,
    family: data.vault.family,
    shareDecimals: data.vault.shareDecimals,
    assetDecimals: data.vault.asset.decimals,
    tail: null,
  });
  return { data, result, ms: Date.now() - started };
}

async function main() {
  const { data: rData, result: refused, ms: rMs } = await read(REFUSED);
  const t = refused.timeline;
  console.log(
    `\n${REFUSED.label}\n  block ${rData.blockNumber}, ${rMs} ms — unread ${JSON.stringify(t.unread)}, logCount ${t.coverage.logCount}, withheldAbove ${t.coverage.withheldAbove}, lowerBound ${t.coverage.logCountIsLowerBound}, reconcile ${JSON.stringify(t.reconcile)}, rows ${t.events.length}, store ${refused.store === null ? "null" : "offered"}\n`,
  );
  check("the refused life is not stated as unread", t.unread === null, `unread ${JSON.stringify(t.unread)}`);
  check(
    "its rows are withheld with a count above the horizon",
    t.coverage.withheldAbove != null && t.coverage.withheldAbove > HORIZON,
    `withheldAbove ${t.coverage.withheldAbove}, horizon ${HORIZON}`,
  );
  check(
    "the count is marked a LOWER BOUND",
    t.coverage.logCountIsLowerBound === true,
    `logCountIsLowerBound ${t.coverage.logCountIsLowerBound}`,
  );
  check("no rows are drawn", t.events.length === 0, `${t.events.length} rows`);
  check("nothing is offered to the store", refused.store === null, `store ${refused.store === null ? "null" : "set"}`);
  check(
    "no gate is claimed to have run",
    t.reconcile === null,
    "a floor has no logs to replay, so a reconcile object would be a check that did not happen",
  );

  const { data: oData, result: ordinary, ms: oMs } = await read(ORDINARY);
  const o = ordinary.timeline;
  console.log(
    `\n${ORDINARY.label}\n  block ${oData.blockNumber}, ${oMs} ms — unread ${JSON.stringify(o.unread)}, logCount ${o.coverage.logCount}, withheldAbove ${o.coverage.withheldAbove}, lowerBound ${o.coverage.logCountIsLowerBound}, rows ${o.events.length}, reconciled ${o.reconcile?.reconciled} (replayed ${o.reconcile?.replayed} vs balanceOf ${o.reconcile?.onChain}, ${o.reconcile?.logsOut} out / ${o.reconcile?.logsIn} in)\n`,
  );
  check("the ordinary life still reads", o.unread === null, `unread ${JSON.stringify(o.unread)}`);
  check(
    "it reconciles wei-exact",
    o.reconcile?.reconciled === true,
    `${o.reconcile?.replayed} vs ${o.reconcile?.onChain}`,
  );
  check("it draws its rows", o.events.length > 0, `${o.events.length} rows`);
  check(
    "its count is exact, not a floor",
    o.coverage.logCountIsLowerBound === false && o.coverage.withheldAbove === null,
    `lowerBound ${o.coverage.logCountIsLowerBound}, withheldAbove ${o.coverage.withheldAbove}`,
  );

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

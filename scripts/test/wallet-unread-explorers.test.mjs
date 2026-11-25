// The empty wallet page's list of launched explorers it does not read (rails-ops decision 0073
// point 4; walletUnreadExplorers in lib/wallet/read-wallet.ts): drawn from the roster, the family
// modules, the visit modules and the liquidity sources, so an explorer joins at its launch and
// leaves with the change that reads it. The launch flags are flipped in memory on the roster's
// entries (protocolForSession), never in lib/shared/protocols.ts; the modules import through
// `@/`, resolved as wallet-visit-families.test.mjs does.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../", import.meta.url).href;
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = ${JSON.stringify(root)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const url = root + specifier.slice(2) + ext;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith("file:")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = new URL(specifier + ext, context.parentURL).href;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  if (/^next\\/[a-z-]+$/.test(specifier)) return next(specifier + ".js", context);
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

process.env.RAILS_API_URL = "http://box.test";

const { PROTOCOLS, protocolForSession } = await import("../../lib/shared/protocols.ts");
const { walletUnreadExplorers } = await import("../../lib/wallet/read-wallet.ts");
const { LIQUIDITY_SOURCES } = await import("../../lib/wallet/liquidity/sources.ts");
const { ARC_ON_WALLET } = await import("../../lib/wallet/families/aave-v4.ts");

const W = "0xC2aee730530AE26571d868743c4e1ad401F30f22";
const UNINDEXED = PROTOCOLS.filter((p) => p.history === "none").map((p) => p.id);
const FLAGS = Object.fromEntries(UNINDEXED.map((id) => [id, protocolForSession(id)?.unlaunched === true]));
/** Every unindexed entry launched, or the roster's own flags back. */
function launchAll(on) {
  for (const id of UNINDEXED) {
    const e = protocolForSession(id);
    if (on || !FLAGS[id]) delete e.unlaunched;
    else e.unlaunched = true;
  }
}
test.after(() => launchAll(false));

test("with every unindexed explorer launched, the page names the two no read takes, linked at the wallet", () => {
  launchAll(true);
  // Aave V4 on Arc's rows are read once its explorer is launched at module load (ARC_ON_WALLET).
  const arc = ARC_ON_WALLET
    ? []
    : [{ id: "aave-v4-arc", name: "Aave V4 on Arc", href: `/arc/aave-v4/${W.toLowerCase()}` }];
  assert.deepEqual(walletUnreadExplorers(W), [
    ...arc,
    { id: "fluid-base", name: "Fluid on Base", href: `/base/fluid/${W.toLowerCase()}` },
    { id: "lido", name: "Lido", href: `/ethereum/lido/${W.toLowerCase()}` },
  ]);
});

test("an unlaunched explorer is not named", () => {
  launchAll(false);
  const named = walletUnreadExplorers(W).map((e) => e.id);
  for (const id of named) assert.equal(protocolForSession(id)?.unlaunched, undefined, id);
  launchAll(true);
  delete protocolForSession("lido").unlaunched;
  protocolForSession("fluid-base").unlaunched = true;
  assert.deepEqual(
    walletUnreadExplorers(W)
      .map((e) => e.id)
      .filter((id) => id !== "aave-v4-arc"),
    ["lido"],
  );
});

test("every liquidity source names roster entries on its chain", () => {
  for (const s of LIQUIDITY_SOURCES) {
    assert.ok(s.explorers.length > 0, s.key);
    for (const id of s.explorers)
      assert.equal(PROTOCOLS.find((p) => p.id === id)?.chainId, s.chainId, `${s.key}: ${id}`);
  }
});

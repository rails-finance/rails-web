// The empty wallet page's list of launched explorers it does not read (rails-ops decision 0073
// point 4; walletUnreadExplorers in lib/wallet/read-wallet.ts): drawn from the roster, the family
// modules, the visit modules and the liquidity sources, so an explorer joins at its launch and
// leaves with the change that reads it. Fluid on Base's and Lido's modules are switched off in
// memory where a test needs an explorer no read takes. The launch flags are flipped in memory on the roster's
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
const { walletUnreadExplorers, WALLET_VISIT_FAMILIES } = await import("../../lib/wallet/read-wallet.ts");
const { LIQUIDITY_SOURCES } = await import("../../lib/wallet/liquidity/sources.ts");
const { ARC_ON_WALLET } = await import("../../lib/wallet/families/aave-v4.ts");
const { VISIT_HELD_OFF } = await import("../../lib/wallet/families/visit.ts");
const HELD = [...VISIT_HELD_OFF];

const W = "0xC2aee730530AE26571d868743c4e1ad401F30f22";
const UNINDEXED = PROTOCOLS.filter((p) => p.history === "none").map((p) => p.id);
const FLAGS = Object.fromEntries(UNINDEXED.map((id) => [id, protocolForSession(id)?.unlaunched === true]));
/** Every unindexed entry launched and no module held off, or restore the roster's flags and
 *  visit.ts's held-off set. */
function launchAll(on) {
  for (const id of UNINDEXED) {
    const e = protocolForSession(id);
    if (on || !FLAGS[id]) delete e.unlaunched;
    else e.unlaunched = true;
  }
  VISIT_HELD_OFF.clear();
  if (!on) for (const id of HELD) VISIT_HELD_OFF.add(id);
}
test.after(() => launchAll(false));

/** Fluid on Base's and Lido's visit modules switched off in memory while `fn` runs, so their
 *  explorers stand for a launched explorer no read takes. */
function withoutModules(ids, fn) {
  const saved = ids.map((id) => {
    const m = WALLET_VISIT_FAMILIES.find((x) => x.id === id);
    const own = Object.getOwnPropertyDescriptor(m, "on");
    Object.defineProperty(m, "on", { get: () => false, configurable: true });
    return [m, own];
  });
  try {
    return fn();
  } finally {
    for (const [m, own] of saved) Object.defineProperty(m, "on", own);
  }
}
const UNREAD = ["fluid-base", "lido"];

test("the page names the explorers no read takes, linked at the wallet", () => {
  launchAll(true);
  // Aave V4 on Arc's rows are read once its explorer is launched at module load (ARC_ON_WALLET).
  const arc = ARC_ON_WALLET
    ? []
    : [{ id: "aave-v4-arc", name: "Aave V4 on Arc", href: `/arc/aave-v4/${W.toLowerCase()}` }];
  assert.deepEqual(
    withoutModules(UNREAD, () => walletUnreadExplorers(W)),
    [
      ...arc,
      { id: "fluid-base", name: "Fluid on Base", href: `/base/fluid/${W.toLowerCase()}` },
      { id: "lido", name: "Lido", href: `/ethereum/lido/${W.toLowerCase()}` },
    ],
  );
});

test("Fluid on Base and Lido leave the list once their modules read them", () => {
  launchAll(true);
  const named = walletUnreadExplorers(W).map((e) => e.id);
  for (const id of UNREAD) assert.ok(!named.includes(id), id);
});

test("an unlaunched explorer is not named", () => {
  launchAll(false);
  const named = walletUnreadExplorers(W).map((e) => e.id);
  for (const id of named) assert.equal(protocolForSession(id)?.unlaunched, undefined, id);
  launchAll(true);
  delete protocolForSession("lido").unlaunched;
  protocolForSession("fluid-base").unlaunched = true;
  assert.deepEqual(
    withoutModules(UNREAD, () => walletUnreadExplorers(W))
      .map((e) => e.id)
      .filter((id) => id !== "aave-v4-arc"),
    ["lido"],
  );
});

test("a launched explorer whose visit module is switched off is named", () => {
  launchAll(true);
  const morpho = WALLET_VISIT_FAMILIES.find((m) => m.id === "morpho-optimism");
  assert.ok(morpho.on);
  assert.ok(!walletUnreadExplorers(W).some((e) => e.id === "morpho-optimism"));
  // The module's switch, off in memory while its explorer stays launched.
  const own = Object.getOwnPropertyDescriptor(morpho, "on");
  Object.defineProperty(morpho, "on", { get: () => false, configurable: true });
  try {
    assert.deepEqual(
      walletUnreadExplorers(W).find((e) => e.id === "morpho-optimism"),
      { id: "morpho-optimism", name: "Morpho Blue on Optimism", href: `/optimism/morpho/${W.toLowerCase()}` },
    );
  } finally {
    Object.defineProperty(morpho, "on", own);
  }
});

test("today: Morpho Blue on Optimism, launched and held off, is named", () => {
  launchAll(false);
  assert.ok(HELD.includes("morpho-optimism"));
  assert.ok(walletUnreadExplorers(W).some((e) => e.id === "morpho-optimism"));
});

test("every liquidity source names roster entries on its chain", () => {
  for (const s of LIQUIDITY_SOURCES) {
    assert.ok(s.explorers.length > 0, s.key);
    for (const id of s.explorers)
      assert.equal(PROTOCOLS.find((p) => p.id === id)?.chainId, s.chainId, `${s.key}: ${id}`);
  }
});

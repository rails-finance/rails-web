/**
 * The lean timeline wire — every event that reaches a page is the event the
 * transform built.
 *
 * A position page reduces a wallet's WHOLE history into the figures above the
 * list, so the whole history goes over the wire. `lib/shared/timeline-wire.ts`
 * takes four fields off each row — `etherscanUrl` (a template over `txHash`),
 * `actionLabel` (dictionary-encoded into the envelope), `wallet` (hoisted to
 * an envelope default) and `txHash` (the prefix of `id` on most protocols) —
 * and the fetch client puts them back before anything downstream sees them.
 * `BaseActivityEvent.protocol` and `.hidden` are gone outright: nothing read
 * either.
 *
 * The claim this file exists to test is "no figure on any page changed". It is
 * tested two ways:
 *
 *   1. SELF-CHECK (always). Every rehydrated event carries all four fields;
 *      every reconstructed hash is shaped like a transaction hash and every
 *      `id` is distinct; the explorer
 *      link points at the chain the envelope names, which for a Base explorer
 *      means basescan.org — `lib/sources/api/basedollar-timeline.ts` used to
 *      hard-code etherscan.io there and its CSV carried a wrong-chain link.
 *   2. EQUALITY (with `--ref`). The same fixture is fetched from a reference
 *      deployment that predates the diet, and every event is compared
 *      field-for-field against the rehydrated one. The ONLY differences
 *      allowed are the two fields deliberately removed and, on Base, the
 *      corrected explorer host. Events are matched by `id`, and a count
 *      difference is reported rather than failed: the index grows.
 *
 * Both arms are covered — the thirteen index proxies, the two grouped/keyset
 * shapes, and the five Base chain routes (whose four flat shapes and Morpho's
 * per-position shape go through one fetch client).
 *
 *   node scripts/verify/verify-timeline-wire.mjs
 *   node scripts/verify/verify-timeline-wire.mjs --ref=https://rails-web-onboarding.vercel.app
 *   node scripts/verify/verify-timeline-wire.mjs --only=spark,asymmetry
 *
 * Needs a dev server. BASE defaults to http://localhost:3000.
 *
 * The fixtures are pinned positions read off the production listings on
 * 2026-08-28. A fixture that has since closed or been re-keyed is a reason to
 * re-probe the listing, not a failure of the wire format.
 */

const BASE = process.env.BASE ?? "http://localhost:3000";
const args = process.argv.slice(2);
const REF = (args.find((a) => a.startsWith("--ref=")) ?? "").slice(6) || null;
const ONLY = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);

/** chainId → the explorer host every one of its events must link to. */
const EXPLORER_HOST = { 1: "etherscan.io", 8453: "basescan.org" };

const FIXTURES = [
  // ── the index proxies (Ethereum) ────────────────────────────────────────
  { name: "spark", chain: 1, path: "/api/spark/timeline?wallet=0x1601843c5e9bc251a3272907010afa41fa18347e" },
  {
    name: "aave-v3",
    chain: 1,
    path: "/api/aave-v3/timeline?wallet=0xee7ca610d896c53ffe716b801c05748efd902954&market=core",
  },
  {
    name: "compound-v3",
    chain: 1,
    path: "/api/compound/timeline?wallet=0xb9e62cb9b4ce8ec13c886fae67369da417ee2714&market=usdc",
  },
  {
    name: "compound-v2",
    chain: 1,
    path: "/api/compound-v2/timeline?wallet=0x9896bd979f9da57857322cc15e154222c4658a5a",
  },
  {
    name: "dolomite",
    chain: 1,
    path: "/api/dolomite/timeline?owner=0xeac83f37998a370c36a6eac2a18a040acc4fb600&accountNumber=32240150336664509314013882100458201794439878083374431556084268488477773350727",
  },
  { name: "fluid", chain: 1, path: "/api/fluid/timeline?nft=16893" },
  {
    name: "frankencoin",
    chain: 1,
    path: "/api/frankencoin/timeline?position=0x865762a0b70aaa5ebaad1cdc6b253ab02de8158e",
  },
  { name: "liquity-v1", chain: 1, path: "/api/liquity-v1/timeline?wallet=0x56356afabaa06b555029a1f1fee3fcecf21d3692" },
  {
    name: "llamalend",
    chain: 1,
    path: "/api/llamalend/timeline?controller=0x4e59541306910ad6dc1dac0ac9dfb29bd9f15c67&user=0x4b98fc03fb32b360513d34380150f267efa7ac07",
  },
  { name: "maple", chain: 1, path: "/api/maple/timeline?wallet=0xa1f114a58f5030841d9270b5d1b12ba0e0dd1fc3" },
  { name: "moonwell", chain: 1, path: "/api/moonwell/timeline?wallet=0xe3e56da9addc2e29532669140fb94fa7f21f6e4f" },
  { name: "pwn", chain: 1, path: "/api/pwn/timeline?wallet=0x2b79bc0ed6ba16078560e986a89d801c69757596" },
  { name: "makerdao", chain: 1, path: "/api/makerdao/vault/0x3d25235b7c414cb67bf09561a33fd6ce62c11dcf/timeline" },
  {
    name: "morpho",
    chain: 1,
    path: "/api/morpho/position/b4977179610abfecfc8b76255a002c16b33f46d077beb86e5911e1fe9ee6e512-0x66ea3fd6ba818ea79e0fe477552a593d4369c704/timeline",
  },
  { name: "fx", chain: 1, path: "/api/fx/position/wsteth/480/timeline" },
  {
    name: "ebisu",
    chain: 1,
    path: "/api/ebisu/sUSDe/38767992399838988350336392758823407708425408086117331868518504752269504506657/timeline",
  },
  // The wallet trap: 4,598 redemptions, each carrying the REDEEMER as its
  // `wallet`, not the trove owner. If the hoist were unconditional the
  // external-actor verdict on every one of them would flip.
  {
    name: "asymmetry",
    chain: 1,
    path: "/api/asymmetry/sUSDS/8309122898133156698498852897464396224593631760337811282458430493454418132410/timeline",
  },
  // ── Base ────────────────────────────────────────────────────────────────
  // The wrong-chain link: this transform hard-coded etherscan.io.
  {
    name: "basedollar",
    chain: 8453,
    path: "/api/basedollar/wstETH/35503968854505941585891917177059866138830265432583817156640567483056892500874/timeline",
    /** The explorer host is CORRECTED here, so the reference deployment's
     *  `etherscanUrl` is expected to differ. */
    explorerFixed: true,
  },
  {
    name: "aave-v3-base",
    chain: 8453,
    path: "/api/chain/aave-v3-base/timeline?wallet=0x55d81a6d646fe44afb496e8d151864dbe2501e08",
  },
  {
    name: "seamless",
    chain: 8453,
    path: "/api/chain/seamless/timeline?wallet=0x5ed6167232b937b0a5c84b49031139f405c09c8a",
  },
  {
    name: "compound-base",
    chain: 8453,
    path: "/api/chain/compound-base/timeline?wallet=0x96f1a7ce331f40afe866f3b707c223e377661087",
  },
  {
    name: "moonwell-base",
    chain: 8453,
    path: "/api/chain/moonwell-base/timeline?wallet=0x99d0413de55fa00cad854ed3d032924905deedca",
  },
  // Grouped: one list per (market, wallet) position, one envelope over all.
  {
    name: "morpho-base",
    chain: 8453,
    path: "/api/chain/morpho-base/timeline?wallet=0xafd2b916639c2e44a879c04d151cd6a0097c5b13",
    grouped: true,
  },
];

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log("    ok:", msg);
  else {
    failures++;
    console.log("    FAIL:", msg);
  }
}

// ── the rehydrator, written out again ───────────────────────────────────────
// Deliberately a second implementation rather than an import of the shipped
// one: if this and lib/shared/timeline-wire.ts disagree, that disagreement is
// the finding.
function explorerUrl(chainId, txHash) {
  const base = chainId === 8453 ? "https://basescan.org" : "https://etherscan.io";
  return `${base}/tx/${txHash}#eventlog`;
}

/** The `seg`-th segment of `id` split on `sep`. Mirrors `segmentAt` in
 *  lib/shared/timeline-wire.ts — this script is .mjs and cannot import the TS
 *  module, so the rule is duplicated. THAT DUPLICATION HAS ALREADY DRIFTED
 *  ONCE: while this held the old prefix-only rule and the module had moved to
 *  a segment index, the script reconstructed Spark's hash as the string
 *  "supply" and every check still passed, because each one compared the
 *  reconstruction against something else derived from the same wrong value.
 *  The envelope has since grown `hx` too (Maple spells the hash bare, with no
 *  `0x`), so keep this in step — but the assertion below, not this sync, is
 *  what makes a drift visible.
 *  The `looksLikeTxHash` assertion below is what makes this file able to fail:
 *  it judges the reconstruction against the SHAPE of a transaction hash, which
 *  no drift in the rule can talk it out of. */
function segmentAt(id, sep, seg) {
  let start = 0;
  for (let i = 0; i < seg; i += 1) {
    const at = id.indexOf(sep, start);
    if (at < 0) return "";
    start = at + 1;
  }
  const end = id.indexOf(sep, start);
  return end < 0 ? id.slice(start) : id.slice(start, end);
}

const looksLikeTxHash = (v) => typeof v === "string" && /^0x[0-9a-f]{64}$/.test(v);

function rehydrate(events, env) {
  return events.map((e) => {
    const { al, w, h, ...rest } = e;
    const spelt = h !== undefined ? undefined : segmentAt(e.id, env.hs, env.hp ?? 0);
    const txHash = h !== undefined ? h : env.hx === 1 && spelt ? `0x${spelt}` : (spelt ?? "");
    const out = {
      ...rest,
      wallet: w !== undefined ? w : env.w,
      txHash,
      etherscanUrl: txHash ? explorerUrl(env.c, txHash) : "",
    };
    if (al !== undefined) out.actionLabel = env.al[al];
    return out;
  });
}

/** Both places a timeline payload puts events. Moonwell Base carries a
 *  `positions` array that holds no events of its own AND a flat `events`
 *  list, so this collects from both rather than choosing between them. */
function eventListsOf(payload) {
  const lists = [];
  if (Array.isArray(payload?.events)) lists.push(payload.events);
  if (Array.isArray(payload?.positions))
    for (const p of payload.positions) if (Array.isArray(p?.events)) lists.push(p.events);
  return lists;
}

// ── the diff ────────────────────────────────────────────────────────────────
const REMOVED_KEYS = new Set(["protocol", "hidden"]);

function diffEvent(oldEv, newEv, explorerFixed, path = "", out = []) {
  const keys = new Set([...Object.keys(oldEv ?? {}), ...Object.keys(newEv ?? {})]);
  for (const k of keys) {
    const p = path ? `${path}.${k}` : k;
    if (!path && REMOVED_KEYS.has(k)) {
      // The two fields nothing read. They must be gone from the new side and
      // present on the old — anything else is not the change we made.
      if (k in newEv) out.push(`${p}: still present on the new side`);
      continue;
    }
    if (!path && k === "etherscanUrl" && explorerFixed) {
      if (!String(newEv[k]).startsWith("https://basescan.org/tx/")) out.push(`${p}: not corrected to basescan`);
      continue;
    }
    const a = oldEv?.[k];
    const b = newEv?.[k];
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      diffEvent(a, b, false, p, out);
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push(`${p}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    }
    if (out.length > 6) return out;
  }
  return out;
}

async function get(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const text = await res.text();
  return { bytes: Buffer.byteLength(text), json: JSON.parse(text) };
}

const rows = [];

for (const f of FIXTURES) {
  if (ONLY.length && !ONLY.includes(f.name)) continue;
  console.log(`\n${f.name}`);
  let lean;
  try {
    lean = await get(BASE + f.path);
  } catch (e) {
    failures++;
    console.log("    FAIL: could not read the lean payload —", e.message);
    continue;
  }

  const env = lean.json.wire;
  assert(env && env.v === 1, "the response carries a wire envelope");
  if (!env) continue;
  assert(env.c === f.chain, `the envelope names chain ${f.chain} (got ${env.c})`);

  const leanLists = eventListsOf(lean.json);
  if (f.grouped) assert(Array.isArray(lean.json.positions), "the grouped payload keeps its positions");
  const wire = leanLists.flat();
  const full = leanLists.flatMap((l) => rehydrate(l, env));
  const n = full.length;
  if (n === 0) {
    console.log("    (no events on this fixture — nothing to compare)");
    continue;
  }

  // 1. self-check
  const host = EXPLORER_HOST[env.c];
  let missing = 0;
  let badHost = 0;
  let badHash = 0;
  const wallets = new Set();
  const ids = new Set();
  let dupIds = 0;
  let firstBadHash = null;
  full.forEach((e, i) => {
    if (e.wallet === undefined || e.txHash === undefined || e.etherscanUrl === undefined) missing++;
    if (e.txHash && !e.etherscanUrl.startsWith(`https://${host}/tx/${e.txHash}`)) badHost++;
    // Only rows whose hash was RECONSTRUCTED are a claim about `id` — a row
    // that kept its own `h` is one the encoder could not reconstruct (Fluid
    // builds `id` from an `event_key` that holds no hash) and is right to
    // spend the bytes rather than guess. What is asserted is the SHAPE: a
    // reconstruction that picks the wrong part of `id` yields "supply" or
    // "0xd6cb…:343", neither of which is a 32-byte hash. Deriving the
    // expectation from the envelope instead would only prove the script
    // agrees with itself.
    if (wire[i].h === undefined && !looksLikeTxHash(e.txHash)) {
      badHash++;
      if (firstBadHash === null) firstBadHash = `${e.id} → ${JSON.stringify(e.txHash)}`;
    }
    // `id` is the React key AND the chronological numbering key, and it was
    // NOT unique on aave-v3/spark until the routes served the MV's event_key:
    // a BalanceTransfer with the wallet on both sides emits two rows from one
    // log. The equality pass below also matches events BY id, so a collision
    // there would have compared a row against its twin and seen no difference.
    if (ids.has(e.id)) dupIds++;
    ids.add(e.id);
    wallets.add(e.wallet);
  });
  assert(missing === 0, `every event carries wallet / txHash / etherscanUrl (${n} events)`);
  assert(badHost === 0, `every explorer link points at ${host}`);
  assert(
    badHash === 0,
    `every reconstructed hash IS a transaction hash${firstBadHash ? ` (first bad: ${firstBadHash})` : ""}`,
  );
  assert(dupIds === 0, `every event id is unique (${ids.size}/${n} distinct)`);

  const carriedHash = wire.filter((e) => e.h !== undefined).length;
  const carriedWallet = wire.filter((e) => e.w !== undefined).length;
  console.log(
    `    · ${n} events, ${lean.bytes} bytes, ${Math.round(lean.bytes / n)} B/event` +
      ` · hash at "${env.hs}"[${env.hp ?? 0}]${env.hx === 1 ? " bare" : ""} · ${carriedHash}/${n} rows keep a hash` +
      ` · ${carriedWallet}/${n} rows keep a wallet (${wallets.size} distinct)` +
      ` · ${env.al.length} distinct labels`,
  );

  // 2. equality against the reference
  let ref = null;
  if (REF) {
    try {
      ref = await get(REF + f.path);
    } catch (e) {
      console.log("    (reference unavailable —", e.message + ")");
    }
  }
  if (ref) {
    const refEvents = eventListsOf(ref.json).flat();
    // Matched by `id` through a BUCKET per id, not a map, and within a bucket
    // by content rather than by position. `id` is not unique: the Aave V3
    // fixture carries 876 pairs of events sharing one, because an aToken
    // BalanceTransfer with the wallet on both sides emits two MV rows at the
    // same (tx_hash, log_index). The backend's ORDER BY does not separate
    // them, so two consecutive fetches of the same fixture return that pair in
    // either order — 654 positions moved between two production reads on
    // 2026-08-28. Both facts predate this format; matching on content is what
    // keeps them from reading as a wire difference.
    const byId = new Map();
    for (const e of refEvents) {
      const q = byId.get(e.id);
      if (q) q.push(e);
      else byId.set(e.id, [e]);
    }
    let compared = 0;
    let swapped = 0;
    const diffs = [];
    for (const e of full) {
      const q = byId.get(e.id);
      if (!q || !q.length) continue;
      compared++;
      let at = 0;
      let d = diffEvent(q[0], e, f.explorerFixed);
      if (d.length && q.length > 1) {
        for (let i = 1; i < q.length; i++) {
          const alt = diffEvent(q[i], e, f.explorerFixed);
          if (!alt.length) {
            at = i;
            d = alt;
            swapped++;
            break;
          }
        }
      }
      q.splice(at, 1);
      if (d.length && diffs.length < 4) diffs.push(`${e.id}: ${d.join("; ")}`);
    }
    if (swapped) console.log(`    · ${swapped} duplicate-id twins arrived in the other order (pre-existing)`);
    assert(compared > 0, `matched ${compared} of ${refEvents.length} reference events by id`);
    assert(
      diffs.length === 0,
      `every matched event is field-for-field identical${diffs.length ? ` — ${diffs[0]}` : ""}`,
    );
    if (refEvents.length !== n) console.log(`    · count moved ${refEvents.length} → ${n} (the index grows)`);
    const saved = ref.bytes - lean.bytes;
    console.log(
      `    · ${ref.bytes} → ${lean.bytes} bytes (${((saved / ref.bytes) * 100).toFixed(1)}% off),` +
        ` ${Math.round(ref.bytes / refEvents.length)} → ${Math.round(lean.bytes / n)} B/event`,
    );
    rows.push({ name: f.name, refBytes: ref.bytes, refN: refEvents.length, bytes: lean.bytes, n });
  } else {
    rows.push({ name: f.name, bytes: lean.bytes, n });
  }
}

if (rows.length) {
  console.log("\n— measured —");
  for (const r of rows) {
    if (r.refBytes)
      console.log(
        `  ${r.name.padEnd(14)} ${String(r.refBytes).padStart(11)} → ${String(r.bytes).padStart(11)} B` +
          `  ${String(Math.round(r.refBytes / r.refN)).padStart(5)} → ${String(Math.round(r.bytes / r.n)).padStart(5)} B/event` +
          `  ${(((r.refBytes - r.bytes) / r.refBytes) * 100).toFixed(1)}%`,
      );
    else console.log(`  ${r.name.padEnd(14)} ${String(r.bytes).padStart(11)} B  ${Math.round(r.bytes / r.n)} B/event`);
  }
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

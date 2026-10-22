#!/usr/bin/env node
// registry-sweep — what the open sources say about every unnamed contract on
// the Aave V3 timelines, in bulk, for a person to rule on once per name.
// ----------------------------------------------------------------------------
// `scripts/registry-candidate.mjs` reads the sources for one address and
// drafts an entry. This script reads the same sources, in the same order (the
// registry's header, rails-ops decision 0053), over a population of addresses
// and writes what each said to CSV. It never writes the registry.
//
//   node scripts/registry-sweep.mjs population <population.csv> <psql output…>
//   node scripts/registry-sweep.mjs <population.csv> <out-dir>
//
// The population comes from `scripts/sql/registry-sweep-population.sql` and
// `registry-sweep-population-base.sql` (their headers say how to run them).
// Their output is one line per chain, address and role,
// `chain,address,role,rows,positions`, and `exclude,chain,address,role` lines
// for the Base exclusions the Base Sieve cannot see (`*` for every role). The
// `population` mode merges those files, ignoring psql's other lines, into one
// row per chain and address:
//   chain,address,roles,rows_caller,rows_counterparty,positions_caller,positions_counterparty
//
// Reads, per address:
//   0. The chain, through the site's address-kind route (keyless; the site
//      reads the chain with its RPC key): account, EIP-7702 delegation, Safe or contract, with
//      `name()` and `symbol()`. Two at a time (four tripped the site's
//      firewall), a failed read retried once.
//      Accounts and delegations stop here: they are people, not registry
//      candidates, and stay in the output with their kind.
//   1. growthepie's public labels file, read once (CC BY 4.0, "Source:
//      growthepie, https://www.growthepie.com"): `name`, `owner_project`,
//      `owner_project_clear`, `usage_category` where the address is among the
//      chain's ten thousand most active contracts. Then the Open Labels
//      Initiative pool (keyless attestation listing, `limit=100`, one call
//      about every 200 ms): the attestations on the address filtered to the
//      chain and not revoked, with `contract_name`, `owner_project`,
//      `is_proxy` and the attesters.
//   2. Etherscan V2 `getsourcecode` (ETHERSCAN_API_KEY in .env.local; the free
//      plan allows 3 calls a second, so three run at once with their starts
//      350 ms apart, and a failed read is retried once) for every contract the pool gave no
//      `contract_name`, and for every contract the pool or the name marks as a
//      proxy; for a proxy, the implementation's `ContractName` too. Safes are
//      not followed to their singleton.
//
// Outputs in <out-dir>:
//   candidates.csv  one row per address: the facts above, each column named
//                   for its source; `verified_name` is the pool's name, else
//                   Etherscan's; `owner` is growthepie's, else the pool's.
//   by-name.csv     one row per chain and name: deployments, rows, owners
//                   seen, the busiest address. The name is the implementation's
//                   where the verified name is a proxy and Etherscan named the
//                   implementation, else the verified name.
//   counts.md       the counts, the top 30 by rows per chain, and the calls.
//   cache.jsonl     every read, keyed by source, chain and address; a re-run
//                   reads from it and calls only for what is missing. Delete it
//                   to read afresh.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHAINS = {
  1: { name: "Ethereum", growthepie: "ethereum" },
  8453: { name: "Base", growthepie: "base" },
  42161: { name: "Arbitrum", growthepie: "arbitrum" },
};

if (process.argv[2] === "population") {
  const [outFile, ...inputs] = process.argv.slice(3);
  const rows = [];
  const excluded = new Set();
  for (const f of inputs)
    for (const l of readFileSync(f, "utf8")
      .split("\n")
      .map((x) => x.trim())) {
      if (/^\d+,0x[0-9a-f]{40},(caller|counterparty),\d+,\d+$/.test(l)) rows.push(l.split(","));
      const ex = /^exclude,(\d+),(0x[0-9a-f]{40}),(caller|counterparty|\*)$/.exec(l);
      if (ex) excluded.add(`${ex[1]},${ex[2]},${ex[3]}`);
    }
  const merged = new Map();
  for (const [chain, address, role, rowCount, positions] of rows) {
    if (excluded.has(`${chain},${address},${role}`) || excluded.has(`${chain},${address},*`)) continue;
    const r = merged.get(`${chain},${address}`) ?? {
      chain: Number(chain),
      address,
      rows_caller: 0,
      rows_counterparty: 0,
      positions_caller: 0,
      positions_counterparty: 0,
    };
    r[`rows_${role}`] = Number(rowCount);
    r[`positions_${role}`] = Number(positions);
    merged.set(`${chain},${address}`, r);
  }
  const all = (r) => r.rows_caller + r.rows_counterparty;
  const body = [...merged.values()]
    .sort((a, b) => a.chain - b.chain || all(b) - all(a))
    .map((r) =>
      [
        r.chain,
        r.address,
        [r.rows_caller && "caller", r.rows_counterparty && "counterparty"].filter(Boolean).join("+"),
        r.rows_caller,
        r.rows_counterparty,
        r.positions_caller,
        r.positions_counterparty,
      ].join(","),
    );
  writeFileSync(
    outFile,
    ["chain,address,roles,rows_caller,rows_counterparty,positions_caller,positions_counterparty", ...body].join("\n") +
      "\n",
  );
  console.log(`${body.length} addresses, ${excluded.size} exclusions read`);
  process.exit(0);
}

const [populationArg, outArg] = process.argv.slice(2);
if (!populationArg || !outArg) {
  console.error("usage: node scripts/registry-sweep.mjs <population.csv> <out-dir>");
  process.exit(2);
}
mkdirSync(outArg, { recursive: true });

function envFile() {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../.env.local", import.meta.url), "utf8")
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
  } catch {
    return {};
  }
}
const env = { ...envFile(), ...process.env };
const site = (env.RAILS_SITE ?? "https://rails.finance").replace(/\/$/, "");

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ── The cache: one JSON line per read, so a stopped run resumes. ────────────
const cachePath = join(outArg, "cache.jsonl");
const cache = new Map();
if (existsSync(cachePath))
  for (const line of readFileSync(cachePath, "utf8").split("\n"))
    if (line) {
      const { key, value } = JSON.parse(line);
      cache.set(key, value);
    }
function remember(key, value) {
  cache.set(key, value);
  appendFileSync(cachePath, JSON.stringify({ key, value }) + "\n");
}

const calls = {
  addressKind: { calls: 0, retries: 0, limited: 0, failed: 0, cached: 0 },
  oli: { calls: 0, failed: 0, cached: 0, truncated: 0 },
  etherscan: { calls: 0, retries: 0, failed: 0, cached: 0 },
  growthepie: { calls: 0 },
};

// ── The population. ─────────────────────────────────────────────────────────
const [head, ...lines] = readFileSync(populationArg, "utf8").trim().split("\n");
const cols = head.split(",");
const population = lines.map((l) => {
  const v = l.split(",");
  const r = Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  for (const c of ["rows_caller", "rows_counterparty", "positions_caller", "positions_counterparty"])
    r[c] = Number(r[c] ?? 0);
  r.chain = Number(r.chain);
  r.address = r.address.toLowerCase();
  if (!CHAINS[r.chain]) throw new Error(`unknown chain ${r.chain} on ${r.address}`);
  return r;
});
console.log(`${population.length} addresses`);

// ── 0. The chain (address-kind), four at a time. ───────────────────────────
// The site sits behind Vercel's firewall, which answers 429 to a burst. A 429
// pauses every worker for a minute and the read is made again (up to ten
// times); it is the firewall's answer, not a failed read.
let addressKindPausedUntil = 0;
async function addressKind(chainId, address) {
  const key = `kind:${chainId}:${address}`;
  if (cache.has(key)) {
    calls.addressKind.cached++;
    return cache.get(key);
  }
  const url = `${site}/api/chain/address-kind?address=${address}&chain=${chainId}`;
  let value;
  let failures = 0;
  for (let limited = 0; !value && failures < 2 && limited < 10; ) {
    if (Date.now() < addressKindPausedUntil) await sleep(addressKindPausedUntil - Date.now());
    calls.addressKind.calls++;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 429) {
        limited++;
        calls.addressKind.limited++;
        addressKindPausedUntil = Math.max(addressKindPausedUntil, Date.now() + 60_000);
        continue;
      }
      if (!res.ok) throw new Error(`${res.status}`);
      const k = await res.json();
      if (k?.kind) value = { kind: k.kind, name: k.name ?? null, symbol: k.symbol ?? null };
      else throw new Error("no kind");
    } catch {
      if (++failures < 2) {
        calls.addressKind.retries++;
        await sleep(1000);
      }
    }
  }
  if (!value) {
    calls.addressKind.failed++;
    return { kind: "failed", name: null, symbol: null };
  }
  remember(key, value);
  return value;
}

async function pool(items, size, work) {
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const item = items[next++];
        await work(item);
        if (++done % 500 === 0) console.log(`  ${done}/${items.length}`);
      }
    }),
  );
}

console.log("address-kind…");
await pool(population, 2, async (r) => {
  Object.assign(r, { chain_kind: await addressKind(r.chain, r.address) });
});
const named = population.filter((r) => r.chain_kind.kind === "contract" || r.chain_kind.kind === "safe");

// ── 1a. growthepie's labels file, one call. ─────────────────────────────────
console.log("growthepie labels…");
calls.growthepie.calls++;
const gtpFile = await getJson("https://api.growthepie.com/v1/labels/full.json");
const gtpTypes = gtpFile.data.types;
const gcol = (name) => gtpTypes.indexOf(name);
const gtp = new Map();
for (const x of gtpFile.data.data)
  gtp.set(`${x[gcol("origin_key")]}:${String(x[gcol("address")]).toLowerCase()}`, {
    name: x[gcol("name")] || null,
    ownerProject: x[gcol("owner_project")] || null,
    ownerProjectClear: x[gcol("owner_project_clear")] || null,
    usageCategory: x[gcol("usage_category")] || null,
  });

// ── 1b. The OLI pool, one call about every 200 ms. ──────────────────────────
async function oli(chainId, address) {
  const key = `oli:${address}`;
  let r = cache.get(key);
  if (r) calls.oli.cached++;
  else {
    calls.oli.calls++;
    try {
      r = await getJson(`https://api.openlabelsinitiative.org/attestations?recipient=${address}&limit=100`);
    } catch {
      await sleep(1000);
      calls.oli.calls++;
      try {
        r = await getJson(`https://api.openlabelsinitiative.org/attestations?recipient=${address}&limit=100`);
      } catch {
        calls.oli.failed++;
        return null;
      }
    }
    // Keep only what the sweep reads; the listing is large.
    r = {
      count: r.count ?? (r.attestations ?? []).length,
      attestations: (r.attestations ?? []).map((a) => ({
        chain_id: a.chain_id,
        revoked: a.revoked,
        attester: a.attester,
        time: a.time,
        tags: {
          contract_name: a.tags_json?.contract_name,
          owner_project: a.tags_json?.owner_project,
          is_proxy: a.tags_json?.is_proxy,
        },
      })),
    };
    remember(key, r);
    await sleep(200);
  }
  if (r.count > 100) calls.oli.truncated++;
  const here = r.attestations
    .filter((a) => a.chain_id === `eip155:${chainId}` && !a.revoked)
    .sort((a, b) => String(b.time).localeCompare(String(a.time)));
  const uniq = (xs) => [...new Set(xs.filter((x) => x !== undefined && x !== null && x !== ""))];
  return {
    names: uniq(here.map((a) => a.tags.contract_name)),
    owners: uniq(here.map((a) => a.tags.owner_project)),
    isProxy: uniq(here.map((a) => a.tags.is_proxy)).map(String),
    attesters: uniq(here.map((a) => a.attester)),
  };
}

console.log(`OLI pool for ${named.length} contracts and Safes…`);
let n = 0;
for (const r of named) {
  r.gtp = gtp.get(`${CHAINS[r.chain].growthepie}:${r.address}`) ?? null;
  r.oli = await oli(r.chain, r.address);
  if (++n % 500 === 0) console.log(`  ${n}/${named.length}`);
}

// ── 2. Etherscan V2, 3 calls a second at most. ─────────────────────────────
// Three reads in flight, their starts at least 350 ms apart: under the free
// plan's 3 calls a second whatever each call's latency.
let etherscanNext = 0;
async function etherscanTurn() {
  const now = Date.now();
  const at = Math.max(now, etherscanNext);
  etherscanNext = at + 350;
  await sleep(at - now);
}
async function etherscan(chainId, address) {
  const key = `etherscan:${chainId}:${address}`;
  if (cache.has(key)) {
    calls.etherscan.cached++;
    return cache.get(key);
  }
  if (!env.ETHERSCAN_API_KEY) return null;
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${env.ETHERSCAN_API_KEY}`;
  let r = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) {
      calls.etherscan.retries++;
      await sleep(1500);
    }
    await etherscanTurn();
    calls.etherscan.calls++;
    try {
      r = await getJson(url);
    } catch {
      r = null;
    }
    if (r && Array.isArray(r.result)) break;
  }
  const row = r && Array.isArray(r.result) ? r.result[0] : null;
  if (!row) {
    calls.etherscan.failed++;
    return null;
  }
  const value = {
    contractName: row.ContractName || null,
    proxy: row.Proxy === "1",
    implementation: row.Implementation ? row.Implementation.toLowerCase() : null,
  };
  remember(key, value);
  return value;
}

const looksProxy = (r) =>
  r.oli?.isProxy.includes("true") || r.oli?.isProxy.includes("1") || /proxy/i.test(r.oli?.names[0] ?? "");
const toEtherscan = named.filter((r) => r.chain_kind.kind === "contract" && (!r.oli?.names.length || looksProxy(r)));
console.log(`Etherscan for ${toEtherscan.length} contracts…`);
await pool(toEtherscan, 3, async (r) => {
  r.etherscan = await etherscan(r.chain, r.address);
  if (r.etherscan?.proxy && r.etherscan.implementation)
    r.etherscanImpl = await etherscan(r.chain, r.etherscan.implementation);
});

// ── Output. ─────────────────────────────────────────────────────────────────
const csv = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const CANDIDATE_COLUMNS = [
  "chain",
  "address",
  "roles",
  "rows_caller",
  "rows_counterparty",
  "positions_caller",
  "positions_counterparty",
  "kind",
  "chain_name",
  "chain_symbol",
  "gtp_owner",
  "gtp_owner_clear",
  "gtp_name",
  "gtp_usage",
  "oli_contract_name",
  "oli_owner",
  "oli_is_proxy",
  "oli_attesters",
  "etherscan_contract_name",
  "etherscan_proxy",
  "etherscan_implementation",
  "etherscan_implementation_name",
  "verified_name",
  "owner",
  "rule_name",
];
const out = population.map((r) => {
  const oliName = r.oli?.names.join("|") || null;
  const verified = r.oli?.names[0] ?? r.etherscan?.contractName ?? null;
  const implName = r.etherscanImpl?.contractName ?? null;
  return {
    chain: r.chain,
    address: r.address,
    roles: r.roles,
    rows_caller: r.rows_caller,
    rows_counterparty: r.rows_counterparty,
    positions_caller: r.positions_caller,
    positions_counterparty: r.positions_counterparty,
    kind: r.chain_kind.kind,
    chain_name: r.chain_kind.name,
    chain_symbol: r.chain_kind.symbol,
    gtp_owner: r.gtp?.ownerProject ?? null,
    gtp_owner_clear: r.gtp?.ownerProjectClear ?? null,
    gtp_name: r.gtp?.name ?? null,
    gtp_usage: r.gtp?.usageCategory ?? null,
    oli_contract_name: oliName,
    oli_owner: r.oli?.owners.join("|") || null,
    oli_is_proxy: r.oli?.isProxy.join("|") || null,
    oli_attesters: r.oli?.attesters.join("|") || null,
    etherscan_contract_name: r.etherscan?.contractName ?? null,
    etherscan_proxy: r.etherscan ? (r.etherscan.proxy ? "1" : "0") : null,
    etherscan_implementation: r.etherscan?.implementation ?? null,
    etherscan_implementation_name: implName,
    verified_name: verified,
    owner: r.gtp?.ownerProjectClear ?? r.oli?.owners[0] ?? null,
    rule_name: implName ?? verified,
  };
});
writeFileSync(
  join(outArg, "candidates.csv"),
  [CANDIDATE_COLUMNS.join(","), ...out.map((o) => CANDIDATE_COLUMNS.map((c) => csv(o[c])).join(","))].join("\n") + "\n",
);

const totalRows = (o) => o.rows_caller + o.rows_counterparty;
const byName = new Map();
for (const o of out)
  if (o.rule_name) {
    const k = `${o.chain}\t${o.rule_name}`;
    const g = byName.get(k) ?? {
      chain: o.chain,
      name: o.rule_name,
      deployments: 0,
      rows: 0,
      owners: new Set(),
      proxied: 0,
      verifiedNames: new Set(),
      busiest: null,
    };
    g.deployments++;
    g.rows += totalRows(o);
    if (o.owner) g.owners.add(o.owner);
    if (o.etherscan_implementation_name) g.proxied++;
    if (o.verified_name) g.verifiedNames.add(o.verified_name);
    if (!g.busiest || totalRows(o) > totalRows(g.busiest)) g.busiest = o;
    byName.set(k, g);
  }
const BY_NAME_COLUMNS = [
  "chain",
  "name",
  "deployments",
  "total_rows",
  "owners_seen",
  "behind_proxy",
  "verified_names",
  "busiest_address",
  "busiest_rows",
];
writeFileSync(
  join(outArg, "by-name.csv"),
  [
    BY_NAME_COLUMNS.join(","),
    ...[...byName.values()]
      .sort((a, b) => a.chain - b.chain || b.rows - a.rows)
      .map((g) =>
        [
          g.chain,
          g.name,
          g.deployments,
          g.rows,
          [...g.owners].join("|"),
          g.proxied,
          [...g.verifiedNames].join("|"),
          g.busiest.address,
          totalRows(g.busiest),
        ]
          .map(csv)
          .join(","),
      ),
  ].join("\n") + "\n",
);

// ── counts.md ───────────────────────────────────────────────────────────────
const md = [];
const fmt = (x) => x.toLocaleString("en-US");
md.push("## Population by chain and role\n");
md.push("| Chain | Role | Addresses | Rows | Accounts | Delegated | Safes | Contracts | Failed reads |");
md.push("|---|---|--:|--:|--:|--:|--:|--:|--:|");
for (const chainId of Object.keys(CHAINS).map(Number))
  for (const role of ["caller", "counterparty"]) {
    const xs = out.filter((o) => o.chain === chainId && o[`rows_${role}`] > 0);
    const k = (kind) => fmt(xs.filter((o) => o.kind === kind).length);
    md.push(
      `| ${CHAINS[chainId].name} | ${role} | ${fmt(xs.length)} | ${fmt(xs.reduce((s, o) => s + o[`rows_${role}`], 0))} | ${k("account")} | ${k("delegated")} | ${k("safe")} | ${k("contract")} | ${k("failed")} |`,
    );
  }
md.push("\n## What the sources gave the contracts and Safes\n");
md.push(
  "| Chain | Contracts + Safes | Owner from growthepie | Owner from the pool only | Verified name from the pool | Verified name from Etherscan only | Nothing |",
);
md.push("|---|--:|--:|--:|--:|--:|--:|");
for (const chainId of Object.keys(CHAINS).map(Number)) {
  const xs = out.filter((o) => o.chain === chainId && (o.kind === "contract" || o.kind === "safe"));
  const c = (f) => fmt(xs.filter(f).length);
  md.push(
    `| ${CHAINS[chainId].name} | ${fmt(xs.length)} | ${c((o) => o.gtp_owner_clear)} | ${c((o) => !o.gtp_owner_clear && o.oli_owner)} | ${c((o) => o.oli_contract_name)} | ${c((o) => !o.oli_contract_name && o.etherscan_contract_name)} | ${c((o) => !o.owner && !o.verified_name && !o.gtp_name)} |`,
  );
}
for (const chainId of Object.keys(CHAINS).map(Number)) {
  md.push(`\n## Top 30 by rows, ${CHAINS[chainId].name}\n`);
  md.push("| Address | Roles | Rows | Kind | Owner | Verified name | Implementation | growthepie name | name() |");
  md.push("|---|---|--:|---|---|---|---|---|---|");
  for (const o of out
    .filter((o) => o.chain === chainId)
    .sort((a, b) => totalRows(b) - totalRows(a))
    .slice(0, 30))
    md.push(
      `| \`${o.address}\` | ${o.roles} | ${fmt(totalRows(o))} | ${o.kind} | ${o.owner ?? ""} | ${o.verified_name ?? ""} | ${o.etherscan_implementation_name ?? ""} | ${o.gtp_name ?? ""} | ${o.chain_name ?? ""} |`,
    );
}
md.push("\n## Calls\n");
md.push("| Source | Calls | Retries | Failed | From cache | Note |");
md.push("|---|--:|--:|--:|--:|---|");
const a = calls.addressKind;
md.push(
  `| address-kind (site) | ${fmt(a.calls)} | ${fmt(a.retries)} | ${fmt(a.failed)} | ${fmt(a.cached)} | ${fmt(a.limited)} answers 429 from Vercel's firewall, each followed by a minute's pause |`,
);
const o = calls.oli;
md.push(
  `| OLI attestations | ${fmt(o.calls)} | | ${fmt(o.failed)} | ${fmt(o.cached)} | ${fmt(o.truncated)} addresses with more than 100 attestations (listing cut at 100) |`,
);
const e = calls.etherscan;
md.push(`| Etherscan V2 | ${fmt(e.calls)} | ${fmt(e.retries)} | ${fmt(e.failed)} | ${fmt(e.cached)} | |`);
md.push(`| growthepie labels file | ${calls.growthepie.calls} | | | | |`);
writeFileSync(join(outArg, "counts.md"), md.join("\n") + "\n");
console.log(md.join("\n"));

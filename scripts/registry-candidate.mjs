#!/usr/bin/env node
// registry-candidate — what the open sources say about one address on one
// chain, drafted as a `lib/shared/known-infrastructure.ts` entry for review.
// ----------------------------------------------------------------------------
// The registry's rule (its header): an entry is a claim about the chain and
// carries evidence, or it does not exist. This script gathers the evidence;
// it never writes the entry. A person still chooses the kind and the role
// sentence, which is where the timeline meaning lives (a `gateway` turns a
// transfer into a withdrawal). rails-ops TO-DO-ui-jobs 423.
//
//   node scripts/registry-candidate.mjs <chainId> <address>
//   node scripts/registry-candidate.mjs 8453 0xd7f1dd5d49206349cae8b585fcb0ce3d96f1696f
//   GROWTHEPIE_FILE=/path/full.json node scripts/registry-candidate.mjs …   (a saved labels file)
//
// Sources, in the order the registry consults them (its header), each named in
// the output with what it answered:
//   1. growthepie's public labels file (keyless, CC BY 4.0, "Source:
//      growthepie, https://www.growthepie.com"): the ten thousand most active
//      contracts on its chains with the owning project, a name and a usage
//      category. A busy contract is here with a curated name; a quiet one is
//      not. Then the Open Labels Initiative pool growthepie runs (keyless
//      attestation listing): every attestation on the address, filtered to
//      the chain, with its attester. The Sourcify-backed attestations carry
//      `contract_name`; a project's own attestation may carry `owner_project`.
//      The keyed endpoints (bulk, search by tag, trusted labels) are not used.
//      What these two say is the draft's GROWTHEPIE_LABELS row.
//   2. The fallback, where growthepie has no label or names no owner: the
//      verified source name through the Etherscan V2 API for the chain
//      (ETHERSCAN_API_KEY in .env.local; skipped without it), with whether it
//      is a proxy and what it points to; and the chain, through the site's own
//      address-kind route (keyless): code at head, a Safe, an EIP-7702
//      delegation, or a contract with its `name()` and `symbol()`. RAILS_SITE
//      overrides the host (a local server).
//
// Explorer name tags ("Zerion: Router") are not in any open source read here:
// Etherscan serves them on a paid plan only. Where one is known, it goes in
// the evidence note by hand, as the two entries of 2026-10-21 do.

import { readFileSync } from "node:fs";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CHAINS = {
  1: { constant: "MAINNET_CHAIN_ID", name: "Ethereum", growthepie: "ethereum" },
  8453: { constant: "BASE_CHAIN_ID", name: "Base", growthepie: "base" },
  42161: { constant: "ARBITRUM_CHAIN_ID", name: "Arbitrum", growthepie: "arbitrum" },
};

const [chainArg, addressArg] = process.argv.slice(2);
const chainId = Number(chainArg);
if (!CHAINS[chainId] || !ADDRESS.test(addressArg ?? "")) {
  console.error("usage: node scripts/registry-candidate.mjs <1|8453|42161> <0x address>");
  process.exit(2);
}
const chain = CHAINS[chainId];
const address = addressArg.toLowerCase();

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

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/** Each source as {source, ok, lines[], facts{}}; a failed read is reported, never hidden. */
async function readChain() {
  const facts = {};
  const lines = [];
  const k = await getJson(`${site}/api/chain/address-kind?address=${address}&chain=${chainId}`);
  if (!k) {
    lines.push("the read failed on the site");
    return { source: "chain (address-kind)", ok: false, lines, facts };
  }
  facts.kind = k.kind;
  if (k.kind === "account") lines.push(`no code at block ${k.block}: an account, not a contract`);
  if (k.kind === "delegated") lines.push(`EIP-7702 delegation to ${k.delegate} at block ${k.block}`);
  if (k.kind === "safe") lines.push(`a Safe, singleton version ${k.version}, at block ${k.block}`);
  if (k.kind === "contract") {
    facts.name = k.name;
    facts.symbol = k.symbol;
    lines.push(
      `a contract at block ${k.block}; name() ${k.name ? JSON.stringify(k.name) : "not answered"}, symbol() ${
        k.symbol ? JSON.stringify(k.symbol) : "not answered"
      }`,
    );
  }
  return { source: "chain (address-kind)", ok: true, lines, facts };
}

async function readEtherscan() {
  const key = env.ETHERSCAN_API_KEY;
  if (!key)
    return {
      source: "Etherscan V2 (verified source)",
      ok: false,
      lines: ["ETHERSCAN_API_KEY not set; skipped"],
      facts: {},
    };
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${key}`;
  let r = await getJson(url);
  if (typeof r.result === "string" && /rate limit/i.test(r.result)) {
    // The free plan allows a few calls a second; runs back to back trip it.
    await new Promise((done) => setTimeout(done, 1500));
    r = await getJson(url);
  }
  const row = Array.isArray(r.result) ? r.result[0] : null;
  if (!row || typeof r.result === "string")
    return { source: "Etherscan V2 (verified source)", ok: false, lines: [String(r.result ?? r.message)], facts: {} };
  const facts = {
    contractName: row.ContractName || null,
    proxy: row.Proxy === "1",
    implementation: row.Implementation || null,
  };
  const lines = [];
  if (!facts.contractName) lines.push("source not verified on Etherscan");
  else
    lines.push(
      `verified source name \`${facts.contractName}\`${facts.proxy ? `, a proxy to ${facts.implementation}` : ", not a proxy"}`,
    );
  return { source: "Etherscan V2 (verified source)", ok: true, lines, facts };
}

async function readGrowthepie() {
  // GROWTHEPIE_FILE names a local copy of the labels file, so a batch of
  // addresses reads one download.
  const r = env.GROWTHEPIE_FILE
    ? JSON.parse(readFileSync(env.GROWTHEPIE_FILE, "utf8"))
    : await getJson("https://api.growthepie.com/v1/labels/full.json");
  const types = r.data.types;
  const col = (name) => types.indexOf(name);
  const row = r.data.data.find(
    (x) => String(x[col("address")]).toLowerCase() === address && x[col("origin_key")] === chain.growthepie,
  );
  if (!row)
    return {
      source: "growthepie labels (top 10,000 by activity)",
      ok: true,
      lines: ["not in the file: not among the chain's most active contracts"],
      facts: {},
    };
  const facts = {
    name: row[col("name")] || null,
    ownerProject: row[col("owner_project")] || null,
    ownerProjectClear: row[col("owner_project_clear")] || null,
    usageCategory: row[col("usage_category")] || null,
    deployer: row[col("deployer_address")] || null,
    deploymentTx: row[col("deployment_tx")] || null,
  };
  const lines = [
    `name ${JSON.stringify(facts.name)}, owner project ${facts.ownerProjectClear ?? "-"} (${facts.ownerProject ?? "-"}), usage ${facts.usageCategory ?? "-"}`,
    `deployed by ${facts.deployer ?? "-"} in ${facts.deploymentTx ?? "-"}`,
  ];
  return { source: "growthepie labels (top 10,000 by activity)", ok: true, lines, facts };
}

async function readOli() {
  const r = await getJson(`https://api.openlabelsinitiative.org/attestations?recipient=${address}&limit=100`);
  const all = r.attestations ?? [];
  const here = all.filter((a) => a.chain_id === `eip155:${chainId}` && !a.revoked);
  const facts = {
    attestations: here.length,
    onOtherChains: all.length - here.length,
    names: new Set(),
    owners: new Set(),
    usage: new Set(),
    attesters: new Set(),
  };
  const lines = [];
  for (const a of here) {
    const t = a.tags_json ?? {};
    facts.attesters.add(a.attester);
    if (t.contract_name) facts.names.add(t.contract_name);
    if (t.owner_project) facts.owners.add(t.owner_project);
    if (t.usage_category) facts.usage.add(t.usage_category);
    const said = Object.entries(t)
      .filter(([k]) =>
        ["contract_name", "owner_project", "usage_category", "is_proxy", "source_code_verified", "_source"].includes(k),
      )
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(" ");
    lines.push(
      `${a.time.slice(0, 10)} by ${a.attester}${a.is_offchain ? " (off chain)" : ""}: ${said || "no naming tag"}`,
    );
  }
  if (!here.length) lines.push(`no attestation on this chain${all.length ? ` (${all.length} on other chains)` : ""}`);
  return { source: "Open Labels Initiative (attestations)", ok: true, lines, facts };
}

async function readRegistry() {
  const text = readFileSync(new URL("../lib/shared/known-infrastructure.ts", import.meta.url), "utf8");
  const line = text.split("\n").find((l) => l.toLowerCase().includes(address) && l.includes(chain.constant));
  return {
    source: "the registry",
    ok: true,
    lines: [line ? `already entered: ${line.trim()}` : "not entered"],
    facts: { entered: !!line },
  };
}

const settled = await Promise.allSettled([readGrowthepie(), readOli(), readEtherscan(), readChain(), readRegistry()]);
const results = settled.map((s, i) =>
  s.status === "fulfilled"
    ? s.value
    : {
        source: [
          "growthepie labels",
          "Open Labels Initiative",
          "Etherscan V2 (verified source)",
          "chain (address-kind)",
          "the registry",
        ][i],
        ok: false,
        lines: [`read failed: ${s.reason?.message ?? s.reason}`],
        facts: {},
      },
);

console.log(`${address} on ${chain.name} (${chainId})\n`);
for (const r of results) {
  console.log(`${r.ok ? "·" : "✗"} ${r.source}`);
  for (const l of r.lines) console.log(`    ${l}`);
}

const [gtpR, oliR, ethR, chainR, regR] = results;
// growthepie first; the explorer and the chain where it is silent.
const oliName = [...(oliR.facts.names ?? [])][0] ?? null;
const verified = oliName ?? ethR.facts.contractName ?? null;
const owner = gtpR.facts.ownerProjectClear ?? [...(oliR.facts.owners ?? [])][0] ?? null;
const tokenName = chainR.facts.name ?? null;
const today = new Date().toISOString().slice(0, 10);

console.log("\nDraft (the kind and the role are yours to choose; the evidence line goes in the file's header):");
if (regR.facts.entered) {
  console.log("    already in the registry; nothing to draft");
} else if (chainR.facts.kind && chainR.facts.kind !== "contract") {
  console.log(`    not a contract (${chainR.facts.kind}); the registry names contracts only`);
} else {
  const display = owner && verified ? `${owner} ${verified.toLowerCase()}` : (tokenName ?? verified ?? "<name>");
  console.log(
    `    [${chain.constant}, "${address}", { name: "${display}", kind: "<router|gateway|adapter|settlement|multicall|amm-pool|lending-pool|distributor>", contractName: "${verified ?? "<verified source name>"}", role: "<what it does, completing 'The recipient is …'>" }],`,
  );
  if (gtpR.facts.ownerProjectClear || oliName)
    console.log(
      `    GROWTHEPIE_LABELS row: [${chain.constant}, "${address}", ${JSON.stringify(gtpR.facts.ownerProjectClear ?? null)}, ${JSON.stringify(oliName)}],  (GROWTHEPIE_READ ${today})`,
    );
  if (ethR.facts.contractName && oliName && ethR.facts.contractName !== oliName)
    console.log(
      `    the OLI name \`${oliName}\` and Etherscan's \`${ethR.facts.contractName}\` differ; the build refuses a row whose name differs from the entry's, so settle which is the source name`,
    );
  const ev = [];
  if (gtpR.facts.ownerProject)
    ev.push(
      `growthepie's labels file has it as ${gtpR.facts.ownerProjectClear} (${gtpR.facts.ownerProject}), usage ${gtpR.facts.usageCategory ?? "-"}`,
    );
  if (oliR.facts.names?.size)
    ev.push(
      `the OLI pool's attestation(s) by ${[...oliR.facts.attesters].join(", ")} name it \`${[...oliR.facts.names].join("`, `")}\``,
    );
  if (ethR.facts.contractName)
    ev.push(
      `Etherscan V2 for chain ${chainId} gives the verified source name \`${ethR.facts.contractName}\`${ethR.facts.proxy ? ` (a proxy to ${ethR.facts.implementation})` : ""}`,
    );
  if (tokenName)
    ev.push(
      `it answers name() ${JSON.stringify(tokenName)}${chainR.facts.symbol ? ` and symbol() ${JSON.stringify(chainR.facts.symbol)}` : ""}`,
    );
  console.log(
    `    evidence (${today}): ${ev.length ? ev.join("; ") : "none of the open sources names it; the protocol's own publication or an explorer read is needed"}`,
  );
  if (!owner)
    console.log(
      "    the owning project is not stated by growthepie or the pool: name it from the protocol's own publication or the explorer's label (the fallback)",
    );
}

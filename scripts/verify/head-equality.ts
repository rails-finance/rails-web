// head-equality — rails-server's lender head answers against the web's own read.
// ----------------------------------------------------------------------------
// Not a verifier (run-all lists it as a skip). For each fixture it asks
// rails-server's route (`/api/at-block/compound/position`,
// `/api/at-block/morpho/position`, `POST /api/at-block/morpho/wallet`), runs the
// web's head reader over the answer (lib/sources/chain/replay-client.ts), runs
// the same reader on the web's RPC pinned at the answer's block, and compares
// the two byte for byte (the `head` stamp aside). rails-ops decisions/0056 step 3.
//
//   EQ_FIXTURES=fixtures.txt EQ_OUT=out.tsv npx tsx --env-file=.env.local scripts/verify/head-equality.ts
//
// A fixture line is `kind|market|wallet`, kind one of c3eth, c3base, c3arb, v2,
// mweth, mwbase, meth, mbase, marb (market: a Comet key for c3eth, a Morpho
// market id for meth). EQ_API points at another api (no token) instead of
// RAILS_API_URL; EQ_ONLY=kind,kind narrows the run. One fixture at a time,
// 600 ms apart.

import { readFileSync, appendFileSync } from "node:fs";
import { replayClient, pinnedClient, type ServedCalls } from "@/lib/sources/chain/replay-client";
import { chainClient } from "@/lib/sources/chain/rpc";
import { loadCompoundWalletFromChain, loadCompoundPositionFromChain } from "@/lib/sources/chain/compound-position";
import { loadCompoundV2PositionFromChain } from "@/lib/sources/chain/compound-v2-position";
import { loadMoonwellPositionFromChain } from "@/lib/sources/chain/moonwell-position";
import { loadMorphoPositionFromChain } from "@/lib/sources/chain/morpho-position";
import { loadMorphoWalletFromChain } from "@/lib/sources/chain/morpho-wallet";
import { loadMorphoArbitrumWallet } from "@/lib/sources/chain/morpho-arbitrum-wallet";
import { COMPOUND_DEPLOYMENT } from "@/lib/compound/asset-catalog";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";
import { MOONWELL_DEPLOYMENT } from "@/lib/moonwell/asset-catalog";
import { MOONWELL_BASE_DEPLOYMENT } from "@/lib/moonwell-base/asset-catalog";
import {
  MORPHO_DEPLOYMENT,
  MORPHO_BASE_DEPLOYMENT,
  MORPHO_ARBITRUM_DEPLOYMENT,
} from "@/lib/sources/chain/morpho-deployments";
import type { PublicClient } from "viem";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";

const API = process.env.EQ_API ?? process.env.RAILS_API_URL!;
const TOKEN = process.env.EQ_TOKEN;
const OUT = process.env.EQ_OUT!;
const ONLY = process.env.EQ_ONLY?.split(",");

type Fx = { kind: string; market: string; wallet: string };
const fixtures: Fx[] = readFileSync(process.env.EQ_FIXTURES!, "utf8")
  .split("\n")
  .map((l) => l.split("|").map((x) => x.trim()))
  .filter((p) => p.length >= 3 && /^0x[0-9a-f]{40}$/.test(p[2]))
  .map(([kind, market, wallet]) => ({ kind, market, wallet }))
  .filter((f) => !ONLY || ONLY.includes(f.kind));

const headers: Record<string, string> = TOKEN
  ? { authorization: `Bearer ${TOKEN}` }
  : process.env.EQ_API
    ? {}
    : ((createAuthFetchOptions().headers ?? {}) as Record<string, string>);
async function served(path: string, body?: unknown): Promise<ServedCalls> {
  const res = await fetch(
    `${API}${path}`,
    body
      ? { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) }
      : { headers },
  );
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as ServedCalls;
}

const strip = (x: unknown) => JSON.stringify(x, (k, v) => (k === "head" ? undefined : v));

async function one(f: Fx): Promise<{ ok: boolean; why?: string; block?: number; held?: number }> {
  let s: ServedCalls;
  let run: (c: PublicClient) => Promise<{ chainStale: boolean }>;
  let chain: number;
  const w = f.wallet;
  switch (f.kind) {
    case "c3eth":
      s = await served(`/api/at-block/compound/position?family=compound-v3&deployment=ethereum&wallet=${w}`);
      run = (c) => loadCompoundPositionFromChain(w, f.market, COMPOUND_DEPLOYMENT, c);
      chain = 1;
      break;
    case "c3base":
      s = await served(`/api/at-block/compound/position?family=compound-v3&deployment=base&wallet=${w}`);
      run = (c) => loadCompoundWalletFromChain(w, COMPOUND_BASE_DEPLOYMENT, { reader: c });
      chain = 8453;
      break;
    case "c3arb":
      s = await served(`/api/at-block/compound/position?family=compound-v3&deployment=arbitrum&wallet=${w}`);
      run = (c) => loadCompoundWalletFromChain(w, COMPOUND_ARBITRUM_DEPLOYMENT, { reader: c });
      chain = 42161;
      break;
    case "v2":
      s = await served(`/api/at-block/compound/position?family=compound-v2&deployment=ethereum&wallet=${w}`);
      run = (c) => loadCompoundV2PositionFromChain(w, c);
      chain = 1;
      break;
    case "mweth":
      s = await served(`/api/at-block/compound/position?family=moonwell&deployment=ethereum&wallet=${w}`);
      run = (c) => loadMoonwellPositionFromChain(w, MOONWELL_DEPLOYMENT, c);
      chain = 1;
      break;
    case "mwbase":
      s = await served(`/api/at-block/compound/position?family=moonwell&deployment=base&wallet=${w}`);
      run = (c) => loadMoonwellPositionFromChain(w, MOONWELL_BASE_DEPLOYMENT, c);
      chain = 8453;
      break;
    case "meth":
      s = await served(`/api/at-block/morpho/position?deployment=ethereum&market=0x${f.market}&wallet=${w}`);
      run = (c) => loadMorphoPositionFromChain(f.market, w, MORPHO_DEPLOYMENT, undefined, c);
      chain = 1;
      break;
    case "mbase":
      s = await served(`/api/at-block/morpho/wallet`, { deployment: "base", wallet: w });
      run = (c) => loadMorphoWalletFromChain(w, MORPHO_BASE_DEPLOYMENT, c);
      chain = 8453;
      break;
    case "marb": {
      const ids = MORPHO_ARBITRUM_DEPLOYMENT.markets.map((m) => m.id.toLowerCase());
      s = await served(`/api/at-block/morpho/wallet`, { deployment: "arbitrum", wallet: w, ids });
      run = (c) => loadMorphoArbitrumWallet(w, [], c);
      chain = 42161;
      break;
    }
    default:
      return { ok: false, why: `unknown ${f.kind}` };
  }
  const rep = replayClient(s);
  const a = await run(rep.client);
  if (rep.missed()) return { ok: false, why: "replay missed a call", block: s.blockNumber };
  if (a.chainStale) return { ok: false, why: "replay answered stale", block: s.blockNumber };
  const b = await run(pinnedClient(chainClient(chain as 1), s.blockNumber));
  if (b.chainStale) return { ok: false, why: "pinned read stale", block: s.blockNumber };
  const held = (a as { positions?: unknown[] }).positions?.length;
  return strip(a) === strip(b)
    ? { ok: true, block: s.blockNumber, held }
    : { ok: false, why: `differs\nA ${strip(a).slice(0, 3000)}\nB ${strip(b).slice(0, 3000)}`, block: s.blockNumber };
}

(async () => {
  const tally: Record<string, { ok: number; bad: number }> = {};
  for (const f of fixtures) {
    let r: Awaited<ReturnType<typeof one>>;
    try {
      r = await one(f);
    } catch (e) {
      r = { ok: false, why: `threw ${(e as Error).message}` };
    }
    tally[f.kind] ??= { ok: 0, bad: 0 };
    tally[f.kind][r.ok ? "ok" : "bad"]++;
    appendFileSync(
      OUT,
      `${f.kind}\t${f.market}\t${f.wallet}\t${r.ok ? "EQUAL" : "FAIL"}\t${r.block ?? ""}\t${r.held ?? ""}\t${r.why ?? ""}\n`,
    );
    await new Promise((res) => setTimeout(res, 600));
  }
  console.log(JSON.stringify(tally));
})();

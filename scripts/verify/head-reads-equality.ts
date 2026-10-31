// head-reads-equality — the single-page families' head readers through
// rails-server against the same readers on the chain, at one block.
// ----------------------------------------------------------------------------
// Not a verifier (run-all lists it as a skip). Two runs, one process each so
// no in-process cache (LlamaLend's discovery, f(x)'s terms, token names) is
// shared between the sides:
//
//   EQ_MODE=server EQ_FIXTURES=fixtures.txt EQ_OUT=server.jsonl \
//     npx tsx --env-file=.env.local scripts/verify/head-reads-equality.ts
//   EQ_MODE=chain  EQ_IN=server.jsonl EQ_OUT=chain.jsonl EQ_RPC=https://… \
//     npx tsx --env-file=.env.local scripts/verify/head-reads-equality.ts
//
// The server run reads each fixture through `headReadsClient` (rails-server's
// /api/at-block/head/block and /reads) and records the block rails-server
// named. The chain run reads it again with every call pinned at that block on
// EQ_RPC (a keyless gateway; ALCHEMY_URL when unset). Compare the two files
// line by line. A fixture line is `kind|arg|arg`: fx-system, fx-terms|pool,
// dolomite-markets, dolomite-position|owner|account, maker-system,
// maker-vault|id, lv1-system, lv1-position|wallet, llamalend-markets,
// llamalend-state, llamalend-position|controller|user, frankencoin-system,
// frankencoin-position|position, maple-pools. One fixture at a time, 600 ms
// apart. rails-ops decisions/0056 step 3, census rank 12 stage 8.

import { readFileSync, appendFileSync } from "node:fs";
import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { lastServerHead, overrideHeadReadsClient } from "@/lib/sources/api/head-reads-client";
import { pinnedClient } from "@/lib/sources/chain/replay-client";
import { chainClient } from "@/lib/sources/chain/rpc";
import { loadFxSystemFromChain } from "@/lib/sources/chain/fx-system";
import { readFxPoolTerms } from "@/lib/sources/chain/fx-terms";
import { loadDolomiteMarkets } from "@/lib/sources/chain/dolomite-markets";
import { loadDolomitePositionFromChain } from "@/lib/sources/chain/dolomite-position";
import { loadMakerSystemFromChain } from "@/lib/sources/chain/makerdao-system";
import { loadMakerVaultStateFromChain } from "@/lib/sources/chain/makerdao-position";
import { loadLiquityV1SystemFromChain } from "@/lib/sources/chain/liquity-v1-system";
import { loadLiquityV1PositionFromChain } from "@/lib/sources/chain/liquity-v1-position";
import { loadLlamalendMarkets, resolveLlamalendMarketState } from "@/lib/sources/chain/llamalend-markets";
import { loadLlamalendPositionFromChain } from "@/lib/sources/chain/llamalend-position";
import { loadFrankencoinSystemFromChain } from "@/lib/sources/chain/frankencoin-system";
import { loadFrankencoinPositionFromChain } from "@/lib/sources/chain/frankencoin-position";
import { resolveMaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import type { FxPoolKey } from "@/lib/fx/asset-catalog";

const MODE = process.env.EQ_MODE;
const OUT = process.env.EQ_OUT!;

type Fx = { kind: string; args: string[] };

const LOADERS: Record<string, (a: string[]) => Promise<unknown>> = {
  "fx-system": () => loadFxSystemFromChain(),
  "fx-terms": ([pool]) => readFxPoolTerms(pool as FxPoolKey),
  "dolomite-markets": () => loadDolomiteMarkets(),
  "dolomite-position": ([owner, acct]) => loadDolomitePositionFromChain(owner, acct),
  "maker-system": () => loadMakerSystemFromChain(),
  "maker-vault": ([id]) => loadMakerVaultStateFromChain(id),
  "lv1-system": () => loadLiquityV1SystemFromChain(),
  "lv1-position": ([w]) => loadLiquityV1PositionFromChain(w),
  "llamalend-markets": () => loadLlamalendMarkets(),
  "llamalend-state": () => resolveLlamalendMarketState(),
  "llamalend-position": ([c, u]) => loadLlamalendPositionFromChain(c, u),
  "frankencoin-system": () => loadFrankencoinSystemFromChain(),
  "frankencoin-position": ([p]) => loadFrankencoinPositionFromChain(p),
  "maple-pools": () => resolveMaplePoolState(),
};

const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) =>
    typeof x === "bigint" ? x.toString() : x instanceof Map ? Object.fromEntries([...x.entries()]) : x,
  );

/** A served answer that says it was not read is no comparison. */
const stale = (v: unknown) =>
  v == null || (typeof v === "object" && (v as { chainStale?: boolean }).chainStale === true);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (MODE === "server") {
    const fixtures: Fx[] = readFileSync(process.env.EQ_FIXTURES!, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const [kind, ...args] = l.split("|").map((x) => x.trim());
        return { kind, args };
      });
    for (const f of fixtures) {
      try {
        const value = await LOADERS[f.kind](f.args);
        const block = await lastServerHead(1);
        appendFileSync(OUT, json({ ...f, block, stale: stale(value), value }) + "\n");
        console.log(f.kind, f.args.join(" ").slice(0, 60), block, stale(value) ? "STALE" : "ok");
      } catch (e) {
        appendFileSync(OUT, json({ ...f, error: String((e as Error).message).slice(0, 200) }) + "\n");
        console.log(f.kind, f.args.join(" ").slice(0, 60), "ERROR", String((e as Error).message).slice(0, 120));
      }
      await sleep(600);
    }
  } else if (MODE === "chain") {
    const base: PublicClient = process.env.EQ_RPC
      ? (createPublicClient({ chain: mainnet, transport: http(process.env.EQ_RPC) }) as PublicClient)
      : chainClient(1);
    let equal = 0;
    let differ = 0;
    let skipped = 0;
    for (const line of readFileSync(process.env.EQ_IN!, "utf8").trim().split("\n")) {
      const s = JSON.parse(line) as Fx & { block?: number; stale?: boolean; value?: unknown; error?: string };
      if (s.error || s.block == null || s.stale) {
        skipped++;
        console.log(s.kind, s.args.join(" ").slice(0, 60), "SKIP", s.error ?? (s.stale ? "stale" : "no block"));
        continue;
      }
      const pinned = pinnedClient(base, s.block!);
      const B = BigInt(s.block!);
      // LlamaLend's discovery probes the V2 factory's structs with a raw call.
      const withCall = new Proxy(pinned, {
        get: (t, prop, r) =>
          prop === "call"
            ? (p: Parameters<PublicClient["call"]>[0]) => base.call({ ...p, blockNumber: B } as never)
            : Reflect.get(t, prop, r),
      });
      overrideHeadReadsClient(() => withCall);
      try {
        const old = await LOADERS[s.kind](s.args);
        const same = json(old) === json(s.value);
        if (same) equal++;
        else differ++;
        appendFileSync(
          OUT,
          json({
            kind: s.kind,
            args: s.args,
            block: s.block,
            same,
            old: same ? undefined : old,
            served: same ? undefined : s.value,
          }) + "\n",
        );
        console.log(s.kind, s.args.join(" ").slice(0, 60), s.block, same ? "EQUAL" : "DIFFER", json(old).length);
      } catch (e) {
        differ++;
        console.log(s.kind, s.args.join(" ").slice(0, 60), "ERROR", String((e as Error).message).slice(0, 120));
      }
      await sleep(600);
    }
    console.log(JSON.stringify({ equal, differ, skipped }));
  } else {
    console.error("EQ_MODE is server or chain");
    process.exit(2);
  }
}

void main();

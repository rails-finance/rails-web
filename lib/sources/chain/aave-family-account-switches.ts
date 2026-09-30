// The switches an Aave V3-family account made that its timeline does not
// carry: its e-mode changes (Pool UserEModeSet) and the reserves it ever turned
// on as collateral (Pool ReserveUsedAsCollateralEnabled), read from the Pool's
// logs by the wallet's topic over the Pool's whole life. Each e-mode change
// carries the category's limits read at its block. SparkLend
// (/api/chain/spark/account-switches) and Seamless
// (/api/chain/seamless/account-switches) answer through here; a route keeps an
// answer a few minutes per wallet, since a new switch can land at any block.
//
// SERVER-ONLY.

import { NextResponse } from "next/server";
import { parseAbi, parseAbiItem } from "viem";
import { chainClient, chainLogsClient } from "./rpc";
import type { ChainId } from "@/lib/shared/chains";
import type { AaveFamilyAccountSwitches, AaveFamilyEmodeSwitch } from "@/lib/aave-v3/account-switches";

const EMODE_SET = parseAbiItem("event UserEModeSet(address indexed user, uint8 categoryId)");
const COLLATERAL_ON = parseAbiItem(
  "event ReserveUsedAsCollateralEnabled(address indexed reserve, address indexed user)",
);
const POOL_ABI = parseAbi([
  "function getEModeCategoryData(uint8 id) view returns ((uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus, address priceSource, string label))",
  "function getEModeCategoryCollateralConfig(uint8 id) view returns ((uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus))",
  "function getEModeCategoryLabel(uint8 id) view returns (string)",
]);

export interface AaveFamilyPoolRef {
  pool: `0x${string}`;
  chainId: ChainId;
  /** At or below the Pool's first block. */
  fromBlock: bigint;
}

async function category(
  ref: AaveFamilyPoolRef,
  id: number,
  block: bigint,
): Promise<{ label: string | null; ltvBps: number | null; liquidationThresholdBps: number | null }> {
  if (id === 0) return { label: null, ltvBps: null, liquidationThresholdBps: null };
  const client = chainClient(ref.chainId);
  try {
    const d = await client.readContract({
      address: ref.pool,
      abi: POOL_ABI,
      functionName: "getEModeCategoryData",
      args: [id],
      blockNumber: block,
    });
    return { label: d.label || null, ltvBps: d.ltv, liquidationThresholdBps: d.liquidationThreshold };
  } catch {
    // A Pool from v3.2 on names the category's figures in two calls.
    const [cfg, label] = await Promise.all([
      client.readContract({
        address: ref.pool,
        abi: POOL_ABI,
        functionName: "getEModeCategoryCollateralConfig",
        args: [id],
        blockNumber: block,
      }),
      client
        .readContract({
          address: ref.pool,
          abi: POOL_ABI,
          functionName: "getEModeCategoryLabel",
          args: [id],
          blockNumber: block,
        })
        .catch(() => ""),
    ]);
    return { label: label || null, ltvBps: cfg.ltv, liquidationThresholdBps: cfg.liquidationThreshold };
  }
}

async function load(ref: AaveFamilyPoolRef, wallet: `0x${string}`): Promise<AaveFamilyAccountSwitches> {
  const logs = chainLogsClient(ref.chainId);
  const client = chainClient(ref.chainId);
  const [emodeLogs, collateralLogs] = await Promise.all([
    logs.getLogs({
      address: ref.pool,
      event: EMODE_SET,
      args: { user: wallet },
      fromBlock: ref.fromBlock,
      toBlock: "latest",
    }),
    logs.getLogs({
      address: ref.pool,
      event: COLLATERAL_ON,
      args: { user: wallet },
      fromBlock: ref.fromBlock,
      toBlock: "latest",
    }),
  ]);
  const ordered = [...emodeLogs].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : Number(a.blockNumber - b.blockNumber),
  );
  let previous = 0;
  let previousLabel: string | null = null;
  const emode: AaveFamilyEmodeSwitch[] = [];
  for (const l of ordered) {
    const id = Number(l.args.categoryId ?? 0);
    const [block, cat] = await Promise.all([
      client.getBlock({ blockNumber: l.blockNumber }),
      category(ref, id, l.blockNumber),
    ]);
    emode.push({
      blockNumber: Number(l.blockNumber),
      timestamp: Number(block.timestamp),
      txHash: l.transactionHash,
      logIndex: l.logIndex,
      fromId: previous,
      fromLabel: previousLabel,
      toId: id,
      ...cat,
    });
    previous = id;
    previousLabel = cat.label;
  }
  const collateralEnabled = [
    ...new Set(collateralLogs.map((l) => (l.args.reserve ?? "").toLowerCase()).filter(Boolean)),
  ];
  return { wallet: wallet.toLowerCase(), emode, collateralEnabled };
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const KEEP_MS = 5 * 60 * 1000;
const CACHE_MAX = 2000;

/** A route's GET over one Pool: the answer per wallet, kept a few minutes. */
export function accountSwitchesRoute(ref: AaveFamilyPoolRef, label: string) {
  const kept = new Map<string, { at: number; p: Promise<AaveFamilyAccountSwitches> }>();
  return async function GET(wallet: string | null): Promise<NextResponse> {
    if (!wallet || !ADDRESS.test(wallet))
      return NextResponse.json({ error: "wallet is required", code: "bad_request" }, { status: 400 });
    const key = wallet.toLowerCase();
    const hit = kept.get(key);
    let p: Promise<AaveFamilyAccountSwitches>;
    if (hit && Date.now() - hit.at < KEEP_MS) p = hit.p;
    else {
      p = load(ref, key as `0x${string}`);
      if (kept.size >= CACHE_MAX) {
        const oldest = kept.keys().next().value;
        if (oldest != null) kept.delete(oldest);
      }
      kept.set(key, { at: Date.now(), p });
      p.catch(() => kept.delete(key));
    }
    try {
      return NextResponse.json(await p, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
    } catch (error) {
      console.error(`Error reading ${label} account switches:`, error);
      return NextResponse.json(
        { error: "Failed to read the account's switches", code: "proxy_error" },
        { status: 502 },
      );
    }
  };
}

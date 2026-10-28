// The collateral factor setter logs behind the Lifetime flows panel's
// protocol-change markers on Compound V2, Moonwell and Compound V3
// (lib/shared/collateral-factor-changes.ts; ui-jobs 328 step 8).
//
//   readCTokenFactorLog — every NewCollateralFactor the Comptroller emitted
//                         to a block: one topic-filtered eth_getLogs over its
//                         life (170 logs on Compound V2, 80 on Moonwell Base,
//                         28 Oct 2026), each log's block read once for its time.
//   readCometFactorLog  — for one Comet: the Configurator's factor setters,
//                         listings and CometDeployed (one eth_getLogs, the
//                         Comet as topic 1), and the proxy's Upgraded logs
//                         (one more), each upgrade's block read for its time.
//
// Each answer is kept per block for the life of the server; the routes ask
// at the head rounded down to the hour.
//
// SERVER-ONLY.

import { decodeAbiParameters, keccak256, pad, parseAbiParameters, toHex, type Hex } from "viem";
import { chainBatchClient, chainClient } from "./rpc";
import { ctokenDeployment } from "./ctoken-liquidity-at";
import type { CTokenProtocol } from "@/lib/api/fetch-ctoken-liquidity-at";
import type { CometConfigLog, CometFactorLog, CTokenFactorLog } from "@/lib/shared/collateral-factor-changes";
import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { CompoundDeploymentKey } from "@/lib/compound/deployments";

type Log = { address: Hex; data: Hex; topics: Hex[]; blockNumber: Hex; transactionHash: Hex; logIndex: Hex };

const WAD = 1e18;
const T = (sig: string) => keccak256(toHex(sig));
const word = (hex: string, i: number) => BigInt(`0x${hex.slice(2 + 64 * i, 2 + 64 * (i + 1))}`);
const addr = (topicOrWord: string) => `0x${topicOrWord.slice(-40)}`.toLowerCase();

async function getLogs(chainId: ChainId, filter: Record<string, unknown>): Promise<Log[]> {
  return (await chainClient(chainId).request({ method: "eth_getLogs", params: [filter] } as never)) as Log[];
}

async function blockTimes(chainId: ChainId, blocks: readonly number[]): Promise<Map<number, number>> {
  const client = chainBatchClient(chainId);
  const list = [...new Set(blocks)];
  const times = await Promise.all(list.map((b) => client.getBlock({ blockNumber: BigInt(b) })));
  return new Map(list.map((b, i) => [b, Number(times[i].timestamp)]));
}

function kept<T>(cache: Map<string, Promise<T>>, key: string, read: () => Promise<T>): Promise<T> {
  let p = cache.get(key);
  if (!p) {
    p = read();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** A chain's head rounded down to about an hour of its blocks, so a page's
 *  reads share one answer for an hour. */
export async function hourBlock(chainId: ChainId): Promise<number> {
  const perHour = chainId === MAINNET_CHAIN_ID ? 300 : chainId === BASE_CHAIN_ID ? 1800 : 14_400;
  const head = Number(await chainClient(chainId).getBlockNumber());
  return head - (head % perHour);
}

// ── Compound V2, Moonwell ────────────────────────────────────────────────────

const NEW_COLLATERAL_FACTOR = T("NewCollateralFactor(address,uint256,uint256)");
const ctokenCache = new Map<string, Promise<CTokenFactorLog>>();

export function ctokenFactorChainId(protocol: CTokenProtocol): ChainId {
  return ctokenDeployment(protocol).chainId;
}

export function readCTokenFactorLog(protocol: CTokenProtocol, toBlock: number): Promise<CTokenFactorLog> {
  return kept(ctokenCache, `${protocol}:${toBlock}`, async () => {
    const d = ctokenDeployment(protocol);
    const logs = await getLogs(d.chainId, {
      address: d.comptroller,
      topics: [NEW_COLLATERAL_FACTOR],
      fromBlock: "0x0",
      toBlock: toHex(toBlock),
    });
    const times = await blockTimes(
      d.chainId,
      logs.map((l) => Number(l.blockNumber)),
    );
    const sets = logs
      .map((l) => ({
        block: Number(l.blockNumber),
        timestamp: times.get(Number(l.blockNumber))!,
        txHash: String(l.transactionHash).toLowerCase(),
        logIndex: Number(l.logIndex),
        market: addr(toHex(word(l.data, 0), { size: 32 })),
        from: Number(word(l.data, 1)) / WAD,
        to: Number(word(l.data, 2)) / WAD,
      }))
      .sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
    return { protocol, comptroller: d.comptroller.toLowerCase(), chainId: d.chainId, fromBlock: 0, toBlock, sets };
  });
}

// ── Compound V3 ──────────────────────────────────────────────────────────────

/** Compound governance's Configurator per chain (the Comet roster's source:
 *  every Comet the pages read was deployed through it). */
export const COMET_CONFIGURATOR: Record<CompoundDeploymentKey, string> = {
  ethereum: "0x316f9708bb98af7da9c68c1c3b5e79039cd336e3",
  base: "0x45939657d1ca34a8fa39a924b71d28fe8431e581",
  arbitrum: "0xb21b06d71c75973babde35b49ffdac3f82ad3775",
};
export const COMET_CHAIN: Record<CompoundDeploymentKey, ChainId> = {
  ethereum: MAINNET_CHAIN_ID,
  base: BASE_CHAIN_ID,
  arbitrum: ARBITRUM_CHAIN_ID,
};

const ASSET = "(address,address,uint8,uint64,uint64,uint64,uint128)";
const CONFIGURATION = `(address,address,address,address,address,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint104,uint104,uint104,${ASSET}[])`;
const TOPIC = {
  liquidateCF: T("UpdateAssetLiquidateCollateralFactor(address,address,uint64,uint64)"),
  updateAsset: T(`UpdateAsset(address,${ASSET},${ASSET})`),
  addAsset: T(`AddAsset(address,${ASSET})`),
  setConfiguration: T(`SetConfiguration(address,${CONFIGURATION},${CONFIGURATION})`),
  deployed: T("CometDeployed(address,address)"),
  upgraded: T("Upgraded(address)"),
};
// AssetConfig: asset, priceFeed, decimals, borrowCollateralFactor,
// liquidateCollateralFactor, liquidationFactor, supplyCap.
const LCF_WORD = 4;
const ASSET_WORDS = 7;
const CONFIG_PAIR = parseAbiParameters(
  `(address,address,address,address,address,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint104,uint104,uint104,(address,address,uint8,uint64,uint64,uint64,uint128)[]), (address,address,address,address,address,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint104,uint104,uint104,(address,address,uint8,uint64,uint64,uint64,uint128)[])`,
);

function configLogs(l: Log): CometConfigLog[] {
  const at = {
    block: Number(l.blockNumber),
    logIndex: Number(l.logIndex),
    txHash: String(l.transactionHash).toLowerCase(),
  };
  const t0 = l.topics[0];
  if (t0 === TOPIC.deployed) return [{ ...at, kind: "deploy", impl: addr(l.topics[2]) }];
  if (t0 === TOPIC.liquidateCF)
    return [
      {
        ...at,
        kind: "set",
        asset: addr(l.topics[2]),
        from: Number(word(l.data, 0)) / WAD,
        to: Number(word(l.data, 1)) / WAD,
      },
    ];
  if (t0 === TOPIC.updateAsset)
    return [
      {
        ...at,
        kind: "set",
        asset: addr(toHex(word(l.data, ASSET_WORDS), { size: 32 })),
        from: Number(word(l.data, LCF_WORD)) / WAD,
        to: Number(word(l.data, ASSET_WORDS + LCF_WORD)) / WAD,
      },
    ];
  if (t0 === TOPIC.addAsset)
    return [
      {
        ...at,
        kind: "listed",
        asset: addr(toHex(word(l.data, 0), { size: 32 })),
        to: Number(word(l.data, LCF_WORD)) / WAD,
      },
    ];
  if (t0 === TOPIC.setConfiguration) {
    const [oldC, newC] = decodeAbiParameters(CONFIG_PAIR, l.data) as unknown as [
      readonly unknown[],
      readonly unknown[],
    ];
    type A = readonly [string, string, number, bigint, bigint, bigint, bigint];
    const old = new Map((oldC[20] as readonly A[]).map((a) => [a[0].toLowerCase(), Number(a[4]) / WAD]));
    return (newC[20] as readonly A[]).map((a) => {
      const asset = a[0].toLowerCase();
      const to = Number(a[4]) / WAD;
      const from = old.get(asset);
      return from != null
        ? { ...at, kind: "set" as const, asset, from, to }
        : { ...at, kind: "listed" as const, asset, to };
    });
  }
  return [];
}

const cometCache = new Map<string, Promise<CometFactorLog>>();

export function readCometFactorLog(
  deployment: CompoundDeploymentKey,
  comet: string,
  toBlock: number,
): Promise<CometFactorLog> {
  return kept(cometCache, `${deployment}:${comet}:${toBlock}`, async () => {
    const chainId = COMET_CHAIN[deployment];
    const configurator = COMET_CONFIGURATOR[deployment];
    const range = { fromBlock: "0x0", toBlock: toHex(toBlock) };
    const [config, up] = await Promise.all([
      getLogs(chainId, {
        address: configurator,
        topics: [
          [TOPIC.liquidateCF, TOPIC.updateAsset, TOPIC.addAsset, TOPIC.setConfiguration, TOPIC.deployed],
          pad(comet as Hex),
        ],
        ...range,
      }),
      getLogs(chainId, { address: comet, topics: [TOPIC.upgraded], ...range }),
    ]);
    const times = await blockTimes(
      chainId,
      up.map((l) => Number(l.blockNumber)),
    );
    return {
      deployment,
      chainId,
      comet: comet.toLowerCase(),
      configurator,
      fromBlock: 0,
      toBlock,
      configs: config.flatMap(configLogs),
      upgrades: up.map((l) => ({
        block: Number(l.blockNumber),
        logIndex: Number(l.logIndex),
        timestamp: times.get(Number(l.blockNumber))!,
        txHash: String(l.transactionHash).toLowerCase(),
        impl: addr(l.topics[1]),
      })),
    };
  });
}

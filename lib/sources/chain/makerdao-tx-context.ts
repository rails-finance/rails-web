// Two historic MakerDAO reads for the vault page's ownership rows and minimum
// ratio, both at mined blocks, so every answer is kept in process memory and
// the routes cache it at the edge.
//
// 1. What one transaction around a vault's ownership did: the receipt's logs
//    and the calldata, read for the parties the rows name (a wallet, a
//    DSProxy and its owner, an Instadapp account created in the transaction),
//    the known tools that logged (lib/makerdao/known-contracts.ts), a DeFi
//    Saver recipe's name, a flash loan, the Sai CDP handed to Maker's
//    migration contract, and tokens an Instadapp account received. Calls: the
//    transaction, its receipt, and a few eth_calls per party at its block.
//
// 2. Changes to an ilk's minimum ratio between two blocks: the Spotter's
//    LogNote for file(ilk, "mat", value), which only governance can call, and
//    each change's block header for its date.
//
// SERVER-ONLY (ALCHEMY_URL via ./rpc).

import {
  decodeAbiParameters,
  decodeFunctionData,
  formatUnits,
  getAddress,
  keccak256,
  parseAbi,
  stringToHex,
  toHex,
  type Hex,
} from "viem";
import { alchemyClient, chainBatchClient } from "./rpc";
import { MAKER_ADDRESSES } from "@/lib/makerdao/asset-catalog";
import {
  DYDX_SOLO,
  INSTA_INDEX,
  MAKER_KNOWN_CONTRACTS,
  MAKER_MIGRATION,
  SAI_TUB,
} from "@/lib/makerdao/known-contracts";
import type {
  MakerMatChange,
  MakerMatChangesResponse,
  MakerParty,
  MakerTokenIn,
  MakerTxContext,
} from "@/lib/makerdao/chain-history-types";

const PROXY_REGISTRY = "0x4678f0a6958e4d2bc4f1baf7bc52e8f3564f3fe4";
// Maker changelog: PROXY_FACTORY. Its Created log names each DSProxy it builds.
const PROXY_FACTORY = "0xa26e15c895efc0616177b7c1e7270a4c7d51c997";
const PROXY_CREATED = keccak256(toHex("Created(address,address,address,address)"));
const TRANSFER = keccak256(toHex("Transfer(address,address,uint256)"));
const ACCOUNT_CREATED = keccak256(toHex("LogAccountCreated(address,address,address,address)"));
const TUB_GIVE = keccak256(toHex("give(bytes32,address)")).slice(0, 10);
const SPOTTER_FILE = keccak256(toHex("file(bytes32,bytes32,uint256)")).slice(0, 10);

const VIEWS = parseAbi([
  "function owner() view returns (address)",
  "function cache() view returns (address)",
  "function instaIndex() view returns (address)",
  "function proxies(address) view returns (address)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const DSPROXY_EXECUTE = parseAbi(["function execute(address,bytes) payable returns (bytes)"]);

const lower = (a: string) => a.toLowerCase();
const topicAddress = (t: Hex | undefined) => (t ? lower(`0x${t.slice(26)}`) : "");

async function tryRead<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

async function classify(address: string, blockNumber: bigint, createdOwner: string | null): Promise<MakerParty> {
  const client = chainBatchClient();
  const addr = getAddress(address);
  const code = await client.getCode({ address: addr, blockNumber });
  const base = { address: lower(address), createdInTx: createdOwner != null };
  if (!code || code === "0x") return { ...base, kind: "eoa", owner: null };
  const [owner, cache, index] = await Promise.all([
    tryRead(client.readContract({ address: addr, abi: VIEWS, functionName: "owner", blockNumber })),
    tryRead(client.readContract({ address: addr, abi: VIEWS, functionName: "cache", blockNumber })),
    tryRead(client.readContract({ address: addr, abi: VIEWS, functionName: "instaIndex", blockNumber })),
  ]);
  if (index && lower(index) === INSTA_INDEX) {
    return { ...base, kind: "instadapp-account", owner: createdOwner };
  }
  if (owner && cache) {
    const registered = await tryRead(
      client.readContract({
        address: getAddress(PROXY_REGISTRY),
        abi: VIEWS,
        functionName: "proxies",
        args: [owner],
        blockNumber,
      }),
    );
    if (registered && lower(registered) === lower(address)) return { ...base, kind: "dsproxy", owner: lower(owner) };
  }
  return { ...base, kind: "contract", owner: null };
}

/** The first string of a DeFi Saver recipe tuple inside a DSProxy execute. */
function recipeName(input: Hex): string | null {
  try {
    const outer = decodeFunctionData({ abi: DSPROXY_EXECUTE, data: input });
    const inner = outer.args[1] as Hex;
    const [t] = decodeAbiParameters(
      [{ type: "tuple", components: [{ name: "name", type: "string" }] }],
      `0x${inner.slice(10)}`,
    );
    const name = (t as { name: string }).name;
    return /^[A-Za-z0-9 _-]{3,64}$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

async function tokenMeta(token: string, blockNumber: bigint): Promise<{ symbol: string; decimals: number }> {
  const client = chainBatchClient();
  const address = getAddress(token);
  const [symbol, decimals] = await Promise.all([
    tryRead(client.readContract({ address, abi: VIEWS, functionName: "symbol", blockNumber })),
    tryRead(client.readContract({ address, abi: VIEWS, functionName: "decimals", blockNumber })),
  ]);
  return { symbol: symbol ?? "tokens", decimals: decimals ?? 18 };
}

const txCache = new Map<string, Promise<MakerTxContext>>();

async function readTxContextOnce(txHash: Hex, addresses: string[]): Promise<MakerTxContext> {
  const client = alchemyClient();
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: txHash }),
    client.getTransactionReceipt({ hash: txHash }),
  ]);
  const blockNumber = receipt.blockNumber;

  const created = new Map<string, string>();
  const tools = new Set<string>();
  let migratedCup: string | null = null;
  let flashLoan: MakerTxContext["flashLoan"] = null;
  const transfers: { token: string; from: string; to: string; value: bigint }[] = [];
  const proxiesBuilt: { owner: string; proxy: string }[] = [];
  for (const log of receipt.logs) {
    const at = lower(log.address);
    const t0 = log.topics[0];
    if (at === PROXY_FACTORY && t0 === PROXY_CREATED && log.data.length >= 130) {
      // Created(sender indexed, owner indexed, proxy, cache)
      proxiesBuilt.push({ owner: topicAddress(log.topics[2]), proxy: lower(`0x${log.data.slice(26, 66)}`) });
    }
    if (at === INSTA_INDEX && t0 === ACCOUNT_CREATED) {
      created.set(topicAddress(log.topics[2]), topicAddress(log.topics[1]));
    }
    const known = MAKER_KNOWN_CONTRACTS[at];
    if (known?.role === "tool") tools.add(known.name);
    if (at === SAI_TUB && t0?.startsWith(TUB_GIVE) && topicAddress(log.topics[3]) === MAKER_MIGRATION) {
      migratedCup = BigInt(log.topics[2] ?? "0x0").toString();
    }
    if (t0 === TRANSFER && log.topics.length === 3 && log.data.length === 66) {
      transfers.push({
        token: at,
        from: topicAddress(log.topics[1]),
        to: topicAddress(log.topics[2]),
        value: BigInt(log.data),
      });
    }
  }

  const lent = transfers.find((t) => t.from === DYDX_SOLO);
  if (lent) {
    const meta = await tokenMeta(lent.token, blockNumber);
    flashLoan = {
      lender: MAKER_KNOWN_CONTRACTS[DYDX_SOLO].name,
      symbol: meta.symbol === "WETH" ? "ETH" : meta.symbol,
      amount: formatUnits(lent.value, meta.decimals),
    };
  }

  const wanted = [...new Set([lower(tx.from), ...(tx.to ? [lower(tx.to)] : []), ...addresses.map(lower)])];
  const classified = await Promise.all(wanted.map((a) => classify(a, blockNumber, created.get(a) ?? null)));
  const parties: Record<string, MakerParty> = {};
  for (const p of classified) parties[p.address] = p;

  const accounts = new Set(classified.filter((p) => p.kind === "instadapp-account").map((p) => p.address));
  const tokensIn: MakerTokenIn[] = [];
  for (const t of transfers) {
    if (!accounts.has(t.to) || accounts.has(t.from) || t.value === BigInt(0)) continue;
    const meta = await tokenMeta(t.token, blockNumber);
    tokensIn.push({
      to: t.to,
      from: t.from,
      token: t.token,
      symbol: meta.symbol,
      amount: formatUnits(t.value, meta.decimals),
    });
  }

  return {
    txHash: lower(txHash),
    block: Number(blockNumber),
    from: lower(tx.from),
    to: tx.to ? lower(tx.to) : null,
    parties,
    tools: [...tools],
    recipe: tools.has("DeFi Saver") ? recipeName(tx.input) : null,
    flashLoan,
    migratedCup,
    tokensIn,
    proxiesBuilt,
  };
}

export function readMakerTxContext(txHash: Hex, addresses: string[]): Promise<MakerTxContext> {
  const key = `${lower(txHash)}:${[...new Set(addresses.map(lower))].sort().join(",")}`;
  let p = txCache.get(key);
  if (!p) {
    p = readTxContextOnce(txHash, addresses);
    p.catch(() => txCache.delete(key));
    txCache.set(key, p);
  }
  return p;
}

const matCache = new Map<string, Promise<MakerMatChangesResponse>>();

async function readMatChangesOnce(ilk: string, fromBlock: number, toBlock: number): Promise<MakerMatChangesResponse> {
  const client = alchemyClient();
  // Raw filter: a LogNote is not an event viem can name by signature.
  const logs = (await client.request({
    method: "eth_getLogs",
    params: [
      {
        address: getAddress(MAKER_ADDRESSES.SPOTTER),
        // LogNote: topic0 is the selector padded, then (caller, arg1, arg2).
        topics: [
          `${SPOTTER_FILE}${"0".repeat(56)}` as Hex,
          null,
          stringToHex(ilk, { size: 32 }),
          stringToHex("mat", { size: 32 }),
        ],
        fromBlock: toHex(fromBlock),
        toBlock: toHex(toBlock),
      },
    ],
  })) as { data: Hex; blockNumber: Hex; transactionHash: Hex }[];
  const changes: MakerMatChange[] = [];
  for (const log of logs) {
    // data = abi.encode(bytes fax); fax = selector ‖ ilk ‖ what ‖ value.
    const hex = log.data.slice(2);
    const value = BigInt(`0x${hex.slice(128 + 8 + 128, 128 + 8 + 192)}`);
    const header = await client.getBlock({ blockNumber: BigInt(log.blockNumber) });
    changes.push({
      block: Number(log.blockNumber),
      timestamp: Number(header.timestamp),
      txHash: String(log.transactionHash),
      mat: Number(formatUnits(value, 27)),
    });
  }
  return { ilk, fromBlock, toBlock, changes };
}

export function readMakerMatChanges(ilk: string, fromBlock: number, toBlock: number): Promise<MakerMatChangesResponse> {
  const key = `${ilk}:${fromBlock}:${toBlock}`;
  let p = matCache.get(key);
  if (!p) {
    p = readMatChangesOnce(ilk, fromBlock, toBlock);
    p.catch(() => matCache.delete(key));
    matCache.set(key, p);
  }
  return p;
}

// A historic MakerDAO read for the vault page's ownership rows, at a mined
// block, so every answer is kept in process memory and the route caches it at
// the edge.
//
// What one transaction around a vault's ownership did: the receipt's logs
//    and the calldata, read for the parties the rows name (a wallet, a
//    DSProxy and its owner, an Instadapp account created in the transaction),
//    the known tools that logged (lib/makerdao/known-contracts.ts), a DeFi
//    Saver recipe's name, a flash loan, the Sai CDP handed to Maker's
//    migration contract, and tokens an Instadapp account received. The chain
//    facts (the transaction, its receipt's logs, and each party's code and
//    owner(), cache(), instaIndex() and Proxy Registry entry at its block) come
//    from rails-server's `/api/at-block/makerdao/tx-facts`, which keeps each
//    once the block is final (server migs 412, 413, 417; rails-ops decisions/0056);
//    token symbols and decimals go through ./erc20-meta.
//
// SERVER-ONLY (the api via ./at-block-api and ./erc20-meta).

import { decodeAbiParameters, decodeFunctionData, formatUnits, keccak256, parseAbi, toHex, type Hex } from "viem";
import { atBlockGet } from "./at-block-api";
import { resolveErc20Meta } from "./erc20-meta";
import { DYDX_SOLO, MAKER_KNOWN_CONTRACTS, MAKER_MIGRATION, SAI_TUB } from "@/lib/makerdao/known-contracts";
import type { MakerParty, MakerTokenIn, MakerTxContext } from "@/lib/makerdao/chain-history-types";

// Maker changelog: PROXY_FACTORY. Its Created log names each DSProxy it builds.
const PROXY_FACTORY = "0xa26e15c895efc0616177b7c1e7270a4c7d51c997";
const PROXY_CREATED = keccak256(toHex("Created(address,address,address,address)"));
const TRANSFER = keccak256(toHex("Transfer(address,address,uint256)"));
const TUB_GIVE = keccak256(toHex("give(bytes32,address)")).slice(0, 10);

const DSPROXY_EXECUTE = parseAbi(["function execute(address,bytes) payable returns (bytes)"]);

const lower = (a: string) => a.toLowerCase();
const topicAddress = (t: Hex | undefined) => (t ? lower(`0x${t.slice(26)}`) : "");

/** The server's facts: the transaction, its receipt's logs, and each party. */
interface MakerTxFacts {
  block: number;
  from: string;
  to: string | null;
  input: Hex;
  logs: { address: string; topics: Hex[]; data: Hex; logIndex: number }[];
  parties: Record<string, MakerParty>;
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

/** A token's symbol and decimals through `resolveErc20Meta` (the api's
 *  token_meta first, the chain for what it lacks): immutable, so the answer
 *  holds at the transaction's block. */
async function tokenMeta(token: string): Promise<{ symbol: string; decimals: number }> {
  const m = (await resolveErc20Meta([token])).get(token.toLowerCase());
  return { symbol: m?.named ? m.symbol : "tokens", decimals: m?.decimals ?? 18 };
}

const txCache = new Map<string, Promise<MakerTxContext>>();

async function readTxContextOnce(txHash: Hex, addresses: string[], readerIp?: string): Promise<MakerTxContext> {
  const qs = new URLSearchParams({ tx: txHash });
  if (addresses.length) qs.set("addresses", [...new Set(addresses.map(lower))].join(","));
  const facts = await atBlockGet<MakerTxFacts>("makerdao/tx-facts", qs, readerIp);
  const tx = { from: facts.from, to: facts.to, input: facts.input };
  const receipt = { logs: facts.logs };

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
    const meta = await tokenMeta(lent.token);
    flashLoan = {
      lender: MAKER_KNOWN_CONTRACTS[DYDX_SOLO].name,
      symbol: meta.symbol === "WETH" ? "ETH" : meta.symbol,
      amount: formatUnits(lent.value, meta.decimals),
    };
  }

  // Each party's kind at the block, as the server classified it (the sender, the
  // target and the addresses asked); the Instadapp accounts this transaction
  // created carry their creator.
  const parties: Record<string, MakerParty> = facts.parties;
  const classified = Object.values(parties);

  const accounts = new Set(classified.filter((p) => p.kind === "instadapp-account").map((p) => p.address));
  const tokensIn: MakerTokenIn[] = [];
  for (const t of transfers) {
    if (!accounts.has(t.to) || accounts.has(t.from) || t.value === BigInt(0)) continue;
    const meta = await tokenMeta(t.token);
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
    block: facts.block,
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

export function readMakerTxContext(txHash: Hex, addresses: string[], readerIp?: string): Promise<MakerTxContext> {
  const key = `${lower(txHash)}:${[...new Set(addresses.map(lower))].sort().join(",")}`;
  let p = txCache.get(key);
  if (!p) {
    p = readTxContextOnce(txHash, addresses, readerIp);
    p.catch(() => txCache.delete(key));
    txCache.set(key, p);
  }
  return p;
}

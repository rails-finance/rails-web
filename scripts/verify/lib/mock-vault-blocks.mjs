// A stand-in for rails-server's `/api/at-block/vault/blocks`, for the offline
// cold-build verifiers: the loader's row-block reads go to this route
// (lib/sources/chain/vault-block-reads.ts), and the route reads each block on
// the verifier's mock lane, the way the server reads its legs.
//
//   - a block's timestamp is `eth_getBlockByNumber`; its share price is
//     `eth_call` `convertToAssets(10 ** decimals)`;
//   - a refusal on rate (code 429) is asked again every 250 ms for up to 7 s,
//     the server's gate and its Alchemy leg standing behind the keyless one;
//   - code 3, or "execution reverted", is a revert: `reverted: true`;
//   - anything else, or a refusal past 7 s, answers null: the web's miss.
//
// Every ask goes through `answer`, so the lane's own counters count it.

const RETRY_MS = 7_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(answer, req) {
  const until = Date.now() + RETRY_MS;
  for (;;) {
    const out = answer(req);
    if (out.error?.code !== 429 || Date.now() >= until) return out;
    await sleep(250);
  }
}

const isRevert = (e) => e?.code === 3 || /execution reverted/i.test(e?.message ?? "");

/** The route's body for `url` (a request path with its query), or null when the path is another one. */
export async function vaultBlocksAnswer(url, answer) {
  const u = new URL(url, "http://mock");
  if (u.pathname !== "/api/at-block/vault/blocks") return null;
  const blocks = (u.searchParams.get("blocks") ?? "").split(",").filter(Boolean).map(Number);
  const vault = u.searchParams.get("vault");
  const decimals = Number(u.searchParams.get("decimals") ?? 18);
  const arg = (10n ** BigInt(decimals)).toString(16).padStart(64, "0");
  let next = 0;
  const reads = new Array(blocks.length);
  const worker = async () => {
    while (next < blocks.length) {
      const i = next++;
      const block = blocks[i];
      const hex = `0x${block.toString(16)}`;
      const [ts, price] = await Promise.all([
        ask(answer, { jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: [hex, false] }),
        ask(answer, {
          jsonrpc: "2.0",
          id: 2,
          method: "eth_call",
          params: [{ to: vault, data: `0x07a2d13a${arg}` }, hex],
        }),
      ]);
      const timestamp = ts.result?.timestamp != null ? Number(BigInt(ts.result.timestamp)) : null;
      if (price.error && isRevert(price.error)) reads[i] = { block, timestamp, sharePrice: null, reverted: true };
      else if (typeof price.result === "string" && price.result !== "0x")
        reads[i] = { block, timestamp, sharePrice: BigInt(price.result).toString() };
      else reads[i] = { block, timestamp, sharePrice: null };
    }
  };
  await Promise.all(Array.from({ length: Math.min(16, blocks.length) }, worker));
  return { chainId: Number(u.searchParams.get("chain")), vault, decimals, reads };
}

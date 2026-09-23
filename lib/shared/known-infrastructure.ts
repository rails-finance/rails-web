import { isAddress } from "viem";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

/**
 * Known contracts that are not positions, keyed by CHAIN and address. Two
 * classes share the registry:
 *
 *   • custody escrows (`ccip-lock-release`) hold protocol tokens for someone
 *     else. A Maple page for one renders the custody view, not a position.
 *   • protocol contracts (settlement, router, adapter, gateway, multicall,
 *     amm-pool) are what a user's tokens move through or into on the way to a
 *     trade, a swap or an ETH wrap. A transfer to or from one keeps its
 *     timeline row, and the chip names the contract ("to CoW Protocol").
 *
 * Neither class is ever a roster position. The server keeps the second class
 * out of its listings from the same rows (rails-server-onboarding mig 227,
 * `protocol_plumbing_contracts`); keep the two lists in step. The build is
 * rails-ops TO-DO-ui-jobs §14.
 *
 * The key carries the chain because an address is only a fact on the chain it
 * was verified on: GPv2Settlement sits at the same address on Ethereum and
 * Base, a WETH gateway does not, and each needs its own evidence.
 *
 * ── Evidence ────────────────────────────────────────────────────────────────
 * An entry is a claim about the on-chain record, so it carries verifiable
 * evidence or it does not exist. Do not add one from a naming pattern, a vanity
 * prefix or a hunch.
 *   • The CCIP escrows: Chainlink's TokenAdminRegistry
 *     (0xb22764f98dD05c789929716D677382Df22C05Cb6, `getPool(token)`) returns
 *     exactly these addresses for syrupUSDC and syrupUSDT, and Etherscan
 *     verifies each as `LockReleaseTokenPool`.
 *   • Every protocol contract's `contractName` is its verified source name on
 *     the chain's explorer, re-read on Etherscan (2026-09-13) and Blockscout
 *     (2026-09-14). The AMM pools also answer `factory()` with the venue's
 *     canonical factory: Uniswap V3 0x1F98431c8aD98523631AE4a59f267346ea31F984,
 *     PancakeSwap V2 on Ethereum 0x1097053Fd2ea711dad45caCcc45EfF7548fCB362.
 *     Their token0 is aEthWETH or aEthUSDC, which is why they hold aTokens.
 *   • A WETH gateway is named for what it does, not for whose deployment it
 *     is: Aave and Seamless both run `WrappedTokenGatewayV3`, and the source
 *     name does not say which.
 */
interface KnownContractBase {
  /** Short display name for party chips, e.g. "CoW Protocol". */
  name: string;
  /** The explorer-verified contract name. */
  contractName: string;
}

export interface CcipEscrow extends KnownContractBase {
  kind: "ccip-lock-release";
  /** The share token the escrow holds. */
  poolSymbol: string;
  /** One-paragraph factual description for the infra notice page. */
  description: string;
}

export interface ProtocolContract extends KnownContractBase {
  kind: "settlement" | "router" | "adapter" | "gateway" | "multicall" | "amm-pool";
  /** A noun phrase that completes "The recipient is …" / "The sender is …" in
   *  an event's explanation. Says what the contract does, nothing more. */
  role: string;
  /** Basename under public/icons/protocols/, set only where that mark exists. */
  protocolIcon?: string;
}

export type KnownInfrastructure = CcipEscrow | ProtocolContract;

const escrow = (poolSymbol: string): CcipEscrow => ({
  name: `CCIP escrow · ${poolSymbol}`,
  kind: "ccip-lock-release",
  poolSymbol,
  contractName: "LockReleaseTokenPool",
  description:
    `Chainlink's CCIP lock-release token pool for ${poolSymbol}. Shares locked in this contract back bridged ` +
    `${poolSymbol} balances on other networks — the shares sit here in custody while their owners hold the ` +
    "bridged claim elsewhere.",
});

const COW: ProtocolContract = {
  name: "CoW Protocol",
  kind: "settlement",
  contractName: "GPv2Settlement",
  protocolIcon: "cow",
  role: "CoW Protocol’s settlement contract, which takes in the tokens a CoW trade sells and pays out the tokens it buys",
};
const WETH_GATEWAY: ProtocolContract = {
  name: "WETH gateway",
  kind: "gateway",
  contractName: "WrappedTokenGatewayV3",
  role: "a WETH gateway, the contract that supplies ETH to the Pool as WETH and withdraws it back out as ETH",
};
const PARASWAP_REPAY: ProtocolContract = {
  name: "ParaSwap repay adapter",
  kind: "adapter",
  contractName: "ParaSwapRepayAdapter",
  protocolIcon: "paraswap",
  role: "a ParaSwap repay adapter, which swaps supplied collateral through ParaSwap to repay a debt",
};
const PARASWAP_LIQUIDITY_SWAP: ProtocolContract = {
  name: "ParaSwap swap adapter",
  kind: "adapter",
  contractName: "ParaSwapLiquiditySwapAdapter",
  protocolIcon: "paraswap",
  role: "a ParaSwap liquidity swap adapter, which swaps one supplied asset for another through ParaSwap",
};
const PARASWAP_WITHDRAW_SWAP: ProtocolContract = {
  name: "ParaSwap withdraw adapter",
  kind: "adapter",
  contractName: "ParaSwapWithdrawSwapAdapter",
  protocolIcon: "paraswap",
  role: "a ParaSwap withdraw swap adapter, which withdraws a supplied asset and swaps it through ParaSwap",
};
const paraswapDebtSwap = (contractName: string): ProtocolContract => ({
  name: "ParaSwap debt swap adapter",
  kind: "adapter",
  contractName,
  protocolIcon: "paraswap",
  role: "a ParaSwap debt swap adapter, which borrows one asset and swaps it through ParaSwap to repay a debt in another",
});
const UNISWAP_V3_POOL: ProtocolContract = {
  name: "Uniswap V3 pool",
  kind: "amm-pool",
  contractName: "UniswapV3Pool",
  protocolIcon: "uniswap-v3",
  role: "a Uniswap V3 pool that trades aTokens, holding them as its liquidity",
};
const UNISWAP_V4: ProtocolContract = {
  name: "Uniswap V4",
  kind: "amm-pool",
  contractName: "PoolManager",
  protocolIcon: "uniswap",
  role: "Uniswap V4’s PoolManager, the one contract that holds the tokens of every Uniswap V4 pool",
};
const PANCAKE_PAIR: ProtocolContract = {
  name: "PancakeSwap pair",
  kind: "amm-pool",
  contractName: "PancakePair",
  role: "a PancakeSwap pair that trades aTokens, holding them as its liquidity",
};
const router = (name: string, contractName: string, owner: string): ProtocolContract => ({
  name,
  kind: "router",
  contractName,
  role: `${owner} router, which routes a swap across other trading venues`,
});
const ENSO: ProtocolContract = {
  name: "Enso shortcuts",
  kind: "router",
  contractName: "EnsoShortcuts",
  role: "Enso’s shortcuts contract, which runs a batch of DeFi actions in one transaction",
};

const ENTRIES: [ChainId, string, KnownInfrastructure][] = [
  // ── Ethereum ──
  [MAINNET_CHAIN_ID, "0x20b79d39bd44deee4f89b1e9d0e3b945fde06491", escrow("syrupUSDC")],
  [MAINNET_CHAIN_ID, "0xde76a096c5eadddf97af3fe15ee49d32aeda9822", escrow("syrupUSDT")],
  [MAINNET_CHAIN_ID, "0x9008d19f58aabd9ed0d60971565aa8510560ab41", COW],
  [MAINNET_CHAIN_ID, "0xd01607c3c5ecaba394d8be377a08590149325722", WETH_GATEWAY],
  [MAINNET_CHAIN_ID, "0x893411580e590d62ddbca8a703d61cc4a8c7b2b9", WETH_GATEWAY],
  [MAINNET_CHAIN_ID, "0xa434d495249abe33e031fe71a969b81f3c07950d", WETH_GATEWAY],
  [MAINNET_CHAIN_ID, "0xd322a49006fc828f9b5b37ab215f99b4e5cab19c", WETH_GATEWAY],
  [MAINNET_CHAIN_ID, "0x35bb522b102326ea3f1141661df4626c87000e3e", PARASWAP_REPAY],
  [MAINNET_CHAIN_ID, "0x02e7b8511831b1b02d9018215a0f8f500ea5c6b3", PARASWAP_REPAY],
  [MAINNET_CHAIN_ID, "0xadc0a53095a0af87f3aa29fe0715b5c28016364e", PARASWAP_LIQUIDITY_SWAP],
  [MAINNET_CHAIN_ID, "0x872fbcb1b582e8cd0d0dd4327fbfa0b4c2730995", PARASWAP_LIQUIDITY_SWAP],
  [MAINNET_CHAIN_ID, "0x78f8bd884c3d738b74b420540659c82f392820e0", PARASWAP_WITHDRAW_SWAP],
  // The ParaSwap adapters rails-server-onboarding mig 248 pairs swaps by; the
  // repay and swap adapters here serve Prime or an earlier deployment.
  [MAINNET_CHAIN_ID, "0x1809f186d680f239420b56948c58f8dbbcdf1e18", PARASWAP_REPAY],
  [MAINNET_CHAIN_ID, "0x66e1abdb06e7363a618d65a910c540dfed23754f", PARASWAP_REPAY],
  [MAINNET_CHAIN_ID, "0xd0eae3b730ae736614c66cb40afd1e0063f74286", PARASWAP_REPAY],
  [MAINNET_CHAIN_ID, "0xd0887aa7febc8962c622493646195e7c76d94fce", PARASWAP_LIQUIDITY_SWAP],
  [MAINNET_CHAIN_ID, "0xd7852e139a7097e119623de0751ae53a61efb442", paraswapDebtSwap("ParaSwapDebtSwapAdapterV3GHO")],
  [MAINNET_CHAIN_ID, "0x8761e0370f94f68db8eaa731f4fc581f6ad0bd68", paraswapDebtSwap("ParaSwapDebtSwapAdapterV3GHO")],
  [MAINNET_CHAIN_ID, "0x8f30adaa6950b31f675bf8a709bc23f55aa24735", paraswapDebtSwap("ParaSwapDebtSwapAdapterV3GHO")],
  [MAINNET_CHAIN_ID, "0xd1b2dec98a95b773c4909b5cd8fb455f467a527f", paraswapDebtSwap("ParaSwapDebtSwapAdapterV3")],
  [MAINNET_CHAIN_ID, "0xb6dab6ad1b394749db7596c283f2bcc7e1be76ef", UNISWAP_V3_POOL],
  [MAINNET_CHAIN_ID, "0xad729a395657a3d5ecc52e8897d08bcc14392104", UNISWAP_V3_POOL],
  [MAINNET_CHAIN_ID, "0xc1a06b9ad9a552d66e511de88c402cf7b04eb1f5", UNISWAP_V3_POOL],
  [MAINNET_CHAIN_ID, "0x51ae2719f5d1e986d713e033df8bbc848be74e33", UNISWAP_V3_POOL],
  [MAINNET_CHAIN_ID, "0xe359219083033e98a42051d3dd41b64924ed4b3d", UNISWAP_V3_POOL],
  [MAINNET_CHAIN_ID, "0x000000000004444c5dc75cb358380d2e3de08a90", UNISWAP_V4],
  [MAINNET_CHAIN_ID, "0x4800cc349f5e541bad9c147a80f3beca245ffbae", PANCAKE_PAIR],
  // ── Base ──
  [BASE_CHAIN_ID, "0x9008d19f58aabd9ed0d60971565aa8510560ab41", COW],
  [BASE_CHAIN_ID, "0xa0d9c1e9e48ca30c8d8c3b5d69ff5dc1f6dffc24", WETH_GATEWAY],
  [BASE_CHAIN_ID, "0x18cd499e3d7ed42feba981ac9236a278e4cdc2ee", WETH_GATEWAY],
  [BASE_CHAIN_ID, "0x8be473dcfa93132658821e67cbeb684ec8ea2e74", WETH_GATEWAY],
  [BASE_CHAIN_ID, "0x729b3ea8c005abc58c9150fb57ec161296f06766", WETH_GATEWAY],
  [BASE_CHAIN_ID, "0xaeeb3898ede6a6e86864688383e211132baa1af3", WETH_GATEWAY],
  [BASE_CHAIN_ID, "0x2e549104c516b8657a7d888494dfbabd7c70b464", PARASWAP_LIQUIDITY_SWAP],
  [BASE_CHAIN_ID, "0x63dfa7c09dc2ff4030d6b8dc2ce6262bf898c8a4", PARASWAP_REPAY],
  [BASE_CHAIN_ID, "0x5598bbfa2f4fe8151f45bba0a3ede1b54b51a0a9", PARASWAP_WITHDRAW_SWAP],
  [
    BASE_CHAIN_ID,
    "0x111111125421ca6dc452d289314280a0f8842a65",
    router("1inch router", "AggregationRouterV6", "1inch’s aggregation"),
  ],
  [BASE_CHAIN_ID, "0x19ceead7105607cd444f5ad10dd51356436095a1", router("Odos router", "OdosRouterV2", "Odos’s")],
  [
    BASE_CHAIN_ID,
    "0x43f9a7aec2a683c4cd6016f92ff76d5f3e7b44d3",
    router("Magpie router", "MagpieRouterCore", "Magpie’s"),
  ],
  [BASE_CHAIN_ID, "0x9ee06954418687c6fb3a9966f7c46e0a245f0183", router("Magpie router", "MagpieRouterV2", "Magpie’s")],
  [
    BASE_CHAIN_ID,
    "0x6a000f20005980200259b80c5102003040001068",
    router("ParaSwap router", "AugustusV6", "ParaSwap’s Augustus"),
  ],
  [BASE_CHAIN_ID, "0x7d585b0e27bbb3d981b7757115ec11f47c476994", ENSO],
  [BASE_CHAIN_ID, "0x4fe93ebc4ce6ae4f81601cc7ce7139023919e003", ENSO],
  [
    BASE_CHAIN_ID,
    "0x848f9e9992696e34879b964895da07b3c5794712",
    {
      name: "Multicall contract",
      kind: "multicall",
      contractName: "ExtendedMulticall3",
      role: "a multicall contract, which bundles several calls into one transaction",
    },
  ],
];

const keyOf = (chainId: ChainId, address: string) => `${chainId}:${address.toLowerCase()}`;

// A malformed or mixed-case key would silently never match, leaving the
// contract as bare hex (or an escrow rendering as a position) with no sign
// anything was wrong. A repeated key would let the later entry shadow the first.
const KNOWN_INFRASTRUCTURE = new Map<string, KnownInfrastructure>();
for (const [chainId, address, entry] of ENTRIES) {
  if (!isAddress(address, { strict: false }) || address !== address.toLowerCase())
    throw new Error(`known-infrastructure: malformed address key ${address}`);
  if (KNOWN_INFRASTRUCTURE.has(keyOf(chainId, address)))
    throw new Error(`known-infrastructure: duplicate entry ${chainId}:${address}`);
  KNOWN_INFRASTRUCTURE.set(keyOf(chainId, address), entry);
}

/**
 * The registry entry for an address on a chain, or `undefined` for every real
 * wallet. Callers treat `undefined` as "an ordinary party": chips degrade to
 * ENS or the bare address, rosters keep the row.
 */
export function getKnownInfrastructure(
  address: string | null | undefined,
  chainId: ChainId,
): KnownInfrastructure | undefined {
  if (!address) return undefined;
  return KNOWN_INFRASTRUCTURE.get(keyOf(chainId, address));
}

/** A CCIP custody escrow on Ethereum (Maple's syrup share pools), or `undefined`.
 *  Maple's custody view reads this, never the wider registry: a settlement
 *  contract has no custody to show. */
export function getCcipEscrow(address: string | null | undefined): CcipEscrow | undefined {
  const entry = getKnownInfrastructure(address, MAINNET_CHAIN_ID);
  return entry?.kind === "ccip-lock-release" ? entry : undefined;
}

/** A protocol contract (settlement, router, adapter, gateway, multicall,
 *  amm-pool) on a chain, or `undefined`. */
export function getProtocolContract(
  address: string | null | undefined,
  chainId: ChainId,
): ProtocolContract | undefined {
  const entry = getKnownInfrastructure(address, chainId);
  return entry && entry.kind !== "ccip-lock-release" ? entry : undefined;
}

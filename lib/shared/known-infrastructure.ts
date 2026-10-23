import { isAddress } from "viem";
import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

/**
 * Known contracts that are not positions, keyed by CHAIN and address. Two
 * classes share the registry:
 *
 *   • custody escrows (`ccip-lock-release`) hold protocol tokens for someone
 *     else. A Maple page for one renders the custody view, not a position.
 *   • protocol contracts (settlement, router, adapter, gateway, multicall,
 *     amm-pool, lending-pool, distributor) are what a user's tokens move
 *     through or into on the way to a trade, a swap, an ETH wrap, a loan or a
 *     payout of rewards. A transfer to or from
 *     one keeps its timeline row, and the chip names the contract ("to CoW
 *     Protocol").
 *
 * Neither class is ever a roster position. The server keeps the second class
 * out of its listings from the same rows (rails-server-onboarding mig 227,
 * `protocol_plumbing_contracts`); keep the two lists in step. The build is
 * rails-ops TO-DO-ui-jobs §14. The SyrupRouters and the lending pools are not
 * in the server's table yet: that change is TO-DO-ui-jobs §37.
 *
 * The key carries the chain because an address is only a fact on the chain it
 * was verified on: GPv2Settlement sits at the same address on Ethereum and
 * Base, a WETH gateway does not, and each needs its own evidence.
 *
 * ── Evidence ────────────────────────────────────────────────────────────────
 * An entry is a claim about the on-chain record, so it carries verifiable
 * evidence or it does not exist. Do not add one from a naming pattern, a vanity
 * prefix or a hunch. The sources, in the order consulted (Miles, 2026-10-22):
 *   1. growthepie: its labels file (`api.growthepie.com/v1/labels/full.json`,
 *      the owning project of the busiest 10,000 contracts on its chains) and
 *      the Sourcify attestation in the Open Labels Initiative pool it runs
 *      (`api.openlabelsinitiative.org/attestations?recipient=`, the verified
 *      source name). What it says is GROWTHEPIE_LABELS below, read on
 *      GROWTHEPIE_READ; the receipts credit it as CC BY 4.0 asks ("Source:
 *      growthepie, https://www.growthepie.com"). `scripts/registry-candidate.mjs`
 *      reads it for a new address.
 *   2. Where growthepie has no label, or names no owner: the protocol's own
 *      publication (Aave's address book) and the explorer's verified source
 *      (Etherscan V2 `getsourcecode`). Every entry's `contractName` is that
 *      verified source name, and the build checks growthepie's against it.
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
 *   • Aave's Arbitrum gateway: growthepie labels it `WrappedTokenGatewayV3`,
 *     owner Aave (2026-10-22). It is also the `WETH_GATEWAY` constant of Aave's
 *     address book (`bgd-labs/aave-address-book`, `src/AaveV3Arbitrum.sol`,
 *     2026-10-21) and Arbiscan's "Aave: Wrapped Token Gateway V3 2" (Miles,
 *     2026-10-21). It answers no `name()` or `symbol()`.
 *   • Zerion's router on Base: the OLI pool's Sourcify attestation names it
 *     `Router` (2026-10-22), as does Etherscan V2 for chain 8453 (2026-10-21,
 *     not a proxy). growthepie's labels file names no owner for it, so the
 *     owner rests on Basescan's "Zerion: Router" (Miles, 2026-10-21). It
 *     answers no `name()` or `symbol()`.
 *   • Maple's two SyrupRouters (Etherscan `SyrupRouter`, 2026-10-02) answer
 *     `pool()` with syrupUSDC and syrupUSDT. Every deposit entry point calls
 *     `_deposit(msg.sender, …)`, which deposits into the pool for the router
 *     and transfers the shares to that caller, so a transfer from a router
 *     is the receiving wallet's own deposit.
 *   • The lending pools (Etherscan `Morpho`, `FluidLiquidityProxy`,
 *     2026-10-02) hold their markets' collateral and loans for every user at
 *     once, so they are busy open Maple holders that are nobody's position.
 *   • Batch 1 of item 430 (23 Oct 2026): the plumbing names of the Oct 2026
 *     sweep (rails-ops reference/known-infrastructure-sweep-2026-10) that
 *     carry aToken transfer rows, each deployment read through
 *     `scripts/registry-candidate.mjs`, under Miles's rulings for the batch.
 *   • Behind an ERC1967, beacon or transparent proxy, `contractName` is the
 *     implementation's verified source and `proxyContractName` the proxy's,
 *     which is what the OLI pool attests (Merkl's Distributor, Pendle's
 *     PendleSwap, the AaveAdapters, two FeeCollectors, Omni's FeeManager).
 *   • Merkl's Distributor (Base 0x3ef3…d9ae): growthepie's owner is "Angle
 *     Protocol", kept in its row as read; the display is Merkl, whose
 *     implementation source carries `@author Merkl SAS`.
 *   • Owners named from the verified source's header: Gaslite (GasliteDrop),
 *     Underscore (the Underscore Protocol License on LootDistributor and
 *     RipeLego), LI.FI (`@author LI.FI` on Permit2Proxy 0x6307…b4f9, the
 *     FeeCollector at Base 0x0a6d…2dff and the Executor at Ethereum
 *     0x2dfa…378d; `@title LiFi DEX Aggregator`), Sushi (`@title A route
 *     processor for the Sushi Aggregator`), Eisen, Socket on Base (`@author
 *     Socket Team`), 1inch Fusion (Settlement and SimpleSettlement: "created
 *     by Fusion mode"), Mayan (MayanSwift's EIP-712 domain "Mayan Swift"),
 *     Oku and Rainbow (their `@title`s), 0xbow, Morpho Labs, Omni Exchange
 *     (FeeManager 0x8bbd…7a5d), ParaSwap (FeeClaimer `@author paraswap`), 0x
 *     (FlashWallet, "Copyright ZeroEx Intl."), Laita Labs (Portikus Adapter)
 *     and Uniswap on TokenJar (`@custom:security-contact security@uniswap.org`).
 *   • Owners from the protocol's publication: Aave's address book for
 *     UMBRELLA_BATCH_HELPER and CLINIC_STEWARD; Balancer's balancer-deployments
 *     (v3 vault, base.json) for the Base Vault; DZap's docs for DZapDiamond;
 *     Pendle's pendle-core-v2-public deployments for PendleSwap 0xd4f4…151d;
 *     Uniswap's universal-router deploy-addresses for Universal Routers
 *     0x3fc9…7fad (both chains) and 0x4c82…2cca; Curve's deployment data for
 *     its Base router.
 *   • Owner unstated, so the display is the role: DexAggregator, RelayRouter
 *     and ERC20Router (Relay's relay-periphery lists RelayRouterV3 only),
 *     FeeTaker (its source does not say Fusion), the other fee collectors,
 *     RewardsModule, AssetPool, PoolLiquidityManager, DynamicRoute,
 *     AquaSwapVMRouter, SwiftDest, OpenRouter, SwapRequestCallback,
 *     KyberSwapV3, the remaining Executors and SwapExecutorEth, the V3Utils
 *     growthepie does not label, PendleSwap 0xd4e9…2db0, Universal Router
 *     Base 0x198e…02fc, the AaveAdapters, UniversalUniswapV3Adaptor and
 *     UniV4HookAdapter.
 *   • Pools answer `factory()` with the venue's published factory: Uniswap V3
 *     on Base 0x33128a8fC17869897dcE68Ed026d694621f6FDfD, Uniswap V2 on Base
 *     0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6 (Uniswap's docs), Aerodrome
 *     PoolFactory 0x420DD381b31aEf6683db6B902084cB0FFECe40Da, Slipstream
 *     PoolFactory 0xaDe65c38CD4849aDBA595a4323a8C7DdfE89716a and
 *     0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef (Aerodrome's READMEs),
 *     PancakeSwap V3 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865. The Curve
 *     pools have no `factory()`: Curve's stableswap-ng factory on Base
 *     (0xd2002373543Ce3527023C75e7518C274A51ce712) answers `get_n_coins` for
 *     each. The DODO pool is in DODO's DPPFactory
 *     (0x5336edE8F971339F6c0e304c66ba16F1296A2Fbe) `getDODOPool` list.
 *   • The 0x Settlers: each address is the one 0x's deployer
 *     (0x00000000000004533Fe15556B1E086BB1A72cEae) computes for its feature
 *     and nonce (the README's `computeGenuineSettler`). On 23 Oct the current
 *     Ethereum Settler is 0x0cef…3cd5 and the previous 0x666f…464a; the rest
 *     are retired.
 *   • Name readings: Ethereum's NonfungiblePositionManager is attested in the
 *     pool under both capitalisations; the row keeps Etherscan's. Curve's
 *     router is `CurveRouterSidechain v1.1` on Etherscan and in its `@title`;
 *     Sourcify drops the space. Base 0xdb6f…f498 is 0x's `FlashWallet`
 *     (Etherscan reads its transformer as an implementation). Base
 *     0x78f8…20e0 is `ParaSwapRepayAdapter` on Base, where Ethereum's is the
 *     withdraw swap adapter.
 */
/** growthepie's label for an address, as read on GROWTHEPIE_READ: the owning
 *  project from its labels file (`owner_project_clear`, the project as
 *  growthepie names it) and the verified source name from the Sourcify
 *  attestation in the Open Labels Initiative pool. Either may be absent: the
 *  file holds the busiest contracts only, and a pool with no attestation on
 *  the chain says nothing. */
export interface GrowthepieLabel {
  owner?: string;
  contractName?: string;
}

/** The day GROWTHEPIE_LABELS was read, and the credit CC BY 4.0 asks for. */
export const GROWTHEPIE_READ = "2026-10-23";
export const GROWTHEPIE_ATTRIBUTION = { text: "Source: growthepie", href: "https://www.growthepie.com" };

interface KnownContractBase {
  /** Short display name for party chips, e.g. "CoW Protocol". */
  name: string;
  /** The explorer-verified contract name. */
  contractName: string;
  /** The verified source name of the proxy at the address, where `contractName`
   *  is its implementation's (an `ERC1967Proxy` in front of Merkl's
   *  `Distributor`). The OLI pool's Sourcify name for such an address is this. */
  proxyContractName?: string;
  /** growthepie's label, the registry's first source; absent where it has none.
   *  Attached from GROWTHEPIE_LABELS when the map is built, never set here. */
  growthepie?: GrowthepieLabel;
}

export interface CcipEscrow extends KnownContractBase {
  kind: "ccip-lock-release";
  /** The share token the escrow holds. */
  poolSymbol: string;
  /** One-paragraph factual description for the infra notice page. */
  description: string;
}

export interface ProtocolContract extends KnownContractBase {
  kind: "settlement" | "router" | "adapter" | "gateway" | "multicall" | "amm-pool" | "lending-pool" | "distributor";
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
const syrupRouter = (poolSymbol: string, asset: string): ProtocolContract => ({
  name: `Maple SyrupRouter · ${poolSymbol}`,
  kind: "router",
  contractName: "SyrupRouter",
  protocolIcon: "maple",
  role: `Maple’s SyrupRouter for ${poolSymbol}, which deposits a wallet’s ${asset} into the pool and passes the shares to that wallet in the same transaction`,
});
const MORPHO_BLUE: ProtocolContract = {
  name: "Morpho Blue",
  kind: "lending-pool",
  contractName: "Morpho",
  protocolIcon: "morpho",
  role: "Morpho Blue’s singleton contract, which holds the collateral and the loans of every Morpho Blue market",
};
const FLUID_LIQUIDITY: ProtocolContract = {
  name: "Fluid Liquidity",
  kind: "lending-pool",
  contractName: "FluidLiquidityProxy",
  protocolIcon: "fluid",
  role: "Fluid’s Liquidity contract, which holds the assets of every Fluid vault and lending market",
};
const ENSO: ProtocolContract = {
  name: "Enso shortcuts",
  kind: "router",
  contractName: "EnsoShortcuts",
  role: "Enso’s shortcuts contract, which runs a batch of DeFi actions in one transaction",
};

const distributor = (name: string, contractName: string, role: string): ProtocolContract => ({
  name,
  kind: "distributor",
  contractName,
  role,
});

// ── Batch 1 of item 430: the plumbing with transfer rows ──
// A display name without an owner is a role: no allowed source names one.
const known = (
  kind: ProtocolContract["kind"],
  name: string,
  contractName: string,
  role: string,
  protocolIcon?: string,
): ProtocolContract => ({ name, kind, contractName, role, ...(protocolIcon ? { protocolIcon } : {}) });

const MERKL_DISTRIBUTOR: ProtocolContract = {
  ...distributor(
    "Merkl",
    "Distributor",
    "Merkl’s distributor, which pays out the rewards of Merkl campaigns to the accounts that claim them",
  ),
  proxyContractName: "ERC1967Proxy",
};
const GASLITE_DROP = distributor(
  "Gaslite",
  "GasliteDrop",
  "Gaslite’s bulk-transfer contract, which takes in one sender’s tokens and pays them out to many recipients in one transaction",
);
const UNDERSCORE_LOOT = distributor(
  "Underscore loot distributor",
  "LootDistributor",
  "Underscore’s loot distributor, which collects and pays out the fees and rewards of Underscore wallets",
);
const VAULT_REWARDS_MODULE = distributor(
  "Vault rewards module",
  "RewardsModule",
  "a vault’s rewards module, which claims reward tokens, swaps them and sweeps the proceeds into the vault",
);

const zeroExSettler = (contractName: string) =>
  known(
    "settlement",
    "0x Settler",
    contractName,
    "0x’s Settler, which takes in the tokens a 0x swap sells and pays out the tokens it buys",
  );
const oneInchFusion = (contractName: string) =>
  known(
    "settlement",
    "1inch Fusion",
    contractName,
    "1inch Fusion’s settlement contract, which settles a Fusion limit order between its maker and its resolver",
  );
const ORDER_FEE_TAKER = known(
  "settlement",
  "Order fee taker",
  "FeeTaker",
  "a limit-order extension, which takes a fee from an order as it fills",
);
const feeCollector = (contractName: string) =>
  known(
    "settlement",
    "Fee collector",
    contractName,
    "a fee collector, which receives the fees taken from swaps or orders",
  );
const LIFI_FEE_COLLECTOR = known(
  "settlement",
  "LI.FI fee collector",
  "FeeCollector",
  "LI.FI’s fee collector, which holds the integrator fees taken from LI.FI swaps until they are withdrawn",
);
const OMNI_FEE_MANAGER: ProtocolContract = {
  ...known(
    "settlement",
    "Omni Exchange fee manager",
    "FeeManager",
    "Omni Exchange’s fee manager, which collects the protocol fees of Omni Exchange pools",
  ),
  proxyContractName: "ERC1967Proxy",
};
const AUGUSTUS_FEE_VAULT = known(
  "settlement",
  "Fee vault",
  "AugustusFeeVault",
  "a fee vault, which holds the partner fees of Augustus swaps until the partners claim them",
);
const PARASWAP_FEE_CLAIMER = known(
  "settlement",
  "ParaSwap fee claimer",
  "FeeClaimer",
  "ParaSwap’s fee claimer, which holds the fees of ParaSwap and its partners until they claim them",
  "paraswap",
);
const UNISWAP_TOKEN_JAR = known(
  "settlement",
  "Uniswap fee jar",
  "TokenJar",
  "Uniswap’s TokenJar, which collects protocol fees until an authorised releaser takes them out",
  "uniswap",
);
const LEFTOVER_EXCHANGER = known(
  "settlement",
  "Leftover exchanger",
  "LeftoverExchanger",
  "a leftover exchanger, which sells the dust left over from a filled order",
);

const LIFI_PERMIT2_PROXY = known(
  "router",
  "LI.FI Permit2 proxy",
  "Permit2Proxy",
  "LI.FI’s Permit2 proxy, which takes a wallet’s tokens under a Permit2 signature and passes them to LI.FI’s diamond for a swap or a bridge",
);
const LIFI_DEX_AGGREGATOR = known(
  "router",
  "LI.FI DEX aggregator",
  "LiFiDEXAggregator",
  "LI.FI’s DEX aggregator, which routes a swap across other trading venues",
);
const LIFI_EXECUTOR = known(
  "router",
  "LI.FI executor",
  "Executor",
  "LI.FI’s executor, which runs the calls of a LI.FI cross-chain swap",
);
const DZAP_DIAMOND = known(
  "router",
  "DZap",
  "DZapDiamond",
  "DZap’s diamond, which routes a swap or a bridge across other venues",
);
const RANGO_DIAMOND = known(
  "router",
  "Rango",
  "RangoDiamond",
  "Rango’s diamond, which routes a swap or a bridge across other venues",
);
const SOCKET_GATEWAY = known(
  "router",
  "Socket gateway",
  "SocketGateway",
  "Socket’s gateway, which routes a bridge or a swap through Socket’s liquidity layer",
);
const MAGPIE_V3_1 = router("Magpie router", "MagpieRouterV3_1", "Magpie’s");
const UNISWAP_UNIVERSAL_ROUTER = known(
  "router",
  "Uniswap Universal Router",
  "UniversalRouter",
  "Uniswap’s Universal Router, which routes a swap across Uniswap pools",
  "uniswap",
);
const UNIVERSAL_ROUTER_UNLABELLED = known(
  "router",
  "Swap router",
  "UniversalRouter",
  "a Universal Router deployment, which routes a swap across trading venues",
);
const sushiRouteProcessor = (contractName: string) =>
  known(
    "router",
    "Sushi route processor",
    contractName,
    "Sushi’s route processor, which routes a swap across other trading venues",
  );
const EISEN_FORWARDER = known(
  "router",
  "Eisen forwarder",
  "Forwarder",
  "Eisen’s forwarder, which passes a swap to Eisen’s diamond router",
);
const OKU_ROUTER = known(
  "router",
  "Oku router",
  "OkuRouter",
  "Oku’s swap aggregator, which routes a swap across other trading venues",
);
const RAINBOW_ROUTER = known(
  "router",
  "Rainbow router",
  "RainbowRouter",
  "Rainbow’s swap aggregator, which routes a swap across other trading venues",
);
const CURVE_ROUTER = known(
  "router",
  "Curve router",
  "CurveRouterSidechain v1.1",
  "Curve’s router, which routes a swap across Curve pools",
  "curve",
);
const PENDLE_SWAP: ProtocolContract = {
  ...known(
    "router",
    "Pendle swap",
    "PendleSwap",
    "Pendle’s swap helper, which routes the token leg of a Pendle trade through an aggregator",
    "pendle",
  ),
  proxyContractName: "ERC1967Proxy",
};
const SWAP_AGGREGATOR_HELPER = known(
  "router",
  "Swap helper",
  "PendleSwap",
  "a swap aggregator helper, which routes the token leg of a trade through an aggregator",
);
const MAYAN_SWIFT = known(
  "router",
  "Mayan Swift",
  "MayanSwift",
  "Mayan’s Swift bridge contract, which takes in the tokens of a cross-chain order and releases them on the other side",
);
const SWIFT_DEST = known(
  "router",
  "Cross-chain order contract",
  "SwiftDest",
  "a cross-chain order contract, which releases the tokens of an order filled from another chain",
);
const ZEROEX_FLASH_WALLET = known(
  "router",
  "0x flash wallet",
  "FlashWallet",
  "0x’s flash wallet, which runs the transformers of a 0x Exchange Proxy swap, such as wrapping or unwrapping ETH",
);
const ZEROXBOW_ZAP = known(
  "router",
  "0xbow zap",
  "PPYieldTokenZap",
  "0xbow’s zap, which converts an underlying token to a privacy-pool share in one call",
);
const DEX_AGGREGATOR = known(
  "router",
  "DEX aggregator",
  "DexAggregator",
  "a DEX aggregator router, which routes a swap across other trading venues",
);
const multicallRouter = (contractName: string) =>
  known(
    "router",
    "Multicall router",
    contractName,
    "a multicall router, which runs the calls of a swap or a bridge and passes the output on",
  );
const swapExecutor = (contractName: string, does: string) =>
  known("router", "Swap executor", contractName, `a swap executor, which ${does}`);
const DYNAMIC_ROUTE = known(
  "router",
  "Dynamic route",
  "DynamicRoute",
  "a swap router’s dynamic-route contract, which picks a route at execution time",
);
const SWAPVM_ROUTER = known(
  "router",
  "SwapVM router",
  "AquaSwapVMRouter",
  "a SwapVM router, which runs a swap program against Aqua balances",
);
const OPEN_ROUTER = known(
  "router",
  "Swap router",
  "OpenRouter",
  "a swap router, which pulls tokens, takes a fee and runs the swap or bridge",
);
const SWAP_REQUEST_CALLBACK = known(
  "router",
  "Swap callback",
  "SwapRequestCallback",
  "a swap callback contract, which settles a requested swap",
);

const AAVE_UMBRELLA_BATCH_HELPER = known(
  "adapter",
  "Aave Umbrella",
  "UmbrellaBatchHelper",
  "Aave’s Umbrella batch helper, which wraps supplied aTokens and stakes them in Aave’s Umbrella in one transaction",
  "aave-v3",
);
const AAVE_CLINIC_STEWARD = known(
  "adapter",
  "Aave Clinic Steward",
  "ClinicSteward",
  "Aave’s Clinic Steward, which liquidates bad-debt positions for the Aave DAO and repays what they owe",
  "aave-v3",
);
const MORPHO_MIGRATION_BUNDLER = known(
  "adapter",
  "Morpho migration bundler",
  "AaveV3MigrationBundler",
  "Morpho’s migration bundler, which moves a position from Aave V3 to Morpho Blue in one transaction",
  "morpho",
);
const UNISWAP_V3_POSITIONS = known(
  "adapter",
  "Uniswap V3 positions",
  "NonfungiblePositionManager",
  "Uniswap V3’s position manager, which adds and removes a wallet’s liquidity in Uniswap V3 pools",
  "uniswap-v3",
);
const KRYSTAL_V3_UTILS = known(
  "adapter",
  "Krystal V3 utils",
  "V3Utils",
  "Krystal’s V3 utils, which swaps and moves the liquidity of Uniswap V3 positions",
);
const V3_POSITION_UTILS = known(
  "adapter",
  "V3 position utils",
  "V3Utils",
  "a V3 position utility, which swaps and moves the liquidity of Uniswap V3 positions",
);
const REVERT_AUTO_COMPOUND = known(
  "adapter",
  "Revert auto-compound",
  "AutoCompound",
  "Revert’s auto-compounder, which compounds a Uniswap position’s fees back into it",
);
const UNDERSCORE_RIPE_LEGO = known(
  "adapter",
  "Underscore Ripe lego",
  "RipeLego",
  "an Underscore lego, which runs Ripe lending actions for Underscore wallets",
);
const V3_POOL_ADAPTOR = known(
  "adapter",
  "V3 pool adaptor",
  "UniversalUniswapV3Adaptor",
  "a swap router’s V3 pool adaptor, which trades through Uniswap V3-style pools as one step of a routed swap",
);
const V4_HOOK_ADAPTER = known(
  "adapter",
  "Uniswap V4 adapter",
  "UniV4HookAdapter",
  "a swap router’s Uniswap V4 adapter, which trades through Uniswap V4 as one step of a routed swap",
);
const AAVE_ADAPTER: ProtocolContract = {
  ...known(
    "adapter",
    "Aave adapter",
    "AaveAdapter",
    "an Aave adapter, which supplies to and withdraws from the Pool for its app’s users",
  ),
  proxyContractName: "TransparentUpgradeableProxy",
};
const PORTIKUS_ADAPTER = known(
  "adapter",
  "Portikus adapter",
  "Adapter",
  "Laita Labs’ Portikus adapter, which settles signed swap orders through its modules",
);

const CURVE_STABLESWAP_NG = known(
  "amm-pool",
  "Curve pool",
  "CurveStableSwapNG",
  "a Curve stableswap pool that trades aTokens, holding them as its liquidity",
  "curve",
);
const UNISWAP_V2_PAIR = known(
  "amm-pool",
  "Uniswap V2 pair",
  "UniswapV2Pair",
  "a Uniswap V2 pair that trades aTokens, holding them as its liquidity",
  "uniswap",
);
const PANCAKE_V3_POOL = known(
  "amm-pool",
  "PancakeSwap V3 pool",
  "PancakeV3Pool",
  "a PancakeSwap V3 pool that trades aTokens, holding them as its liquidity",
);
const AERODROME_POOL = known(
  "amm-pool",
  "Aerodrome pool",
  "Pool",
  "an Aerodrome pool that trades aTokens, holding them as its liquidity",
);
const AERODROME_SLIPSTREAM_POOL = known(
  "amm-pool",
  "Aerodrome Slipstream pool",
  "CLPool",
  "an Aerodrome Slipstream pool that trades aTokens, holding them as its liquidity",
);
const DODO_DPP = known(
  "amm-pool",
  "DODO pool",
  "DPPAdvanced",
  "a DODO private pool that trades aTokens, holding them as its liquidity",
);
const BALANCER_V3_VAULT = known(
  "amm-pool",
  "Balancer V3",
  "Vault",
  "Balancer V3’s Vault, the one contract that holds the tokens of every Balancer V3 pool",
  "balancer",
);

const ASSET_POOL = known(
  "lending-pool",
  "Asset pool",
  "AssetPool",
  "a lending protocol’s asset pool, which holds its users’ collateral and pays their interest",
);
const POOL_LIQUIDITY_MANAGER = known(
  "lending-pool",
  "Pool liquidity manager",
  "PoolLiquidityManager",
  "a lending protocol’s liquidity manager, which holds the collateral its liquidity providers post for an asset pool",
);

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
  [MAINNET_CHAIN_ID, "0x134ccaaa4f1e4552ec8aecb9e4a2360ddcf8df76", syrupRouter("syrupUSDC", "USDC")],
  [MAINNET_CHAIN_ID, "0xf007476bb27430795138c511f18f821e8d1e5ee2", syrupRouter("syrupUSDT", "USDT")],
  [MAINNET_CHAIN_ID, "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb", MORPHO_BLUE],
  [MAINNET_CHAIN_ID, "0x52aa899454998be5b000ad077a46bbe360f4e497", FLUID_LIQUIDITY],
  // ── Ethereum, batch 1 (item 430) ──
  [MAINNET_CHAIN_ID, "0x89c6340b1a1f4b25d36cd8b063d49045caf3f818", LIFI_PERMIT2_PROXY],
  [MAINNET_CHAIN_ID, "0x6307119078556fc8ad77781dfc67df20d75fb4f9", LIFI_PERMIT2_PROXY],
  [MAINNET_CHAIN_ID, "0xce6ced23118edeb23054e06118a702797b13fc2f", AAVE_UMBRELLA_BATCH_HELPER],
  [MAINNET_CHAIN_ID, "0xa6e941eab67569ca4522f70d343714ff51d571c4", MAGPIE_V3_1],
  [MAINNET_CHAIN_ID, "0x7f54f05635d15cde17a49502fedb9d1803a3be8a", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0xf48a3f7c0575c85cf4529aa220caf3c055773f1c", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0x666fedd4cdd4e890a5ad20e7b60975409435a64a", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0x207e1074858a7e78f17002075739ed2745dbaece", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0x5a1b2acd0c9992e14f2b6d8a326023e35a097a3a", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0xc92814c1974355122a8a43781a090552634ee567", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0x0cef320d0c5793ade37964e2661a033771e53cd5", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0xdf31a70a21a1931e02033dbba7deace6c45cfd0f", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0x0d0e364aa7852291883c162b22d6d81f6355428f", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0x1f560aee3d0c615f51466dcd9a312cfa858271a5", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0x5418226af9c8d5d287a78fbbbcd337b86ec07d61", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0x82d88875d64d60cbe9cbea47cb960ae0f04ebd4d", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0xd07c4f45bc9b389d286cb094f97bb6ba45f4bb30", zeroExSettler("MainnetSettler")],
  [MAINNET_CHAIN_ID, "0xf5042e6ffac5a625d4e7848e0b01373d8eb9e222", multicallRouter("RelayRouter")],
  [MAINNET_CHAIN_ID, "0x3a23f943181408eac424116af7b7790c94cb97a5", SOCKET_GATEWAY],
  [MAINNET_CHAIN_ID, "0x6747bcaf9bd5a5f0758cbe08903490e45ddfacb5", V3_POOL_ADAPTOR],
  [MAINNET_CHAIN_ID, "0x66a9893cc07d91d95644aedd05d03f95e1dba8af", UNISWAP_UNIVERSAL_ROUTER],
  [MAINNET_CHAIN_ID, "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", UNISWAP_UNIVERSAL_ROUTER],
  [MAINNET_CHAIN_ID, "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca", UNISWAP_UNIVERSAL_ROUTER],
  [MAINNET_CHAIN_ID, "0xc36442b4a4522e871399cd717abdd847ab11fe88", UNISWAP_V3_POSITIONS],
  [MAINNET_CHAIN_ID, "0x399740157391a9f1bf4e9921a8834f9bc8f2678e", oneInchFusion("SimpleSettlement")],
  [MAINNET_CHAIN_ID, "0xf00e2de0e78dff055a92ad4719a179ce275b6ef7", AAVE_CLINIC_STEWARD],
  [MAINNET_CHAIN_ID, "0xc0dfdb9e7a392c3dbbe7c6fbe8fbc1789c9fe05e", ORDER_FEE_TAKER],
  [MAINNET_CHAIN_ID, "0x2ad5004c60e16e54d5007c80ce329adde5b51ef5", oneInchFusion("Settlement")],
  [MAINNET_CHAIN_ID, "0x32025e0b37a79fa023112ade129ff8e22d7f7a55", VAULT_REWARDS_MODULE],
  [MAINNET_CHAIN_ID, "0xb91005d00b12f13ae0e7d4f8b359447abe254dcf", VAULT_REWARDS_MODULE],
  [MAINNET_CHAIN_ID, "0x9122cdb01a405b3fe8d76445b498fa0495b0583b", VAULT_REWARDS_MODULE],
  [MAINNET_CHAIN_ID, "0x29054fc109e4746047ddc6124e6db0ceae24ab50", VAULT_REWARDS_MODULE],
  [MAINNET_CHAIN_ID, "0x40f86c0845c37f3e55eeac0b0442b9089bfb41fb", VAULT_REWARDS_MODULE],
  [MAINNET_CHAIN_ID, "0xcd17ed9fc6ef741e27f0ff3909855bc6dc9a2ef5", VAULT_REWARDS_MODULE],
  [MAINNET_CHAIN_ID, "0x0b8c700917a6991fea7198ddfc80bc8962b5055d", WETH_GATEWAY],
  [MAINNET_CHAIN_ID, "0x22ecf2bed494976503a8087add30e134c30fbd98", DYNAMIC_ROUTE],
  [MAINNET_CHAIN_ID, "0x69a52a0570636ca391175ce619bbb9d348040bbc", DYNAMIC_ROUTE],
  [MAINNET_CHAIN_ID, "0x111111338c5091e8440b67b168bae16a668ac0de", SWAPVM_ROUTER],
  [MAINNET_CHAIN_ID, "0xb4acbc082b5e7ded571c98ee4257778a9d784b36", V3_POSITION_UTILS],
  [MAINNET_CHAIN_ID, "0xab52f8c11e72d00d4f717a657378ef9b8bf7c2b6", V3_POSITION_UTILS],
  [MAINNET_CHAIN_ID, "0x410b72ccfeacbb20a31785edaa358d25a07e143d", V3_POSITION_UTILS],
  [MAINNET_CHAIN_ID, "0xd4f480965d2347d421f1bec7f545682e5ec2151d", PENDLE_SWAP],
  [MAINNET_CHAIN_ID, "0xc8a351f33dfeed5972a78c4b2d671f20a8a47e40", DODO_DPP],
  [MAINNET_CHAIN_ID, "0x33c1eef370bbb447414156cfc4fdabd434776eaf", ZEROXBOW_ZAP],
  [MAINNET_CHAIN_ID, "0x98ccb155e86bb478d514a827d16f58c6912f9bdc", MORPHO_MIGRATION_BUNDLER],
  [MAINNET_CHAIN_ID, "0xd78d199f8c402e7b5cc2abe278df0412400a3bae", SWIFT_DEST],
  [MAINNET_CHAIN_ID, "0x8feab81d36e7576107d5de0758c1b839be31b4f6", router("OKX DEX router", "DexRouter", "OKX’s DEX")],
  [MAINNET_CHAIN_ID, "0x7e1064c62f7118cdcd7d9248e4b741169d3e234e", AAVE_ADAPTER],
  [MAINNET_CHAIN_ID, "0xeb8094c169bf5d365ec1ae76ab4a5fa61345caaf", AAVE_ADAPTER],
  [MAINNET_CHAIN_ID, "0x9ffdde9a1686870cf619869a225eb1d0e20b53e6", AAVE_ADAPTER],
  [MAINNET_CHAIN_ID, "0x2dfadab8266483bed9fd9a292ce56596a2d1378d", LIFI_EXECUTOR],
  [
    MAINNET_CHAIN_ID,
    "0x4296339b4ff8e67f07de40d97a49a680f2598e0f",
    swapExecutor("Executor", "trades through Uniswap pools as one step of a routed swap"),
  ],
  // ── Base ──
  [BASE_CHAIN_ID, "0x9008d19f58aabd9ed0d60971565aa8510560ab41", COW],
  [BASE_CHAIN_ID, "0xa0d9c1e9e48ca30c8d8c3b5d69ff5dc1f6dffc24", WETH_GATEWAY],
  [BASE_CHAIN_ID, "0x18cd499e3d7ed42feba981ac9236a278e4cdc2ee", WETH_GATEWAY],
  [BASE_CHAIN_ID, "0x8be473dcfa93132658821e67cbeb684ec8ea2e74", WETH_GATEWAY],
  [BASE_CHAIN_ID, "0x729b3ea8c005abc58c9150fb57ec161296f06766", WETH_GATEWAY],
  [BASE_CHAIN_ID, "0xaeeb3898ede6a6e86864688383e211132baa1af3", WETH_GATEWAY],
  [BASE_CHAIN_ID, "0x2e549104c516b8657a7d888494dfbabd7c70b464", PARASWAP_LIQUIDITY_SWAP],
  [BASE_CHAIN_ID, "0x63dfa7c09dc2ff4030d6b8dc2ce6262bf898c8a4", PARASWAP_REPAY],
  [BASE_CHAIN_ID, "0x78f8bd884c3d738b74b420540659c82f392820e0", PARASWAP_REPAY],
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
  [BASE_CHAIN_ID, "0xd7f1dd5d49206349cae8b585fcb0ce3d96f1696f", router("Zerion router", "Router", "Zerion’s")],
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
  // ── Base, batch 1 (item 430) ──
  [BASE_CHAIN_ID, "0x3ef3d8ba38ebe18db133cec108f4d14ce00dd9ae", MERKL_DISTRIBUTOR],
  [BASE_CHAIN_ID, "0x89c6340b1a1f4b25d36cd8b063d49045caf3f818", LIFI_PERMIT2_PROXY],
  [BASE_CHAIN_ID, "0x6307119078556fc8ad77781dfc67df20d75fb4f9", LIFI_PERMIT2_PROXY],
  [BASE_CHAIN_ID, "0x09350f89e2d7b6e96ba730783c2d76137b045fef", GASLITE_DROP],
  [BASE_CHAIN_ID, "0x2ed6784df2ea89026c600f3b2e59a606852b094a", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0x299743334e3fe497e3c765245e8f7e64ca58684d", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0x150707587e068eee4383de08d81c58b46c560a28", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0x48d51f83a9a4e400d813e8d26b1e5833c5b08f5a", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0x5e028e91688b3d9977335352817eb7745a3c480b", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0xbdf1b0bfe9d94c484979b58ea4929fab5fed9ae0", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0xa91eb81824a07f6b16eedaefd5a6c5a7c95bf7e1", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0x1ce115ad8ec223c8feb2456687b422f87390f6e3", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0xe152b19bb6b23f00a07388376bb568acdd564833", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0x81f80ff6d7666be054361c28b159f5a27b1fcf9c", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0xfe7b86f50fba35ce0361830e83b562653f417b66", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0x470abe33af209ac603fcb6b78a49e4fcd3b764a7", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0x2d2d4b4e4bbd4cf89e2d344479296a7355f23631", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0x87a3f75deec0dd8e3fd904b8456a157625b2816e", UNISWAP_V3_POOL],
  [BASE_CHAIN_ID, "0xf708e11a7c94abde8f6217b13e6fe39c8b9cc0a6", DZAP_DIAMOND],
  [BASE_CHAIN_ID, "0x5e766616aabfb588e23a8ea854e9dbd1042affd3", MAGPIE_V3_1],
  [BASE_CHAIN_ID, "0xef975bb55c6bc6767963b37dd150ee7048bd8b71", CURVE_STABLESWAP_NG],
  [BASE_CHAIN_ID, "0x915dcef92cf0c5fba056b57a7b6ced217378acb7", CURVE_STABLESWAP_NG],
  [BASE_CHAIN_ID, "0x365e957364f52d02b46e6ea1d1dcbfb10cecc555", CURVE_STABLESWAP_NG],
  [BASE_CHAIN_ID, "0x71231a87da64b083d49e14f278c1842ae662f335", CURVE_STABLESWAP_NG],
  [BASE_CHAIN_ID, "0xd2625df940a04b5ef69533d72e7e8565fa9d64d1", CURVE_STABLESWAP_NG],
  [BASE_CHAIN_ID, "0x4c86d266e969e186a2f197d859df2d91e5ea1ed2", CURVE_STABLESWAP_NG],
  [BASE_CHAIN_ID, "0x7747f8d2a76bd6345cc29622a946a929647f2359", zeroExSettler("BaseSettler")],
  [BASE_CHAIN_ID, "0xdc5d8200a030798bc6227240f68b4dd9542686ef", zeroExSettler("BaseSettler")],
  [BASE_CHAIN_ID, "0xf525ff21c370beb8d9f5c12dc0da2b583f4b949f", zeroExSettler("BaseSettler")],
  [BASE_CHAIN_ID, "0xea758cac6115309b325c582fd0782d79e3502177", zeroExSettler("BaseSettler")],
  [BASE_CHAIN_ID, "0xcaf2da315f5a5499299a312b8a86faafe4bad959", zeroExSettler("BaseSettler")],
  [BASE_CHAIN_ID, "0x785648669b8e90a75a6a8de682258957f9028462", zeroExSettler("BaseSettler")],
  [BASE_CHAIN_ID, "0x47146d81b68b737316d0636d5135849d364bb0c8", zeroExSettler("BaseSettler")],
  [BASE_CHAIN_ID, "0x5c9bdc801a600c006c388fc032dcb27355154cc9", zeroExSettler("BaseSettler")],
  [BASE_CHAIN_ID, "0x49fb9c16b9b2a19452633573603c837673fd7e04", zeroExSettler("BaseSettler")],
  [BASE_CHAIN_ID, "0xbc3c5ca50b6a215edf00815965485527f26f5da8", zeroExSettler("BaseSettler")],
  [BASE_CHAIN_ID, "0x6a57a0579e91a5b7ce9c2d08b93e1a9b995f974f", zeroExSettler("BaseSettler")],
  [BASE_CHAIN_ID, "0x20f6ee51340adeed01a59b0e65cb3703f3dc860c", DEX_AGGREGATOR],
  [BASE_CHAIN_ID, "0xf5042e6ffac5a625d4e7848e0b01373d8eb9e222", multicallRouter("RelayRouter")],
  [BASE_CHAIN_ID, "0x3a23f943181408eac424116af7b7790c94cb97a5", SOCKET_GATEWAY],
  [BASE_CHAIN_ID, "0x411d2c093e4c2e69bf0d8e94be1bf13dadd879c6", V3_POOL_ADAPTOR],
  [BASE_CHAIN_ID, "0xa0a342329d2ddbc1a3b8fa791223e1ebd61fb30e", UNDERSCORE_LOOT],
  [BASE_CHAIN_ID, "0x18deb1fdacd88222859b2809d5b6966be5bc5c5d", UNDERSCORE_LOOT],
  [BASE_CHAIN_ID, "0xedca7ed2248928349fb9c9289b48471bbdddee87", UNDERSCORE_LOOT],
  [BASE_CHAIN_ID, "0x2004c2293f9decca292934fa773f56860624b234", UNDERSCORE_LOOT],
  [
    BASE_CHAIN_ID,
    "0x90cbe4bdd538d6e9b379bff5fe72c3d67a521de5",
    { ...feeCollector("FeeCollector"), proxyContractName: "BeaconProxy" },
  ],
  [BASE_CHAIN_ID, "0x0a6d96e7f4d7b96cfe42185df61e64d255c12dff", LIFI_FEE_COLLECTOR],
  [BASE_CHAIN_ID, "0x5d64d14d2cf4fe5fe4e65b1c7e3d11e18d493091", feeCollector("FeeCollector")],
  [BASE_CHAIN_ID, "0x067170777ba8027ced27e034102d54074d062d71", feeCollector("FeeCollector")],
  [
    BASE_CHAIN_ID,
    "0x3c8b6ff2eb679f0a69c98af2aab62260ba247cb3",
    { ...feeCollector("FeeCollector"), proxyContractName: "BeaconProxy" },
  ],
  [BASE_CHAIN_ID, "0x1337b8af481f3d7d245de35dffcf30b825c20836", feeCollector("FeeCollector")],
  [BASE_CHAIN_ID, "0xc8b4ee80f20df7a9905e88d04b5d3c21aadb6f11", UNISWAP_V2_PAIR],
  [BASE_CHAIN_ID, "0x4674fdd409d00d6a67aca97b6f70d45e5ee07300", UNISWAP_V2_PAIR],
  [BASE_CHAIN_ID, "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", UNISWAP_UNIVERSAL_ROUTER],
  [BASE_CHAIN_ID, "0x6ff5693b99212da76ad316178a184ab56d299b43", UNISWAP_UNIVERSAL_ROUTER],
  [BASE_CHAIN_ID, "0x198ef79f1f515f02dfe9e3115ed9fc07183f02fc", UNIVERSAL_ROUTER_UNLABELLED],
  [
    BASE_CHAIN_ID,
    "0x954339759d876e06df67e0814158e15012442310",
    swapExecutor("SwapExecutorEth", "runs a token swap and pays out the proceeds"),
  ],
  [BASE_CHAIN_ID, "0xf2614a233c7c3e7f08b1f887ba133a13f1eb2c55", sushiRouteProcessor("RouteProcessor5")],
  [BASE_CHAIN_ID, "0x81bbba46b9fcf04ab13314136b895b15291f0462", EISEN_FORWARDER],
  [BASE_CHAIN_ID, "0xc0dfdb9e7a392c3dbbe7c6fbe8fbc1789c9fe05e", ORDER_FEE_TAKER],
  [BASE_CHAIN_ID, "0xca5b851b28d756eb21dedcea9bacea6e18dd5ecf", ASSET_POOL],
  [BASE_CHAIN_ID, "0x0a0aa770bfd1f23ef5a9ab44a29e3d064c585bc4", ASSET_POOL],
  [BASE_CHAIN_ID, "0xeb60ea4c89c4c7582478592d234f765dea0e9ee6", ASSET_POOL],
  [BASE_CHAIN_ID, "0x6140b987d6b51fd75b66c3b07733beb5167c42fc", LIFI_DEX_AGGREGATOR],
  [BASE_CHAIN_ID, "0x9caab1750104147c9872772b3d0be3d4290e1e86", LIFI_DEX_AGGREGATOR],
  [BASE_CHAIN_ID, "0x8189afcc5b73dc90600fee92e5267aff1d192884", LIFI_DEX_AGGREGATOR],
  [BASE_CHAIN_ID, "0x69460570c93f9de5e2edbc3052bf10125f0ca22d", RANGO_DIAMOND],
  [BASE_CHAIN_ID, "0xba1333333333a1ba1108e8412f11850a5c319ba9", BALANCER_V3_VAULT],
  [BASE_CHAIN_ID, "0x69a52a0570636ca391175ce619bbb9d348040bbc", DYNAMIC_ROUTE],
  [BASE_CHAIN_ID, "0x22ecf2bed494976503a8087add30e134c30fbd98", DYNAMIC_ROUTE],
  [BASE_CHAIN_ID, "0x03a520b32c04bf3beef7beb72e919cf822ed34f1", UNISWAP_V3_POSITIONS],
  [BASE_CHAIN_ID, "0x8f7bcccc0efeca85b103d9783055704e37e40f2c", feeCollector("TokenChomper")],
  [BASE_CHAIN_ID, "0xca226bd9c754f1283123d32b2a7cf62a722f8ada", feeCollector("TokenChomper")],
  [BASE_CHAIN_ID, "0xdb6f1920a889355780af7570773609bd8cb1f498", ZEROEX_FLASH_WALLET],
  [BASE_CHAIN_ID, "0x6c0297c6007db1e1ec88df92d2302374bcb72ec0", POOL_LIQUIDITY_MANAGER],
  [BASE_CHAIN_ID, "0x51911a803133f7e9d2d4495597192918672149b7", POOL_LIQUIDITY_MANAGER],
  [BASE_CHAIN_ID, "0xf64b827d8bd6f6857c33d981cc868a1860078bf9", POOL_LIQUIDITY_MANAGER],
  [BASE_CHAIN_ID, "0x00700052c0608f670705380a4900e0a8080010cc", AUGUSTUS_FEE_VAULT],
  [BASE_CHAIN_ID, "0xeeeeee9ec4769a09a76a83c7bc42b185872860ee", multicallRouter("ERC20Router")],
  [BASE_CHAIN_ID, "0xb4acbc082b5e7ded571c98ee4257778a9d784b36", KRYSTAL_V3_UTILS],
  [BASE_CHAIN_ID, "0x16c6346916eef89fd2c2fb7da61da8825948ec93", V3_POSITION_UTILS],
  [BASE_CHAIN_ID, "0x98ec492942090364ac0736ef1a741ae6c92ec790", V3_POSITION_UTILS],
  [BASE_CHAIN_ID, "0xb0717286fca964cb7315a95a003e1c3f0313b6de", V3_POSITION_UTILS],
  [BASE_CHAIN_ID, "0xc38e4e6a15593f908255214653d3d947ca1c2338", MAYAN_SWIFT],
  [BASE_CHAIN_ID, "0x4f37a9d177470499a2dd084621020b023fcffc1f", CURVE_ROUTER],
  [BASE_CHAIN_ID, "0xd4f480965d2347d421f1bec7f545682e5ec2151d", PENDLE_SWAP],
  [BASE_CHAIN_ID, "0xd4e9b0d466789d7f6201442eeccba6a75a552db0", SWAP_AGGREGATOR_HELPER],
  [BASE_CHAIN_ID, "0xb1f3a7b816b0681188f54dfa400991b93adf00ed", OKU_ROUTER],
  [BASE_CHAIN_ID, "0xfd78ba0f717223bebe555a777b70b86667837ff6", V4_HOOK_ADAPTER],
  [BASE_CHAIN_ID, "0x50cfe7c1938db66a1a6d2e86d36f39fbef3d5c4a", OPEN_ROUTER],
  [BASE_CHAIN_ID, "0x00000000009726632680fb29d3f7a9734e3010e2", RAINBOW_ROUTER],
  [BASE_CHAIN_ID, "0x0bf485bd7ebb82e282f72e7d14822c680e3f7bec", REVERT_AUTO_COMPOUND],
  [BASE_CHAIN_ID, "0xd0389e84178f809903cbfe7d1efae3efa9c1769c", SWAP_REQUEST_CALLBACK],
  [BASE_CHAIN_ID, "0x6b6e87d2cc438c287a5550a8732c302454e4382b", zeroExSettler("BaseSettlerIntent")],
  [BASE_CHAIN_ID, "0x07d889ebae9e9203a0443edba3cb5ca499c4cef1", zeroExSettler("BaseSettlerIntent")],
  [BASE_CHAIN_ID, "0x7beaec7ea579c656f4272e409b6bfda9f8ad8941", zeroExSettler("BaseSettlerIntent")],
  [BASE_CHAIN_ID, "0xff11500b35a3e48a298bcd6139b9a3d9c369537e", zeroExSettler("BaseSettlerIntent")],
  [BASE_CHAIN_ID, "0x0389879e0156033202c44bf784ac18fc02edee4f", sushiRouteProcessor("RouteProcessor4")],
  [BASE_CHAIN_ID, "0xc402449f5dd3781d08cb357d9709505fda8f3696", UNDERSCORE_RIPE_LEGO],
  [BASE_CHAIN_ID, "0x8c4068a3f45159dfe548b573adee7fb1451502e2", UNDERSCORE_RIPE_LEGO],
  [BASE_CHAIN_ID, "0xf93191d350117723dbeda5484a3b0996d285cecf", feeCollector("FeeManager")],
  [BASE_CHAIN_ID, "0x8bbd5a66b962409ae0f7ebdc120e9629f1077a5d", OMNI_FEE_MANAGER],
  [BASE_CHAIN_ID, "0x9aab4b24541af30fd72784ed98d8756ac0efb3c7", PARASWAP_FEE_CLAIMER],
  [BASE_CHAIN_ID, "0x9bd25e67bf390437c8faf480ac735a27bcf6168c", UNISWAP_TOKEN_JAR],
  [BASE_CHAIN_ID, "0xa9df6949a2ac22855b24f3452a765e6e9a9f93cb", AERODROME_POOL],
  [BASE_CHAIN_ID, "0x930415e302c737bda5956950a12de90e93e4e913", AERODROME_POOL],
  [BASE_CHAIN_ID, "0xfd73a3143c6c95a90e043cc13356532b91916ed4", AERODROME_POOL],
  [BASE_CHAIN_ID, "0x80b76d8a71fe78b4a1b5634f640a4d8483e667ee", AERODROME_POOL],
  [BASE_CHAIN_ID, "0x9f5ad305421c1922888c85a792b3572ab9764694", AERODROME_POOL],
  [BASE_CHAIN_ID, "0x2d66f1a8af83f5686810124f984385421f42687b", AERODROME_POOL],
  [BASE_CHAIN_ID, "0x4161330dacb3ff3e9d12bac2d74998325e7628cd", AERODROME_POOL],
  [BASE_CHAIN_ID, "0x9bac1ac25aeb572f3becbdd22ccf3c34544d4565", AERODROME_POOL],
  [BASE_CHAIN_ID, "0xb01f8f528702d411d24c9bb8cc0e2fff779ec013", LEFTOVER_EXCHANGER],
  [
    BASE_CHAIN_ID,
    "0xfd3808ac5791bc0decef2354c3c670f90ea7ca8d",
    swapExecutor("KyberSwapV3", "trades through KyberSwap as one step of a routed swap"),
  ],
  [
    BASE_CHAIN_ID,
    "0x7c137a37742437d2212b7bd873ed135b5c4c61da",
    swapExecutor("Executor", "trades through Uniswap pools as one step of a routed swap"),
  ],
  [BASE_CHAIN_ID, "0x1fc0b57bb5b94be64d21d9ffb19cb1100b408458", AERODROME_SLIPSTREAM_POOL],
  [BASE_CHAIN_ID, "0x343ba99d5a2e5caf5018384d9f8edf01aca661e0", AERODROME_SLIPSTREAM_POOL],
  [BASE_CHAIN_ID, "0x057896b3a29ae6eee458b65413f8b7e3ea984889", AERODROME_SLIPSTREAM_POOL],
  [BASE_CHAIN_ID, "0x0000000000bbf5c5fd284e657f01bd000933c96d", PORTIKUS_ADAPTER],
  [BASE_CHAIN_ID, "0xc894ba28451cd225a73bf704e6719c1cec9de791", PANCAKE_V3_POOL],
  // ── Arbitrum ──
  [ARBITRUM_CHAIN_ID, "0x5283beced7adf6d003225c13896e536f2d4264ff", WETH_GATEWAY],
];

// What growthepie says about each entry, read on GROWTHEPIE_READ:
// [chain, address, owner from the labels file, contract name from the OLI
// pool's Sourcify attestation]. `null` where that source has nothing. An entry
// absent here (90 of them on 23 Oct 2026, among them the syrupUSDT escrow, the
// first five Uniswap V3 pools, the PancakeSwap pair, Magpie's MagpieRouterCore,
// Enso 0x7d58…6994 and the multicall) rests on the fallback sources alone.
const GROWTHEPIE_LABELS: [ChainId, string, string | null, string | null][] = [
  // ── Ethereum ──
  [MAINNET_CHAIN_ID, "0x20b79d39bd44deee4f89b1e9d0e3b945fde06491", null, "LockReleaseTokenPool"],
  [MAINNET_CHAIN_ID, "0x9008d19f58aabd9ed0d60971565aa8510560ab41", "CowSwap", "GPv2Settlement"],
  [MAINNET_CHAIN_ID, "0xd01607c3c5ecaba394d8be377a08590149325722", "Aave", "WrappedTokenGatewayV3"],
  [MAINNET_CHAIN_ID, "0x893411580e590d62ddbca8a703d61cc4a8c7b2b9", null, "WrappedTokenGatewayV3"],
  [MAINNET_CHAIN_ID, "0xa434d495249abe33e031fe71a969b81f3c07950d", null, "WrappedTokenGatewayV3"],
  [MAINNET_CHAIN_ID, "0xd322a49006fc828f9b5b37ab215f99b4e5cab19c", null, "WrappedTokenGatewayV3"],
  [MAINNET_CHAIN_ID, "0x35bb522b102326ea3f1141661df4626c87000e3e", null, "ParaSwapRepayAdapter"],
  [MAINNET_CHAIN_ID, "0x02e7b8511831b1b02d9018215a0f8f500ea5c6b3", null, "ParaSwapRepayAdapter"],
  [MAINNET_CHAIN_ID, "0xadc0a53095a0af87f3aa29fe0715b5c28016364e", null, "ParaSwapLiquiditySwapAdapter"],
  [MAINNET_CHAIN_ID, "0x872fbcb1b582e8cd0d0dd4327fbfa0b4c2730995", null, "ParaSwapLiquiditySwapAdapter"],
  [MAINNET_CHAIN_ID, "0x78f8bd884c3d738b74b420540659c82f392820e0", null, "ParaSwapWithdrawSwapAdapter"],
  [MAINNET_CHAIN_ID, "0x1809f186d680f239420b56948c58f8dbbcdf1e18", null, "ParaSwapRepayAdapter"],
  [MAINNET_CHAIN_ID, "0x66e1abdb06e7363a618d65a910c540dfed23754f", null, "ParaSwapRepayAdapter"],
  [MAINNET_CHAIN_ID, "0xd0eae3b730ae736614c66cb40afd1e0063f74286", null, "ParaSwapRepayAdapter"],
  [MAINNET_CHAIN_ID, "0xd0887aa7febc8962c622493646195e7c76d94fce", null, "ParaSwapLiquiditySwapAdapter"],
  [MAINNET_CHAIN_ID, "0xd7852e139a7097e119623de0751ae53a61efb442", null, "ParaSwapDebtSwapAdapterV3GHO"],
  [MAINNET_CHAIN_ID, "0x8761e0370f94f68db8eaa731f4fc581f6ad0bd68", null, "ParaSwapDebtSwapAdapterV3GHO"],
  [MAINNET_CHAIN_ID, "0x8f30adaa6950b31f675bf8a709bc23f55aa24735", null, "ParaSwapDebtSwapAdapterV3GHO"],
  [MAINNET_CHAIN_ID, "0xd1b2dec98a95b773c4909b5cd8fb455f467a527f", null, "ParaSwapDebtSwapAdapterV3"],
  [MAINNET_CHAIN_ID, "0x000000000004444c5dc75cb358380d2e3de08a90", "Uniswap", "PoolManager"],
  [MAINNET_CHAIN_ID, "0x134ccaaa4f1e4552ec8aecb9e4a2360ddcf8df76", null, "SyrupRouter"],
  [MAINNET_CHAIN_ID, "0xf007476bb27430795138c511f18f821e8d1e5ee2", null, "SyrupRouter"],
  [MAINNET_CHAIN_ID, "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb", "Morpho", "Morpho"],
  [MAINNET_CHAIN_ID, "0x52aa899454998be5b000ad077a46bbe360f4e497", null, "FluidLiquidityProxy"],
  // ── Ethereum, batch 1 (item 430) ──
  [MAINNET_CHAIN_ID, "0x89c6340b1a1f4b25d36cd8b063d49045caf3f818", "LI.FI", null],
  [MAINNET_CHAIN_ID, "0x6307119078556fc8ad77781dfc67df20d75fb4f9", null, "Permit2Proxy"],
  [MAINNET_CHAIN_ID, "0xce6ced23118edeb23054e06118a702797b13fc2f", null, "UmbrellaBatchHelper"],
  [MAINNET_CHAIN_ID, "0xa6e941eab67569ca4522f70d343714ff51d571c4", null, "MagpieRouterV3_1"],
  [MAINNET_CHAIN_ID, "0xf48a3f7c0575c85cf4529aa220caf3c055773f1c", null, "MainnetSettler"],
  [MAINNET_CHAIN_ID, "0x207e1074858a7e78f17002075739ed2745dbaece", null, "MainnetSettler"],
  [MAINNET_CHAIN_ID, "0x5a1b2acd0c9992e14f2b6d8a326023e35a097a3a", null, "MainnetSettler"],
  [MAINNET_CHAIN_ID, "0xc92814c1974355122a8a43781a090552634ee567", null, "MainnetSettler"],
  [MAINNET_CHAIN_ID, "0xdf31a70a21a1931e02033dbba7deace6c45cfd0f", null, "MainnetSettler"],
  [MAINNET_CHAIN_ID, "0x0d0e364aa7852291883c162b22d6d81f6355428f", null, "MainnetSettler"],
  [MAINNET_CHAIN_ID, "0x1f560aee3d0c615f51466dcd9a312cfa858271a5", null, "MainnetSettler"],
  [MAINNET_CHAIN_ID, "0x5418226af9c8d5d287a78fbbbcd337b86ec07d61", null, "MainnetSettler"],
  [MAINNET_CHAIN_ID, "0x82d88875d64d60cbe9cbea47cb960ae0f04ebd4d", null, "MainnetSettler"],
  [MAINNET_CHAIN_ID, "0xd07c4f45bc9b389d286cb094f97bb6ba45f4bb30", null, "MainnetSettler"],
  [MAINNET_CHAIN_ID, "0x3a23f943181408eac424116af7b7790c94cb97a5", "Socket", "SocketGateway"],
  [MAINNET_CHAIN_ID, "0x66a9893cc07d91d95644aedd05d03f95e1dba8af", "Uniswap", "UniversalRouter"],
  [MAINNET_CHAIN_ID, "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", null, "UniversalRouter"],
  [MAINNET_CHAIN_ID, "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca", "Uniswap", null],
  [MAINNET_CHAIN_ID, "0xc36442b4a4522e871399cd717abdd847ab11fe88", "Uniswap", "NonfungiblePositionManager"],
  [MAINNET_CHAIN_ID, "0x2ad5004c60e16e54d5007c80ce329adde5b51ef5", null, "Settlement"],
  [MAINNET_CHAIN_ID, "0x29054fc109e4746047ddc6124e6db0ceae24ab50", null, "RewardsModule"],
  [MAINNET_CHAIN_ID, "0x40f86c0845c37f3e55eeac0b0442b9089bfb41fb", null, "RewardsModule"],
  [MAINNET_CHAIN_ID, "0xcd17ed9fc6ef741e27f0ff3909855bc6dc9a2ef5", null, "RewardsModule"],
  [MAINNET_CHAIN_ID, "0x0b8c700917a6991fea7198ddfc80bc8962b5055d", null, "WrappedTokenGatewayV3"],
  [MAINNET_CHAIN_ID, "0xb4acbc082b5e7ded571c98ee4257778a9d784b36", null, "V3Utils"],
  [MAINNET_CHAIN_ID, "0xab52f8c11e72d00d4f717a657378ef9b8bf7c2b6", null, "V3Utils"],
  [MAINNET_CHAIN_ID, "0x410b72ccfeacbb20a31785edaa358d25a07e143d", null, "V3Utils"],
  [MAINNET_CHAIN_ID, "0xd4f480965d2347d421f1bec7f545682e5ec2151d", null, "ERC1967Proxy"],
  [MAINNET_CHAIN_ID, "0x98ccb155e86bb478d514a827d16f58c6912f9bdc", null, "AaveV3MigrationBundler"],
  [MAINNET_CHAIN_ID, "0x8feab81d36e7576107d5de0758c1b839be31b4f6", "OKX", null],
  [MAINNET_CHAIN_ID, "0x7e1064c62f7118cdcd7d9248e4b741169d3e234e", null, "TransparentUpgradeableProxy"],
  [MAINNET_CHAIN_ID, "0xeb8094c169bf5d365ec1ae76ab4a5fa61345caaf", null, "TransparentUpgradeableProxy"],
  [MAINNET_CHAIN_ID, "0x9ffdde9a1686870cf619869a225eb1d0e20b53e6", null, "TransparentUpgradeableProxy"],
  [MAINNET_CHAIN_ID, "0x2dfadab8266483bed9fd9a292ce56596a2d1378d", null, "Executor"],
  // ── Base ──
  [BASE_CHAIN_ID, "0x9008d19f58aabd9ed0d60971565aa8510560ab41", "CowSwap", "GPv2Settlement"],
  [BASE_CHAIN_ID, "0xa0d9c1e9e48ca30c8d8c3b5d69ff5dc1f6dffc24", "Aave", "WrappedTokenGatewayV3"],
  [BASE_CHAIN_ID, "0x18cd499e3d7ed42feba981ac9236a278e4cdc2ee", null, "WrappedTokenGatewayV3"],
  [BASE_CHAIN_ID, "0x8be473dcfa93132658821e67cbeb684ec8ea2e74", null, "WrappedTokenGatewayV3"],
  [BASE_CHAIN_ID, "0x729b3ea8c005abc58c9150fb57ec161296f06766", null, "WrappedTokenGatewayV3"],
  [BASE_CHAIN_ID, "0xaeeb3898ede6a6e86864688383e211132baa1af3", null, "WrappedTokenGatewayV3"],
  [BASE_CHAIN_ID, "0x2e549104c516b8657a7d888494dfbabd7c70b464", null, "ParaSwapLiquiditySwapAdapter"],
  [BASE_CHAIN_ID, "0x63dfa7c09dc2ff4030d6b8dc2ce6262bf898c8a4", null, "ParaSwapRepayAdapter"],
  [BASE_CHAIN_ID, "0x78f8bd884c3d738b74b420540659c82f392820e0", null, "ParaSwapRepayAdapter"],
  [BASE_CHAIN_ID, "0x5598bbfa2f4fe8151f45bba0a3ede1b54b51a0a9", null, "ParaSwapWithdrawSwapAdapter"],
  [BASE_CHAIN_ID, "0x111111125421ca6dc452d289314280a0f8842a65", "1Inch", "AggregationRouterV6"],
  [BASE_CHAIN_ID, "0x19ceead7105607cd444f5ad10dd51356436095a1", null, "OdosRouterV2"],
  [BASE_CHAIN_ID, "0x9ee06954418687c6fb3a9966f7c46e0a245f0183", null, "MagpieRouterV2"],
  [BASE_CHAIN_ID, "0x6a000f20005980200259b80c5102003040001068", "Velora (Formerly Paraswap)", "AugustusV6"],
  [BASE_CHAIN_ID, "0xd7f1dd5d49206349cae8b585fcb0ce3d96f1696f", null, "Router"],
  [BASE_CHAIN_ID, "0x4fe93ebc4ce6ae4f81601cc7ce7139023919e003", null, "EnsoShortcuts"],
  // ── Base, batch 1 (item 430) ──
  [BASE_CHAIN_ID, "0x3ef3d8ba38ebe18db133cec108f4d14ce00dd9ae", "Angle Protocol", "ERC1967Proxy"],
  [BASE_CHAIN_ID, "0x89c6340b1a1f4b25d36cd8b063d49045caf3f818", "LI.FI", "Permit2Proxy"],
  [BASE_CHAIN_ID, "0x6307119078556fc8ad77781dfc67df20d75fb4f9", null, "Permit2Proxy"],
  [BASE_CHAIN_ID, "0x09350f89e2d7b6e96ba730783c2d76137b045fef", null, "GasliteDrop"],
  [BASE_CHAIN_ID, "0x2ed6784df2ea89026c600f3b2e59a606852b094a", null, "UniswapV3Pool"],
  [BASE_CHAIN_ID, "0xbdf1b0bfe9d94c484979b58ea4929fab5fed9ae0", null, "UniswapV3Pool"],
  [BASE_CHAIN_ID, "0xf708e11a7c94abde8f6217b13e6fe39c8b9cc0a6", null, "DZapDiamond"],
  [BASE_CHAIN_ID, "0x5e766616aabfb588e23a8ea854e9dbd1042affd3", null, "MagpieRouterV3_1"],
  [BASE_CHAIN_ID, "0xef975bb55c6bc6767963b37dd150ee7048bd8b71", null, "CurveStableSwapNG"],
  [BASE_CHAIN_ID, "0x915dcef92cf0c5fba056b57a7b6ced217378acb7", null, "CurveStableSwapNG"],
  [BASE_CHAIN_ID, "0x4c86d266e969e186a2f197d859df2d91e5ea1ed2", null, "CurveStableSwapNG"],
  [BASE_CHAIN_ID, "0xdc5d8200a030798bc6227240f68b4dd9542686ef", null, "BaseSettler"],
  [BASE_CHAIN_ID, "0xf525ff21c370beb8d9f5c12dc0da2b583f4b949f", null, "BaseSettler"],
  [BASE_CHAIN_ID, "0xea758cac6115309b325c582fd0782d79e3502177", null, "BaseSettler"],
  [BASE_CHAIN_ID, "0xcaf2da315f5a5499299a312b8a86faafe4bad959", null, "BaseSettler"],
  [BASE_CHAIN_ID, "0x785648669b8e90a75a6a8de682258957f9028462", null, "BaseSettler"],
  [BASE_CHAIN_ID, "0x47146d81b68b737316d0636d5135849d364bb0c8", null, "BaseSettler"],
  [BASE_CHAIN_ID, "0x5c9bdc801a600c006c388fc032dcb27355154cc9", null, "BaseSettler"],
  [BASE_CHAIN_ID, "0x49fb9c16b9b2a19452633573603c837673fd7e04", null, "BaseSettler"],
  [BASE_CHAIN_ID, "0xbc3c5ca50b6a215edf00815965485527f26f5da8", null, "BaseSettler"],
  [BASE_CHAIN_ID, "0x6a57a0579e91a5b7ce9c2d08b93e1a9b995f974f", null, "BaseSettler"],
  [BASE_CHAIN_ID, "0xf5042e6ffac5a625d4e7848e0b01373d8eb9e222", null, "RelayRouter"],
  [BASE_CHAIN_ID, "0x3a23f943181408eac424116af7b7790c94cb97a5", null, "SocketGateway"],
  [BASE_CHAIN_ID, "0xedca7ed2248928349fb9c9289b48471bbdddee87", null, "LootDistributor"],
  [BASE_CHAIN_ID, "0x2004c2293f9decca292934fa773f56860624b234", null, "LootDistributor"],
  [BASE_CHAIN_ID, "0x90cbe4bdd538d6e9b379bff5fe72c3d67a521de5", null, "BeaconProxy"],
  [BASE_CHAIN_ID, "0x0a6d96e7f4d7b96cfe42185df61e64d255c12dff", null, "FeeCollector"],
  [BASE_CHAIN_ID, "0x5d64d14d2cf4fe5fe4e65b1c7e3d11e18d493091", null, "FeeCollector"],
  [BASE_CHAIN_ID, "0x067170777ba8027ced27e034102d54074d062d71", null, "FeeCollector"],
  [BASE_CHAIN_ID, "0xc8b4ee80f20df7a9905e88d04b5d3c21aadb6f11", null, "UniswapV2Pair"],
  [BASE_CHAIN_ID, "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", "Uniswap", "UniversalRouter"],
  [BASE_CHAIN_ID, "0x6ff5693b99212da76ad316178a184ab56d299b43", "Uniswap", "UniversalRouter"],
  [BASE_CHAIN_ID, "0x198ef79f1f515f02dfe9e3115ed9fc07183f02fc", null, "UniversalRouter"],
  [BASE_CHAIN_ID, "0x954339759d876e06df67e0814158e15012442310", null, "SwapExecutorEth"],
  [BASE_CHAIN_ID, "0x81bbba46b9fcf04ab13314136b895b15291f0462", null, "Forwarder"],
  [BASE_CHAIN_ID, "0x69460570c93f9de5e2edbc3052bf10125f0ca22d", "Rango Exchange", "RangoDiamond"],
  [BASE_CHAIN_ID, "0xba1333333333a1ba1108e8412f11850a5c319ba9", null, "Vault"],
  [BASE_CHAIN_ID, "0x03a520b32c04bf3beef7beb72e919cf822ed34f1", "Uniswap", "NonfungiblePositionManager"],
  [BASE_CHAIN_ID, "0xeeeeee9ec4769a09a76a83c7bc42b185872860ee", null, "ERC20Router"],
  [BASE_CHAIN_ID, "0xb4acbc082b5e7ded571c98ee4257778a9d784b36", "Krystal", "V3Utils"],
  [BASE_CHAIN_ID, "0x16c6346916eef89fd2c2fb7da61da8825948ec93", null, "V3Utils"],
  [BASE_CHAIN_ID, "0x98ec492942090364ac0736ef1a741ae6c92ec790", null, "V3Utils"],
  [BASE_CHAIN_ID, "0xb0717286fca964cb7315a95a003e1c3f0313b6de", null, "V3Utils"],
  [BASE_CHAIN_ID, "0xc38e4e6a15593f908255214653d3d947ca1c2338", null, "MayanSwift"],
  [BASE_CHAIN_ID, "0x4f37a9d177470499a2dd084621020b023fcffc1f", null, "CurveRouterSidechainv1.1"],
  [BASE_CHAIN_ID, "0xd4e9b0d466789d7f6201442eeccba6a75a552db0", null, "PendleSwap"],
  [BASE_CHAIN_ID, "0xfd78ba0f717223bebe555a777b70b86667837ff6", null, "UniV4HookAdapter"],
  [BASE_CHAIN_ID, "0x00000000009726632680fb29d3f7a9734e3010e2", null, "RainbowRouter"],
  [BASE_CHAIN_ID, "0x0bf485bd7ebb82e282f72e7d14822c680e3f7bec", "Revert Finance", "AutoCompound"],
  [BASE_CHAIN_ID, "0x07d889ebae9e9203a0443edba3cb5ca499c4cef1", null, "BaseSettlerIntent"],
  [BASE_CHAIN_ID, "0x7beaec7ea579c656f4272e409b6bfda9f8ad8941", null, "BaseSettlerIntent"],
  [BASE_CHAIN_ID, "0xff11500b35a3e48a298bcd6139b9a3d9c369537e", null, "BaseSettlerIntent"],
  [BASE_CHAIN_ID, "0x0389879e0156033202c44bf784ac18fc02edee4f", null, "RouteProcessor4"],
  [BASE_CHAIN_ID, "0xc402449f5dd3781d08cb357d9709505fda8f3696", null, "RipeLego"],
  [BASE_CHAIN_ID, "0x8bbd5a66b962409ae0f7ebdc120e9629f1077a5d", null, "ERC1967Proxy"],
  [BASE_CHAIN_ID, "0x9aab4b24541af30fd72784ed98d8756ac0efb3c7", null, "FeeClaimer"],
  [BASE_CHAIN_ID, "0x9bd25e67bf390437c8faf480ac735a27bcf6168c", null, "TokenJar"],
  [BASE_CHAIN_ID, "0x0000000000bbf5c5fd284e657f01bd000933c96d", null, "Adapter"],
  // ── Arbitrum ──
  [ARBITRUM_CHAIN_ID, "0x5283beced7adf6d003225c13896e536f2d4264ff", "Aave", "WrappedTokenGatewayV3"],
];

const keyOf = (chainId: ChainId, address: string) => `${chainId}:${address.toLowerCase()}`;

const GROWTHEPIE = new Map<string, GrowthepieLabel>();
for (const [chainId, address, owner, contractName] of GROWTHEPIE_LABELS) {
  if (GROWTHEPIE.has(keyOf(chainId, address)))
    throw new Error(`known-infrastructure: duplicate growthepie label ${chainId}:${address}`);
  GROWTHEPIE.set(keyOf(chainId, address), {
    ...(owner ? { owner } : {}),
    ...(contractName ? { contractName } : {}),
  });
}

// A malformed or mixed-case key would silently never match, leaving the
// contract as bare hex (or an escrow rendering as a position) with no sign
// anything was wrong. A repeated key would let the later entry shadow the first.
const KNOWN_INFRASTRUCTURE = new Map<string, KnownInfrastructure>();
for (const [chainId, address, entry] of ENTRIES) {
  if (!isAddress(address, { strict: false }) || address !== address.toLowerCase())
    throw new Error(`known-infrastructure: malformed address key ${address}`);
  const key = keyOf(chainId, address);
  if (KNOWN_INFRASTRUCTURE.has(key)) throw new Error(`known-infrastructure: duplicate entry ${key}`);
  const label = GROWTHEPIE.get(key);
  // growthepie's verified source name and the explorer's must agree: a
  // disagreement is a wrong entry or a changed label, and either needs a look.
  // Behind a proxy the pool names the proxy's source. Whitespace is not a
  // disagreement: Sourcify names a Vyper contract by its file, which has none.
  const bare = (name: string) => name.replace(/\s+/g, "");
  if (
    label?.contractName &&
    bare(label.contractName) !== bare(entry.contractName) &&
    label.contractName !== entry.proxyContractName
  )
    throw new Error(
      `known-infrastructure: growthepie names ${key} ${label.contractName}, the entry ${entry.contractName}`,
    );
  KNOWN_INFRASTRUCTURE.set(key, label ? { ...entry, growthepie: label } : entry);
}
// A label for an address the registry has not entered is a lead, not an entry.
for (const key of GROWTHEPIE.keys())
  if (!KNOWN_INFRASTRUCTURE.has(key)) throw new Error(`known-infrastructure: growthepie label without an entry ${key}`);

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
 *  amm-pool, lending-pool, distributor) on a chain, or `undefined`. */
export function getProtocolContract(
  address: string | null | undefined,
  chainId: ChainId,
): ProtocolContract | undefined {
  const entry = getKnownInfrastructure(address, chainId);
  return entry && entry.kind !== "ccip-lock-release" ? entry : undefined;
}

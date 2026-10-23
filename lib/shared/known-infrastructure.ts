import { isAddress } from "viem";
import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

/**
 * Known contracts that are not positions, keyed by CHAIN and address. Two
 * classes share the registry:
 *
 *   • custody escrows (`ccip-lock-release`) hold protocol tokens for someone
 *     else. A Maple page for one renders the custody view, not a position.
 *   • protocol contracts (settlement, router, adapter, gateway, multicall,
 *     amm-pool, lending-pool, distributor, staking) are what a user's tokens
 *     move through or into on the way to a trade, a swap, an ETH wrap, a loan,
 *     a payout of rewards or a stake. A transfer to or from
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
 *   • Batch 2 of item 430 (23 Oct 2026): the sweep's plumbing names whose rows
 *     are all Pool-caller rows (a supply's caller, a withdrawal's recipient),
 *     116 deployments read on growthepie's labels file, the OLI pool and
 *     Etherscan V2, under Miles's rulings for the batch. Balancer V3's Vault on
 *     Ethereum and Arbitrum is balancer-deployments v3 `20241204-v3-vault`
 *     (mainnet.json, arbitrum.json); Etherscan reads its fallback to
 *     VaultExtension as a proxy, and the source at the address is `Vault`.
 *     Ethereum 0xba12…f2c8 is Balancer V2's Vault (v2 `20210418-vault`). The fee
 *     burners are v3 `20250530-v3-erc4626-cow-swap-fee-burner-v2` (mainnet,
 *     base); their source's `@author` is CoW Protocol's developers.
 *   • Aave's address book: MIGRATION_HELPER 0xd417…c5e4 (AaveV2Ethereum),
 *     POOL_EXPOSURE_STEWARD and COLLECTOR (AaveV3Ethereum), and Arbitrum's
 *     REPAY_WITH_COLLATERAL_ADAPTER 0xe28e…2034. The second migration helper,
 *     0xb748…abfc, is not in the book: its verified source is an earlier build
 *     of the same BGD Labs contract (`MigrationHelperMainnet.sol` identical,
 *     `@author BGD Labs`; `MigrationHelper.sol` before the withdrawn-balance fix
 *     and the referral code), so it takes the same entry. Arbitrum's other
 *     repay adapter 0x2820…f3ba and the WETH gateways `FlAaveV3WethGateway`
 *     (both chains) and `AaveV3WethGateway` are not in the book.
 *   • Owners named from the verified source: Superfluid (`@author Superfluid`,
 *     the protocol-monorepo paths), Portals (`@author Portals.fi`), DCA.fun
 *     (`@author DCA.fun Team`), Underscore (the Underscore Protocol License on
 *     LegoAaveV3 and AaveV3), Synthereum (`@author Synthereum Protocol` on
 *     LendingManager, where the sweep wrote Jarvis), Enzyme (`@author Enzyme
 *     Council` on Ethereum 0x9cfb…6707, `Enzyme Foundation` on Base
 *     0xc16d…c099), Clear (`@author Clear Protocol Team`), 1inch on
 *     AggregationRouterV5 (EIP-712 domain "1inch Aggregation Router") and Odos
 *     (`@title V3 Routing contract for Odos SOR`). Contango, MagpieRouterV3,
 *     MagpieRouterCore, ElfomoFi, Clear's 0x2e61…a159 and DZap's 0x2c02…5ca8
 *     rest on the source name, as the earlier Magpie entries do: a verified
 *     source name that is the owner's name states the owner (Miles, 23 Oct).
 *   • Owners from the protocol's publication: Morpho's docs (addresses page)
 *     for GeneralAdapter1 and EthereumGeneralAdapter1; DZap's docs for
 *     DZapZapCore 0xce25…6ba4; LI.FI's `deployments/base.json` for LiFiDiamond.
 *     growthepie names Relay for RelayRouterV3 on Ethereum and Arbitrum; its
 *     Base row names no owner and relay-periphery's v3 addresses list another
 *     router, so Base 0xb92f…ff4f is a role.
 *   • Owner unstated, so the display is the role: FLAction, FLBalancer,
 *     OperationExecutor (its header's copyright is Oazo Apps Limited, which
 *     names no product), ZapperExecutor, MulticallRouter, VaultDepositooorV2,
 *     AutoRepayingManager, Deposit, App, LeveragedPosition, AaveAdaptor,
 *     L1SenderV2, AaveCommissionContract, RosettaProxy,
 *     ConnectorDeleverageParaswap and two Base AaveV3Adapters. The Base name
 *     `AaveV3Adapter` covers four contracts: a swap adapter 0xa43f…0956
 *     (`sellBase`, `sellQuote`), Enzyme's 0xc16d…c099 and two app adapters.
 *   • Pools of batch 2: the Equalizer pairs answer `factory()` with Equalizer's
 *     PairFactory on Base (0xed8d…ec04, its docs' Base contracts page), the two
 *     PancakeSwap pairs with PancakeSwap V2's (0x02a8…749E, its developer
 *     docs). They hold WETH, USDC, USDbC, cbBTC and cbETH: a withdrawal paid to
 *     one is the input of a swap. Uniswap V4's PoolManager on Base is
 *     0x4985…2b2b, growthepie owner Uniswap.
 *   • Left out of batch 2: the Base `Vault`s 0x238a…e6c4, 0xdd17…ecaa,
 *     0xec8d…272c, 0x210b…d064 and 0x4f18…2f50 and Ethereum's 0xb543…1002,
 *     none Balancer's; PoolManager 0x60b3…a314 (v4-core source, and no source
 *     names its owner); eleven AlgebraPools (seven Algebra factories,
 *     none a venue's published one); four Solidly `VolatileV1` pairs, whose
 *     `factory()` reverts; five BaseSwap pairs (BaseSwap's docs list no
 *     factory); DODO's two GSPs (in none of DODO's published Ethereum
 *     factories); Ethereum AaveV3Adapter 0x6d1d…37dc (its proxy is unverified).
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
  kind:
    | "settlement"
    | "router"
    | "adapter"
    | "gateway"
    | "multicall"
    | "amm-pool"
    | "lending-pool"
    // Pays tokens out to many accounts (a reward distributor, a bulk drop): a transfer in from one is a payout.
    | "distributor"
    // Takes a wallet's aTokens into a stake: a transfer out to one is a stake.
    | "staking";
  /** A noun phrase that completes "The recipient is …" / "The sender is …" in
   *  an event's explanation. Says what the contract does, nothing more. */
  role: string;
  /** Basename under public/icons/protocols/, set only where that mark exists. */
  protocolIcon?: string;
  /** The protocol this contract moves a position here from, where that is all
   *  it does (Aave's V2→V3 helper): a supply or borrow it made reads as a
   *  migration. */
  migratesFrom?: string;
  /** The product whose entry contract this is, set where the registry states
   *  the owner and the contract is that product's own (Zerion's router). A
   *  transaction sent here takes the product's stretch of the timeline's side
   *  bar (`components/shared/section-sidebar.tsx`, rails-ops TO-DO-ui-jobs
   *  439). A field of its own rather than read from `name` and `protocolIcon`:
   *  those also sit on venues' shared contracts (CoW's settlement, Uniswap's
   *  pools) and on the protocol's own adapters, which take the protocol's bar. */
  bar?: BarSubject;
}

/** Who a row's stretch of the timeline's side bar names: a product whose entry
 *  contract the transaction entered. `hue` is an oklch hue angle read off the
 *  product's mark, drawn through the same zone and edge tokens as a roster
 *  protocol's `brand`, so every subject's stretch has the same weight. */
export interface BarSubject {
  name: string;
  /** Basename under public/icons/protocols/. */
  icon: string;
  hue: number;
}

/** Zerion's mark (zerion.io's `favicon-mark.png`, blue #2962EF). */
const ZERION_BAR: BarSubject = { name: "Zerion", icon: "zerion", hue: 264 };

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
  "staking",
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

// ── Batch 2 of item 430: the plumbing whose rows are Pool-caller rows only ──
const SUPERFLUID_AAVE_BACKEND = known(
  "adapter",
  "Superfluid Aave backend",
  "AaveETHYieldBackend",
  "Superfluid’s Aave yield backend, which supplies the ETH behind a Superfluid super token to the Pool and withdraws it back",
);
const DCA_DOT_FUN = known(
  "adapter",
  "DCA.fun",
  "DcaDotFun",
  "DCA.fun’s order contract, which supplies each dollar-cost-averaging order’s funds to the Pool while the order waits",
);
const AAVE_MIGRATION_HELPER: ProtocolContract = {
  ...known(
    "adapter",
    "Aave migration helper",
    "MigrationHelperMainnet",
    "Aave’s migration helper, which moves a position from Aave V2 to Aave V3 in one transaction, supplying its collateral here and borrowing here to repay its debt there",
    "aave-v3",
  ),
  migratesFrom: "Aave V2",
};
const AAVE_POOL_EXPOSURE_STEWARD = known(
  "adapter",
  "Aave Pool Exposure Steward",
  "PoolExposureSteward",
  "Aave’s Pool Exposure Steward, which moves the Aave DAO treasury’s funds into and out of Aave pools",
  "aave-v3",
);
const AAVE_COLLECTOR: ProtocolContract = {
  ...known(
    "adapter",
    "Aave Collector",
    "CollectorWithCustomImpl",
    "Aave’s Collector, the treasury that holds the Aave DAO’s funds",
    "aave-v3",
  ),
  proxyContractName: "InitializableAdminUpgradeabilityProxy",
};
const flashLoanAction = (contractName: string) =>
  known(
    "adapter",
    "Flash-loan action",
    contractName,
    "a flash-loan action, which borrows through a flash loan and runs a recipe of steps for a wallet in one transaction",
  );
const OPERATION_EXECUTOR = known(
  "adapter",
  "Operation executor",
  "OperationExecutor",
  "an operation executor, which runs a sequence of lending actions for a wallet in one transaction",
);
const SWAP_AAVE_V3_ADAPTER = known(
  "adapter",
  "Aave V3 swap adapter",
  "AaveV3Adapter",
  "a swap aggregator’s Aave V3 adapter, which supplies or withdraws aTokens as one step of a routed swap",
);
const ENZYME_AAVE_V3_ADAPTER = known(
  "adapter",
  "Enzyme Aave V3 adapter",
  "AaveV3Adapter",
  "Enzyme’s Aave V3 adapter, which supplies and withdraws for Enzyme vaults",
);
const AAVE_V3_ADAPTER_UNLABELLED = known(
  "adapter",
  "Aave V3 adapter",
  "AaveV3Adapter",
  "an Aave V3 adapter, which supplies to and withdraws from the Pool for its app’s users",
);
const underscoreAaveLego = (contractName: string) =>
  known(
    "adapter",
    "Underscore Aave lego",
    contractName,
    "an Underscore lego, which supplies and withdraws for Underscore wallets at the Pool",
  );
const CONTANGO: ProtocolContract = {
  ...known(
    "adapter",
    "Contango",
    "Contango",
    "Contango’s core contract, which opens and closes leveraged positions through lending markets and flash loans",
  ),
  proxyContractName: "ERC1967Proxy",
};
const SYNTHEREUM_LENDING_MANAGER = known(
  "adapter",
  "Synthereum lending manager",
  "LendingManager",
  "Synthereum’s lending manager, which lends the collateral of Synthereum synthetic-asset pools to money markets",
);
const AUTO_REPAYING_MANAGER = known(
  "adapter",
  "Auto-repaying manager",
  "AutoRepayingManager",
  "an auto-repaying manager, which pairs a Uniswap position with an Aave loan it repays from the position’s fees",
);
const morphoGeneralAdapter = (contractName: string) =>
  known(
    "adapter",
    "Morpho bundler adapter",
    contractName,
    "Morpho’s bundler adapter, which runs the steps of a Morpho Bundler3 bundle for a wallet",
    "morpho",
  );
const CLEAR_GSM_REBALANCE = known(
  "adapter",
  "Clear GSM rebalance adapter",
  "ClearGHOGsm4626RebalanceAdapter",
  "Clear’s GSM rebalance adapter, which rebalances between GHO and another asset through GHO’s stability module",
);
const USDC_DEPOSIT = known(
  "adapter",
  "Deposit contract",
  "Deposit",
  "a deposit contract, which supplies a wallet’s USDC to the Pool for it",
);
const APP_CONTRACT = known(
  "adapter",
  "App contract",
  "App",
  "an app contract, which supplies to and withdraws from the Pool for its users",
);
const LEVERAGED_POSITION = known(
  "adapter",
  "Leveraged position",
  "LeveragedPosition",
  "a leverage contract, which loops supply and borrow on lending protocols for a wallet",
);
const AAVE_ADAPTOR: ProtocolContract = {
  ...known(
    "adapter",
    "Aave adapter",
    "AaveAdaptor",
    "an Aave adapter, which supplies to and withdraws from the Pool for its app’s users",
  ),
  proxyContractName: "ERC1967Proxy",
};
const L1_SENDER: ProtocolContract = {
  ...known(
    "adapter",
    "L1 sender",
    "L1SenderV2",
    "a bridge sender, which supplies and withdraws funds before sending them to another chain",
  ),
  proxyContractName: "ERC1967Proxy",
};
const ELFOMOFI = known("adapter", "ElfomoFi", "ElfomoFi", "an app contract, which supplies to the Pool for its users");
const AAVE_COMMISSION: ProtocolContract = {
  ...known(
    "adapter",
    "Commission contract",
    "AaveCommissionContract",
    "a commission contract, which supplies and withdraws for its users and takes a fee on each",
  ),
  proxyContractName: "ERC1967Proxy",
};
const ROSETTA_PROXY = known(
  "adapter",
  "Rosetta proxy",
  "RosettaProxy",
  "a vault proxy, which supplies to and withdraws from whitelisted MetaMorpho vaults and Aave markets for its users",
);
const DELEVERAGE_CONNECTOR = known(
  "adapter",
  "Deleverage connector",
  "ConnectorDeleverageParaswap",
  "a deleverage connector, which flash-borrows and swaps through ParaSwap to unwind an Aave position",
);
const wethGateway = (contractName: string): ProtocolContract => ({ ...WETH_GATEWAY, contractName });

const PORTALS_MULTICALL = known(
  "multicall",
  "Portals multicall",
  "PortalsMulticall",
  "Portals’ multicall contract, which bundles the calls of a Portals zap into one transaction",
);
const ZAP_EXECUTOR = known(
  "multicall",
  "Zap executor",
  "ZapperExecutor",
  "a zap executor, which runs a scripted batch of swaps and deposits in one transaction",
);
const CALL_CHAIN_MULTICALL = known(
  "multicall",
  "Multicall contract",
  "MulticallRouter",
  "a multicall router, which chains calls on several contracts in one transaction",
);

const LIFI_DIAMOND = known(
  "router",
  "LI.FI",
  "LiFiDiamond",
  "LI.FI’s diamond, which routes a swap or a bridge across other venues",
);
const RELAY_ROUTER_V3 = known(
  "router",
  "Relay router",
  "RelayRouterV3",
  "Relay’s router, which runs the calls of a Relay swap or bridge and passes the output on",
);
const VAULT_DEPOSIT_ROUTER = known(
  "router",
  "Vault deposit router",
  "VaultDepositooorV2",
  "a vault-deposit router, which deposits a wallet’s tokens into a registered vault in one call",
);
const DZAP_ZAP = known(
  "router",
  "DZap zap",
  "DZapZapCore",
  "DZap’s zap contract, which runs a swap-and-deposit across protocols in one transaction",
);

const BALANCER_FEE_BURNER = known(
  "settlement",
  "Balancer fee burner",
  "ERC4626CowSwapFeeBurner",
  "Balancer’s fee burner, which redeems protocol-fee vault shares and sells the proceeds through CoW Protocol",
  "balancer",
);

const BALANCER_V2_VAULT = known(
  "amm-pool",
  "Balancer V2",
  "Vault",
  "Balancer V2’s Vault, the one contract that holds the tokens of every Balancer V2 pool",
  "balancer",
);
// These pools trade the underlying tokens; their rows are withdrawals paid to the pool as a swap's input.
const EQUALIZER_PAIR = known(
  "amm-pool",
  "Equalizer pool",
  "Pair",
  "an Equalizer pool, which trades two tokens against each other and holds both as its liquidity",
);
const PANCAKE_V2_PAIR = known(
  "amm-pool",
  "PancakeSwap pair",
  "PancakePair",
  "a PancakeSwap V2 pair, which trades two tokens against each other and holds both as its liquidity",
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
  // ── Ethereum, batch 2 (item 430) ──
  [MAINNET_CHAIN_ID, "0xba1333333333a1ba1108e8412f11850a5c319ba9", BALANCER_V3_VAULT],
  [MAINNET_CHAIN_ID, "0xb748952c7bc638f31775245964707bcc5ddfabfc", AAVE_MIGRATION_HELPER],
  [MAINNET_CHAIN_ID, "0xca71c36d26f515ad0cce1d806b231cbc1185cdfc", OPERATION_EXECUTOR],
  [MAINNET_CHAIN_ID, "0x5f1dc84ba060ea3f7429c6a7bbedd9243cf1209b", flashLoanAction("FLAction")],
  [MAINNET_CHAIN_ID, "0x40b72bb73b1e9380629b205e7880fa409ae7fcc9", VAULT_DEPOSIT_ROUTER],
  [
    MAINNET_CHAIN_ID,
    "0x3611b82c7b13e72b26eb0e9be0613bee7a45ac7c",
    router("Magpie router", "MagpieRouterCore", "Magpie’s"),
  ],
  [
    MAINNET_CHAIN_ID,
    "0x111111125421ca6dc452d289314280a0f8842a65",
    router("1inch router", "AggregationRouterV6", "1inch’s aggregation"),
  ],
  [MAINNET_CHAIN_ID, "0xe78c05c508405207ecc256781b9415e6de1c8336", flashLoanAction("FLAction")],
  [MAINNET_CHAIN_ID, "0x6cae28b3d09d8f8fc74ccd496ac986fc84c0c24e", CONTANGO],
  [MAINNET_CHAIN_ID, "0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f", RELAY_ROUTER_V3],
  [MAINNET_CHAIN_ID, "0x16a5749d037c45652b31644b9cea6a7c4f7ec5b2", CLEAR_GSM_REBALANCE],
  [
    MAINNET_CHAIN_ID,
    "0x1111111254eeb25477b68fb85ed929f73a960582",
    router("1inch router", "AggregationRouterV5", "1inch’s aggregation"),
  ],
  [MAINNET_CHAIN_ID, "0x4a6c312ec70e8747a587ee860a0353cd42be0ae0", morphoGeneralAdapter("EthereumGeneralAdapter1")],
  [MAINNET_CHAIN_ID, "0xc2b92b6c69e5c3b6b29385c1a17fee906e0ca910", flashLoanAction("FLAction")],
  [MAINNET_CHAIN_ID, "0x726e3244e2a73405ce13d82862d81e1c5dd0004e", ZAP_EXECUTOR],
  [MAINNET_CHAIN_ID, "0x816e90dc85bf016455017a76bc09cc0451eeb308", BALANCER_FEE_BURNER],
  [
    MAINNET_CHAIN_ID,
    "0x15392211222b46a0ea85a9a800830486d144848d",
    router("Magpie router", "MagpieRouterV3", "Magpie’s"),
  ],
  [MAINNET_CHAIN_ID, "0x7a0f3963c666d4549e5909a7162b560abf9f006d", flashLoanAction("FLAction")],
  [MAINNET_CHAIN_ID, "0x9cfb64d91ce4eb821ff8edc1c2fda2e89e256707", ENZYME_AAVE_V3_ADAPTER],
  [MAINNET_CHAIN_ID, "0x5953993370e135c2e917545c53e612e1995123b8", CLEAR_GSM_REBALANCE],
  [MAINNET_CHAIN_ID, "0x2efd4430489e1a05a89c2f51811ac661b7e5ff84", L1_SENDER],
  [MAINNET_CHAIN_ID, "0xba12222222228d8ba445958a75a0704d566bf2c8", BALANCER_V2_VAULT],
  [
    MAINNET_CHAIN_ID,
    "0x6a000f20005980200259b80c5102003040001068",
    router("ParaSwap router", "AugustusV6", "ParaSwap’s Augustus"),
  ],
  [MAINNET_CHAIN_ID, "0x22ac12a6937bbbc0a301af9154d08ead95673122", AAVE_POOL_EXPOSURE_STEWARD],
  [MAINNET_CHAIN_ID, "0xc82e6bc89c64e627437a2caa475062694b8f4498", APP_CONTRACT],
  [MAINNET_CHAIN_ID, "0x540a83e36e5e6aa916a6c591934d800e17115048", flashLoanAction("FLBalancer")],
  [MAINNET_CHAIN_ID, "0xd417d34d7aaf70b24fbc6b36808e3396c991c5e4", AAVE_MIGRATION_HELPER],
  [MAINNET_CHAIN_ID, "0x49d3fc00f3acf80fabcb42d7681667b20f60889a", CALL_CHAIN_MULTICALL],
  [MAINNET_CHAIN_ID, "0xfff30c67eea809123596252e132d30e1eb75bc83", OPERATION_EXECUTOR],
  [MAINNET_CHAIN_ID, "0x6a53f8b799be11a2a3264ef0bff183dcb12d9571", wethGateway("FlAaveV3WethGateway")],
  [MAINNET_CHAIN_ID, "0x464c71f6c2f760dda6093dcb91c24c39e5d6e18c", AAVE_COLLECTOR],
  [MAINNET_CHAIN_ID, "0x9f54e8eaa9658316bb8006e03fff1cb191aafbe6", DELEVERAGE_CONNECTOR],
  [MAINNET_CHAIN_ID, "0xc5e159fdc179d3ce6d78880da5b8838b983a9714", APP_CONTRACT],
  [MAINNET_CHAIN_ID, "0xc1cd3654ab3b37e0bc26bafb5ae4c096892d0b0c", OPERATION_EXECUTOR],
  [MAINNET_CHAIN_ID, "0xafd306005f5d1a8537be4960e6d23907b5b9383f", ZAP_EXECUTOR],
  [MAINNET_CHAIN_ID, "0x2e61ac206de68c4a39a194d91c96c0185befa159", CLEAR_GSM_REBALANCE],
  [MAINNET_CHAIN_ID, "0x2be65f12dcc55c8485030e306a1b01f47c437a8a", flashLoanAction("FLAction")],
  [MAINNET_CHAIN_ID, "0x0adf6dde7971b273c87456064e99e10193292237", APP_CONTRACT],
  [MAINNET_CHAIN_ID, "0xf9f968e5a7b7db8bb74c0ea287e2094e4f336f5c", ZAP_EXECUTOR],
  [MAINNET_CHAIN_ID, "0x675d37489a7a64c051d0204e5c72a469f6558a47", ZAP_EXECUTOR],
  [MAINNET_CHAIN_ID, "0xb3805e5f44b97dab82bc00d63f7f8c5a56b96d8d", ZAP_EXECUTOR],
  [MAINNET_CHAIN_ID, "0x6e867662e3378595e97279bcaa66d7a103bf6070", OPERATION_EXECUTOR],
  [MAINNET_CHAIN_ID, "0x661d3c310bd58b3abc1caf671c372288149def15", OPERATION_EXECUTOR],
  [MAINNET_CHAIN_ID, "0x8fce7852ab757899792863f3560d1274eb0e8821", ZAP_EXECUTOR],
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
  [
    BASE_CHAIN_ID,
    "0xd7f1dd5d49206349cae8b585fcb0ce3d96f1696f",
    { ...router("Zerion", "Router", "Zerion’s"), protocolIcon: "zerion", bar: ZERION_BAR },
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
  // ── Base, batch 2 (item 430) ──
  [BASE_CHAIN_ID, "0x7652245d9666f9d1de2481695688162a4e050c5f", SUPERFLUID_AAVE_BACKEND],
  [BASE_CHAIN_ID, "0xea49d02c248b357b99670d9e9741f54f72df9cb3", PORTALS_MULTICALL],
  [BASE_CHAIN_ID, "0x344e4d19c851b317bb65d31bb5c4e3815b53d727", wethGateway("FlAaveV3WethGateway")],
  [BASE_CHAIN_ID, "0xdca00000067413240aeab357a3a89ea352d013e8", DCA_DOT_FUN],
  [BASE_CHAIN_ID, "0xc28eb3e9483fc89e76aa987a9116b815704d7f40", wethGateway("AaveV3WethGateway")],
  [BASE_CHAIN_ID, "0xa43f2e6e8313b46ddcb9190ce856af0089320956", SWAP_AAVE_V3_ADAPTER],
  [BASE_CHAIN_ID, "0x498581ff718922c3f8e6a244956af099b2652b2b", UNISWAP_V4],
  [BASE_CHAIN_ID, "0x8c94cfc11a9340e45032e5021881cc312993bf15", underscoreAaveLego("LegoAaveV3")],
  [BASE_CHAIN_ID, "0xef42f78d25f4c681dcad2597fa04877ff802ef4b", router("Magpie router", "MagpieRouterV3", "Magpie’s")],
  [BASE_CHAIN_ID, "0x6cae28b3d09d8f8fc74ccd496ac986fc84c0c24e", CONTANGO],
  [BASE_CHAIN_ID, "0x49bc51d8c140b7f64577ba01f5604014450645eb", SYNTHEREUM_LENDING_MANAGER],
  [BASE_CHAIN_ID, "0xb98c948cfa24072e58935bc004a8a7b376ae746a", morphoGeneralAdapter("GeneralAdapter1")],
  [BASE_CHAIN_ID, "0x5523e61fbef59825831ffbb1306abc3bb03bb3a4", flashLoanAction("FLAction")],
  [BASE_CHAIN_ID, "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae", LIFI_DIAMOND],
  [BASE_CHAIN_ID, "0x3ae633826cef322b1dfd43e129a0639330982247", AUTO_REPAYING_MANAGER],
  [BASE_CHAIN_ID, "0xb65cbf9689979e1749b38ba5d5155c70500292d8", OPERATION_EXECUTOR],
  [BASE_CHAIN_ID, "0xb7401d91f1586474164b6c6df328e3c3a5f24649", underscoreAaveLego("AaveV3")],
  [BASE_CHAIN_ID, "0x904ccd911533259c1d6b4c50d87de8130abeb55d", underscoreAaveLego("LegoAaveV3")],
  [BASE_CHAIN_ID, "0xa4b275feaf3a1450fc57270ed863923261abfd05", ZAP_EXECUTOR],
  [BASE_CHAIN_ID, "0x4b979ed48f982ba0baa946cb69c1083eb799729c", BALANCER_FEE_BURNER],
  [BASE_CHAIN_ID, "0x2380f715c3a990c30a69ed871992b0b10187d4c4", USDC_DEPOSIT],
  [BASE_CHAIN_ID, "0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f", multicallRouter("RelayRouterV3")],
  [BASE_CHAIN_ID, "0x8b4fc1e68d4e1926cca5dd48f91156de94ea87d7", underscoreAaveLego("AaveV3")],
  [
    BASE_CHAIN_ID,
    "0x1111111254eeb25477b68fb85ed929f73a960582",
    router("1inch router", "AggregationRouterV5", "1inch’s aggregation"),
  ],
  [BASE_CHAIN_ID, "0x87af4769e4134379125a262408e1f3ec60d2ab52", flashLoanAction("FLAction")],
  [BASE_CHAIN_ID, "0xeb7f1f4d0e57972df1ae73e3a76d6f7819588194", AUTO_REPAYING_MANAGER],
  [BASE_CHAIN_ID, "0x560740052f380669c90811f711f80b21306d4713", ZAP_EXECUTOR],
  [BASE_CHAIN_ID, "0x83240b049fa89b65be714aed68e5b074df6aac84", EQUALIZER_PAIR],
  [BASE_CHAIN_ID, "0x580729527620ab496195465bffd15e89efb508b4", underscoreAaveLego("LegoAaveV3")],
  [BASE_CHAIN_ID, "0xac80b9465d70aafbe492a08baea5c6e9d77b1478", underscoreAaveLego("AaveV3")],
  [BASE_CHAIN_ID, "0x2b66a88ac79acb3b548066bc1cf2ff2ff445ab45", AAVE_ADAPTOR],
  [BASE_CHAIN_ID, "0x37d4de0e45f6cb7f15b2f1b54c46687511043d50", LEVERAGED_POSITION],
  [BASE_CHAIN_ID, "0xf0f0f0f0fb0d738452efd03a28e8be14c76d5f73", ELFOMOFI],
  [BASE_CHAIN_ID, "0xda86b4c61a545a4b217746ba43c8157f0ec612c7", flashLoanAction("FLAction")],
  [BASE_CHAIN_ID, "0xd9a463ce7bfff3574c7aa60c14b91a6b7f507b2d", underscoreAaveLego("AaveV3")],
  [BASE_CHAIN_ID, "0x0d05a7d3448512b78fa8a9e46c4872c88c4a0d05", router("Odos router", "OdosRouterV3", "Odos’s")],
  [BASE_CHAIN_ID, "0x4fbdd50fb2030e8439fc9a752d37e097def2fb07", SYNTHEREUM_LENDING_MANAGER],
  [BASE_CHAIN_ID, "0x01a3c8e513b758ebb011f7afaf6c37616c9c24d9", CALL_CHAIN_MULTICALL],
  [BASE_CHAIN_ID, "0x2d43e84567019d721f095cfd632291c3ee868d8f", OPERATION_EXECUTOR],
  [BASE_CHAIN_ID, "0xaf49b5164832dfd3501fb8b56c9ecd1e548d730e", ROSETTA_PROXY],
  [BASE_CHAIN_ID, "0xf3f1f5760a614b8146eec5d1c94658720c2425b9", EQUALIZER_PAIR],
  [BASE_CHAIN_ID, "0x240b3f3bb05475998b3eadfd4caa4f0c6ffbe83b", AAVE_COMMISSION],
  [BASE_CHAIN_ID, "0x256f0f254b44c69e431c5eafbb9a86f85da1d1d3", underscoreAaveLego("AaveV3")],
  [BASE_CHAIN_ID, "0x24ab3e849b866c93079c2c74276918d73390e532", AUTO_REPAYING_MANAGER],
  [BASE_CHAIN_ID, "0x0345aa92c7cb97e09b7cc0d55e730cd39c09fa43", EQUALIZER_PAIR],
  [BASE_CHAIN_ID, "0xce2541ce645a1b232ff2fead53dcd9f369e86ba4", DZAP_ZAP],
  [BASE_CHAIN_ID, "0xaabd4b0372240e319f9722c4fd1e2fe0c8d422d2", flashLoanAction("FLAction")],
  [BASE_CHAIN_ID, "0xe4cfc10ee92bc52c873077e6de418ba0ba4e2609", LEVERAGED_POSITION],
  [BASE_CHAIN_ID, "0xc57775a3e13c7941eccfbaf740392c650b51453d", ZAP_EXECUTOR],
  [BASE_CHAIN_ID, "0x50974aac8ab56a40492767394e758549fe7e7526", AAVE_COMMISSION],
  [BASE_CHAIN_ID, "0x8969d747abfbd389767d33774702f260da7c38b0", CONTANGO],
  [BASE_CHAIN_ID, "0x826bd427d842e18d5fc60975983829f37f90f77b", underscoreAaveLego("AaveV3")],
  [BASE_CHAIN_ID, "0xbcef436cb1b7608797f4eab00296cef2f01332c8", AAVE_ADAPTOR],
  [BASE_CHAIN_ID, "0x21e890d3da79c78f1b149367cf01d06789f95d39", ZAP_EXECUTOR],
  [BASE_CHAIN_ID, "0x2c02ff63318c7ae1c8be6825495b365da6335ca8", DZAP_ZAP],
  [BASE_CHAIN_ID, "0xc16db2e93492e3ea512edc90787538652ec5c099", ENZYME_AAVE_V3_ADAPTER],
  [BASE_CHAIN_ID, "0xba25a6bf94ceb977ca1b4823158369463e514802", LEVERAGED_POSITION],
  [BASE_CHAIN_ID, "0x92363f9817f92a7ae0592a4cb29959a88d885cc8", PANCAKE_V2_PAIR],
  [BASE_CHAIN_ID, "0x48eab07dc303ad02ddb9ff2733ba881f6a1b8d64", EQUALIZER_PAIR],
  [BASE_CHAIN_ID, "0x275cce00b312ef583bb6e07a828c135896ee2a7d", AAVE_V3_ADAPTER_UNLABELLED],
  [BASE_CHAIN_ID, "0xadfcf45412ac5aa452bcf597afa008669dbbb3bf", ZAP_EXECUTOR],
  [BASE_CHAIN_ID, "0xd19b1204ee745fc540792f1feca3ae50ef71aa64", LEVERAGED_POSITION],
  [BASE_CHAIN_ID, "0x85cfb6917da8cc7c4c3b63f2120d2f636cf317bc", CONTANGO],
  [BASE_CHAIN_ID, "0x34d38344078d28e7f6326d38b6f8da13bd8e267b", AAVE_V3_ADAPTER_UNLABELLED],
  [BASE_CHAIN_ID, "0x659908a3353c48aa92f9b0aeb6d3b473ac091b83", EQUALIZER_PAIR],
  [BASE_CHAIN_ID, "0x79474223aedd0339780bacce75abda0be84dcbf9", PANCAKE_V2_PAIR],
  [BASE_CHAIN_ID, "0x13b312fa5153088f71ef14b55953f72f7c0b25ea", LEVERAGED_POSITION],
  [BASE_CHAIN_ID, "0xbdb49d8852e91c262dcd9ee6ace91828c0b2583a", DZAP_ZAP],
  // ── Arbitrum ──
  [ARBITRUM_CHAIN_ID, "0x5283beced7adf6d003225c13896e536f2d4264ff", WETH_GATEWAY],
  // ── Arbitrum, batch 2 (item 430) ──
  [ARBITRUM_CHAIN_ID, "0xba1333333333a1ba1108e8412f11850a5c319ba9", BALANCER_V3_VAULT],
  [ARBITRUM_CHAIN_ID, "0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f", RELAY_ROUTER_V3],
  [ARBITRUM_CHAIN_ID, "0xe28e2c8d240dd5ebd0adcab86fbd79df7a052034", PARASWAP_REPAY],
  [ARBITRUM_CHAIN_ID, "0x28201c152dc5b69a86fa54fcfd21bca4c0eff3ba", PARASWAP_REPAY],
];

// What growthepie says about each entry, read on GROWTHEPIE_READ:
// [chain, address, owner from the labels file, contract name from the OLI
// pool's Sourcify attestation]. `null` where that source has nothing. An entry
// absent here (116 of them on 23 Oct 2026, among them the syrupUSDT escrow, the
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
  // ── Ethereum, batch 2 (item 430) ──
  [MAINNET_CHAIN_ID, "0xba1333333333a1ba1108e8412f11850a5c319ba9", null, "Vault"],
  [MAINNET_CHAIN_ID, "0xb748952c7bc638f31775245964707bcc5ddfabfc", null, "MigrationHelperMainnet"],
  [MAINNET_CHAIN_ID, "0xca71c36d26f515ad0cce1d806b231cbc1185cdfc", null, "OperationExecutor"],
  [MAINNET_CHAIN_ID, "0x5f1dc84ba060ea3f7429c6a7bbedd9243cf1209b", null, "FLAction"],
  [MAINNET_CHAIN_ID, "0x40b72bb73b1e9380629b205e7880fa409ae7fcc9", null, "VaultDepositooorV2"],
  [MAINNET_CHAIN_ID, "0x111111125421ca6dc452d289314280a0f8842a65", "1Inch", "AggregationRouterV6"],
  [MAINNET_CHAIN_ID, "0xe78c05c508405207ecc256781b9415e6de1c8336", null, "FLAction"],
  [MAINNET_CHAIN_ID, "0x6cae28b3d09d8f8fc74ccd496ac986fc84c0c24e", null, "ERC1967Proxy"],
  [MAINNET_CHAIN_ID, "0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f", "Relay", null],
  [MAINNET_CHAIN_ID, "0x1111111254eeb25477b68fb85ed929f73a960582", null, "AggregationRouterV5"],
  [MAINNET_CHAIN_ID, "0x4a6c312ec70e8747a587ee860a0353cd42be0ae0", null, "EthereumGeneralAdapter1"],
  [MAINNET_CHAIN_ID, "0xc2b92b6c69e5c3b6b29385c1a17fee906e0ca910", null, "FLAction"],
  [MAINNET_CHAIN_ID, "0x726e3244e2a73405ce13d82862d81e1c5dd0004e", null, "ZapperExecutor"],
  [MAINNET_CHAIN_ID, "0x15392211222b46a0ea85a9a800830486d144848d", null, "MagpieRouterV3"],
  [MAINNET_CHAIN_ID, "0x7a0f3963c666d4549e5909a7162b560abf9f006d", null, "FLAction"],
  [MAINNET_CHAIN_ID, "0x9cfb64d91ce4eb821ff8edc1c2fda2e89e256707", null, "AaveV3Adapter"],
  [MAINNET_CHAIN_ID, "0x2efd4430489e1a05a89c2f51811ac661b7e5ff84", null, "ERC1967Proxy"],
  [MAINNET_CHAIN_ID, "0xba12222222228d8ba445958a75a0704d566bf2c8", null, "Vault"],
  [MAINNET_CHAIN_ID, "0x6a000f20005980200259b80c5102003040001068", "Velora (Formerly Paraswap)", "AugustusV6"],
  [MAINNET_CHAIN_ID, "0x22ac12a6937bbbc0a301af9154d08ead95673122", null, "PoolExposureSteward"],
  [MAINNET_CHAIN_ID, "0xc82e6bc89c64e627437a2caa475062694b8f4498", null, "App"],
  [MAINNET_CHAIN_ID, "0x540a83e36e5e6aa916a6c591934d800e17115048", null, "FLBalancer"],
  [MAINNET_CHAIN_ID, "0xd417d34d7aaf70b24fbc6b36808e3396c991c5e4", null, "MigrationHelperMainnet"],
  [MAINNET_CHAIN_ID, "0x49d3fc00f3acf80fabcb42d7681667b20f60889a", null, "MulticallRouter"],
  [MAINNET_CHAIN_ID, "0x464c71f6c2f760dda6093dcb91c24c39e5d6e18c", null, "InitializableAdminUpgradeabilityProxy"],
  [MAINNET_CHAIN_ID, "0x9f54e8eaa9658316bb8006e03fff1cb191aafbe6", null, "ConnectorDeleverageParaswap"],
  [MAINNET_CHAIN_ID, "0xc5e159fdc179d3ce6d78880da5b8838b983a9714", null, "App"],
  [MAINNET_CHAIN_ID, "0xc1cd3654ab3b37e0bc26bafb5ae4c096892d0b0c", null, "OperationExecutor"],
  [MAINNET_CHAIN_ID, "0xafd306005f5d1a8537be4960e6d23907b5b9383f", null, "ZapperExecutor"],
  [MAINNET_CHAIN_ID, "0x2e61ac206de68c4a39a194d91c96c0185befa159", null, "ClearGHOGsm4626RebalanceAdapter"],
  [MAINNET_CHAIN_ID, "0x2be65f12dcc55c8485030e306a1b01f47c437a8a", null, "FLAction"],
  [MAINNET_CHAIN_ID, "0x0adf6dde7971b273c87456064e99e10193292237", null, "App"],
  [MAINNET_CHAIN_ID, "0x675d37489a7a64c051d0204e5c72a469f6558a47", null, "ZapperExecutor"],
  [MAINNET_CHAIN_ID, "0xb3805e5f44b97dab82bc00d63f7f8c5a56b96d8d", null, "ZapperExecutor"],
  [MAINNET_CHAIN_ID, "0x6e867662e3378595e97279bcaa66d7a103bf6070", null, "OperationExecutor"],
  [MAINNET_CHAIN_ID, "0x661d3c310bd58b3abc1caf671c372288149def15", null, "OperationExecutor"],
  [MAINNET_CHAIN_ID, "0x8fce7852ab757899792863f3560d1274eb0e8821", null, "ZapperExecutor"],
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
  // ── Base, batch 2 (item 430) ──
  [BASE_CHAIN_ID, "0xea49d02c248b357b99670d9e9741f54f72df9cb3", null, "PortalsMulticall"],
  [BASE_CHAIN_ID, "0x344e4d19c851b317bb65d31bb5c4e3815b53d727", null, "FlAaveV3WethGateway"],
  [BASE_CHAIN_ID, "0xdca00000067413240aeab357a3a89ea352d013e8", null, "DcaDotFun"],
  [BASE_CHAIN_ID, "0xa43f2e6e8313b46ddcb9190ce856af0089320956", null, "AaveV3Adapter"],
  [BASE_CHAIN_ID, "0x498581ff718922c3f8e6a244956af099b2652b2b", "Uniswap", "PoolManager"],
  [BASE_CHAIN_ID, "0xef42f78d25f4c681dcad2597fa04877ff802ef4b", null, "MagpieRouterV3"],
  [BASE_CHAIN_ID, "0x6cae28b3d09d8f8fc74ccd496ac986fc84c0c24e", null, "ERC1967Proxy"],
  [BASE_CHAIN_ID, "0x49bc51d8c140b7f64577ba01f5604014450645eb", null, "LendingManager"],
  [BASE_CHAIN_ID, "0xb98c948cfa24072e58935bc004a8a7b376ae746a", null, "GeneralAdapter1"],
  [BASE_CHAIN_ID, "0x5523e61fbef59825831ffbb1306abc3bb03bb3a4", null, "FLAction"],
  [BASE_CHAIN_ID, "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae", "LI.FI", "LiFiDiamond"],
  [BASE_CHAIN_ID, "0x3ae633826cef322b1dfd43e129a0639330982247", null, "AutoRepayingManager"],
  [BASE_CHAIN_ID, "0xb65cbf9689979e1749b38ba5d5155c70500292d8", null, "OperationExecutor"],
  [BASE_CHAIN_ID, "0xb7401d91f1586474164b6c6df328e3c3a5f24649", null, "AaveV3"],
  [BASE_CHAIN_ID, "0xa4b275feaf3a1450fc57270ed863923261abfd05", null, "ZapperExecutor"],
  [BASE_CHAIN_ID, "0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f", null, "RelayRouterV3"],
  [BASE_CHAIN_ID, "0x8b4fc1e68d4e1926cca5dd48f91156de94ea87d7", null, "AaveV3"],
  [BASE_CHAIN_ID, "0x1111111254eeb25477b68fb85ed929f73a960582", null, "AggregationRouterV5"],
  [BASE_CHAIN_ID, "0x87af4769e4134379125a262408e1f3ec60d2ab52", null, "FLAction"],
  [BASE_CHAIN_ID, "0x560740052f380669c90811f711f80b21306d4713", null, "ZapperExecutor"],
  [BASE_CHAIN_ID, "0x83240b049fa89b65be714aed68e5b074df6aac84", null, "Pair"],
  [BASE_CHAIN_ID, "0xac80b9465d70aafbe492a08baea5c6e9d77b1478", null, "AaveV3"],
  [BASE_CHAIN_ID, "0x2b66a88ac79acb3b548066bc1cf2ff2ff445ab45", null, "ERC1967Proxy"],
  [BASE_CHAIN_ID, "0xf0f0f0f0fb0d738452efd03a28e8be14c76d5f73", null, "ElfomoFi"],
  [BASE_CHAIN_ID, "0xd9a463ce7bfff3574c7aa60c14b91a6b7f507b2d", null, "AaveV3"],
  [BASE_CHAIN_ID, "0x0d05a7d3448512b78fa8a9e46c4872c88c4a0d05", null, "OdosRouterV3"],
  [BASE_CHAIN_ID, "0x4fbdd50fb2030e8439fc9a752d37e097def2fb07", null, "LendingManager"],
  [BASE_CHAIN_ID, "0x01a3c8e513b758ebb011f7afaf6c37616c9c24d9", null, "MulticallRouter"],
  [BASE_CHAIN_ID, "0x2d43e84567019d721f095cfd632291c3ee868d8f", null, "OperationExecutor"],
  [BASE_CHAIN_ID, "0xaf49b5164832dfd3501fb8b56c9ecd1e548d730e", null, "RosettaProxy"],
  [BASE_CHAIN_ID, "0xf3f1f5760a614b8146eec5d1c94658720c2425b9", null, "Pair"],
  [BASE_CHAIN_ID, "0x240b3f3bb05475998b3eadfd4caa4f0c6ffbe83b", null, "ERC1967Proxy"],
  [BASE_CHAIN_ID, "0x256f0f254b44c69e431c5eafbb9a86f85da1d1d3", null, "AaveV3"],
  [BASE_CHAIN_ID, "0x0345aa92c7cb97e09b7cc0d55e730cd39c09fa43", null, "Pair"],
  [BASE_CHAIN_ID, "0xce2541ce645a1b232ff2fead53dcd9f369e86ba4", null, "DZapZapCore"],
  [BASE_CHAIN_ID, "0xaabd4b0372240e319f9722c4fd1e2fe0c8d422d2", null, "FLAction"],
  [BASE_CHAIN_ID, "0xe4cfc10ee92bc52c873077e6de418ba0ba4e2609", null, "LeveragedPosition"],
  [BASE_CHAIN_ID, "0xc57775a3e13c7941eccfbaf740392c650b51453d", null, "ZapperExecutor"],
  [BASE_CHAIN_ID, "0x50974aac8ab56a40492767394e758549fe7e7526", null, "ERC1967Proxy"],
  [BASE_CHAIN_ID, "0x8969d747abfbd389767d33774702f260da7c38b0", null, "ERC1967Proxy"],
  [BASE_CHAIN_ID, "0x826bd427d842e18d5fc60975983829f37f90f77b", null, "AaveV3"],
  [BASE_CHAIN_ID, "0x21e890d3da79c78f1b149367cf01d06789f95d39", null, "ZapperExecutor"],
  [BASE_CHAIN_ID, "0xc16db2e93492e3ea512edc90787538652ec5c099", null, "AaveV3Adapter"],
  [BASE_CHAIN_ID, "0xba25a6bf94ceb977ca1b4823158369463e514802", null, "LeveragedPosition"],
  [BASE_CHAIN_ID, "0x92363f9817f92a7ae0592a4cb29959a88d885cc8", null, "PancakePair"],
  [BASE_CHAIN_ID, "0x48eab07dc303ad02ddb9ff2733ba881f6a1b8d64", null, "Pair"],
  [BASE_CHAIN_ID, "0x275cce00b312ef583bb6e07a828c135896ee2a7d", null, "AaveV3Adapter"],
  [BASE_CHAIN_ID, "0x85cfb6917da8cc7c4c3b63f2120d2f636cf317bc", null, "ERC1967Proxy"],
  [BASE_CHAIN_ID, "0x79474223aedd0339780bacce75abda0be84dcbf9", null, "PancakePair"],
  [BASE_CHAIN_ID, "0x13b312fa5153088f71ef14b55953f72f7c0b25ea", null, "LeveragedPosition"],
  // ── Arbitrum ──
  [ARBITRUM_CHAIN_ID, "0x5283beced7adf6d003225c13896e536f2d4264ff", "Aave", "WrappedTokenGatewayV3"],
  // ── Arbitrum, batch 2 (item 430) ──
  [ARBITRUM_CHAIN_ID, "0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f", "Relay", null],
  [ARBITRUM_CHAIN_ID, "0xe28e2c8d240dd5ebd0adcab86fbd79df7a052034", null, "ParaSwapRepayAdapter"],
  [ARBITRUM_CHAIN_ID, "0x28201c152dc5b69a86fa54fcfd21bca4c0eff3ba", null, "ParaSwapRepayAdapter"],
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

/** The bar subject of a transaction sent to `to` (its receipt's `to`): the
 *  product whose entry contract it is, or `undefined`, where the row takes the
 *  protocol's bar. */
export function barSubjectOf(to: string | null | undefined, chainId: ChainId): BarSubject | undefined {
  return getProtocolContract(to, chainId)?.bar;
}

/** A protocol contract (settlement, router, adapter, gateway, multicall,
 *  amm-pool, lending-pool, distributor, staking) on a chain, or `undefined`. */
export function getProtocolContract(
  address: string | null | undefined,
  chainId: ChainId,
): ProtocolContract | undefined {
  const entry = getKnownInfrastructure(address, chainId);
  return entry && entry.kind !== "ccip-lock-release" ? entry : undefined;
}

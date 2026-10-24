// Product entry contracts that are not in the known-infrastructure registry,
// by chain and address, for the timeline's side bar (barSubjectOf in
// known-infrastructure.ts; anatomy P3.1.1). A smart account's transaction
// enters these past the account: a Safe or DSProxy delegatecalls DeFi Saver's
// recipe executor or one of its actions, and DeFi Saver's automation sends to
// its strategy executor. They hold no position tokens, so they are not
// registry entries and the server's plumbing mirror does not list them.
//
// ── Evidence ────────────────────────────────────────────────────────────────
// DeFi Saver: its deployments, `defisaver/defisaver-v3-contracts`
// `addresses/mainnet.json`, `base.json` and `arbitrum.json` (read 23 Oct 2026),
// each contract's current `address` and every address in its `history`; the
// name is the file's `name`, the contract's source file in that repo. The
// owner is stated from the product's own publication, as the registry's
// source order admits (known-infrastructure.ts, "Evidence"). The
// registry's FLAction and FLBalancer entries are the same deployments and take
// the same bar here. Mark: the `defisaver` glyph (protocol-glyphs.tsx); the
// brand's green #37AF6F gives oklch hue 156.
//
// Summer.fi: its deployments, `OasisDEX/oasis-earn-sc` ("Summer Mono"),
// `packages/deploy-configurations/configs/{mainnet,base,arbitrum}.conf.ts`
// (read 23 Oct 2026), the `OperationExecutor` entry's `address` and `history`
// on the default branch `dev` (Ethereum 0xca71…cdfc and 0xc1cd…0b0c, Base
// 0xb65c…92d8, Arbitrum 0x90fe…9a49), and the same entry in the DMA
// deployment commits on the repo's deployment branches: Ethereum 0xfff3…bc83
// with history 0xd455…2b12 and 0x7d81…f1a7 (7a18fd18, #604), Base 0x2d43…8d8f
// with history 0x0364…9314 (f91ce47e), Arbitrum 0xa784…a46c (902c762a, #602)
// and 0x5024…9efe (e0d698b3, #621). Addresses named only on the Ajna
// feature branches' working configs are left out. The registry's
// OperationExecutor entries among these take the same bar here; its mainnet
// executors 0x6e86…6070 and 0x661d…ef15 appear nowhere in the repo, so they
// keep their role. Mark: the `summerfi` glyph (protocol-glyphs.tsx); the
// brand's gradient runs pink #FF49A4 to purple #B049FF and the purple covers
// most of it, oklch hue 306.
//
// Instadapp: no entry contract here yet (a DSA's `cast` names connectors by
// string); the subject is stated once for the wallet heading's manager chip
// (lib/shared/account-managers.ts) and any later bar. Its deployments are
// `Instadapp/dsa-contracts` `docs/addresses.json`. Mark: the `instadapp` glyph
// (protocol-glyphs.tsx); the brand's blue #3F75FF gives oklch hue 265.

import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { BarSubject } from "@/lib/shared/known-infrastructure";

export const DEFI_SAVER_BAR: BarSubject = { name: "DeFi Saver", icon: "defisaver", hue: 156 };

/** summer.fi, read 23 Oct 2026: "Summer.fi is winding down. The Summer.fi app
 *  has now been deactivated." The page dates it no closer than its 2026 footer. */
export const SUMMER_FI_BAR: BarSubject = {
  name: "Summer.fi",
  icon: "summerfi",
  hue: 306,
  closed: { since: "2026", source: "https://summer.fi/" },
};

export const INSTADAPP_BAR: BarSubject = { name: "Instadapp", icon: "instadapp", hue: 265 };

const SUMMER_FI: [ChainId, string][] = [
  [MAINNET_CHAIN_ID, "0xca71c36d26f515ad0cce1d806b231cbc1185cdfc"],
  [MAINNET_CHAIN_ID, "0xc1cd3654ab3b37e0bc26bafb5ae4c096892d0b0c"],
  [MAINNET_CHAIN_ID, "0xfff30c67eea809123596252e132d30e1eb75bc83"],
  [MAINNET_CHAIN_ID, "0xd4554d1c818a99d23f29aa6dabb02fe810972b12"],
  [MAINNET_CHAIN_ID, "0x7d81740b28ea699ee84031d3562a93f481b3f1a7"],
  [BASE_CHAIN_ID, "0xb65cbf9689979e1749b38ba5d5155c70500292d8"],
  [BASE_CHAIN_ID, "0x2d43e84567019d721f095cfd632291c3ee868d8f"],
  [BASE_CHAIN_ID, "0x03644f489bf16b1eafa68f495955eb5a78189314"],
  [ARBITRUM_CHAIN_ID, "0x90feaf7727a6ce75f518728d296877830fd39a49"],
  [ARBITRUM_CHAIN_ID, "0xa7840fa682506117f4549e918930c80c1fc3a46c"],
  [ARBITRUM_CHAIN_ID, "0x50241265f81a568a536a205f1f4bea8899df9efe"],
];

/** The role words the bar's receipt names a contract by, after the owner's name. */
const DEFI_SAVER_ROLES: Record<string, string> = {
  RecipeExecutor: "recipe executor",
  StrategyExecutor: "strategy executor",
  FLAction: "flash-loan action",
  FLBalancer: "Balancer flash-loan action",
  AaveV3Supply: "Aave V3 supply action",
  AaveV3Withdraw: "Aave V3 withdraw action",
  AaveV3Borrow: "Aave V3 borrow action",
  AaveV3Payback: "Aave V3 payback action",
  AaveV3ATokenPayback: "Aave V3 aToken payback action",
  AaveV3CollateralSwitch: "Aave V3 collateral switch action",
  AaveV3SetEMode: "Aave V3 eMode action",
  AaveV3ClaimRewards: "Aave V3 rewards claim action",
  AaveV3SwapBorrowRateMode: "Aave V3 rate-mode action",
  AaveV3DelegateCredit: "Aave V3 credit delegation action",
  AaveV3DelegateWithSig: "Aave V3 signed credit delegation action",
};

const DEFI_SAVER: [ChainId, string, keyof typeof DEFI_SAVER_ROLES][] = [
  [MAINNET_CHAIN_ID, "0x8278da54b4a47c0f6f4a0a4b00b6f31678f30181", "StrategyExecutor"],
  [MAINNET_CHAIN_ID, "0xfaa763790b26e7ea354373072bab02e680eeb07f", "StrategyExecutor"],
  [MAINNET_CHAIN_ID, "0x252025df8680c275d0ba80d084e5967d8bd26caf", "StrategyExecutor"],
  [MAINNET_CHAIN_ID, "0x6a1c1b8a27e7613a595ffb7cce225bdda7e04832", "StrategyExecutor"],
  [MAINNET_CHAIN_ID, "0xbc3fc959fef3f12a41738f406c02198cdee7481f", "RecipeExecutor"],
  [MAINNET_CHAIN_ID, "0x4677c84699ab29637102609cd2868d0743a48ddf", "RecipeExecutor"],
  [MAINNET_CHAIN_ID, "0x2ee96cf53ae5fbd5309284704f978d0ca66cb963", "RecipeExecutor"],
  [MAINNET_CHAIN_ID, "0x5029336642814bc51a42ba80bf83a6322110035d", "RecipeExecutor"],
  [MAINNET_CHAIN_ID, "0xe822d76c2632fc52f3eaa686bda9cea3212579d8", "RecipeExecutor"],
  [MAINNET_CHAIN_ID, "0x1d6dedb49af91a11b5c5f34954fd3e8cc4f03a86", "RecipeExecutor"],
  [MAINNET_CHAIN_ID, "0x91b3fccea2f2e0622cc1fb54e12f5ac5aaa55a87", "AaveV3Supply"],
  [MAINNET_CHAIN_ID, "0x2d10281757ca0a716311a6c5eb456a098cd14cd7", "AaveV3Supply"],
  [MAINNET_CHAIN_ID, "0x9253e22ce4f0aee541301cf8cc29843f9083a1f4", "AaveV3DelegateWithSig"],
  [MAINNET_CHAIN_ID, "0xde5c012cd1878d86e91309593764895a3adb380e", "AaveV3ATokenPayback"],
  [MAINNET_CHAIN_ID, "0x7079ba1bd00eefcd2a260bbd6d088230505e3858", "AaveV3Borrow"],
  [MAINNET_CHAIN_ID, "0x998a2e9aae03c11b7a9863c1f59c42a21fcf47d0", "AaveV3ClaimRewards"],
  [MAINNET_CHAIN_ID, "0x54a4d6cb567b2c6cde4687c361b24fd912695dab", "AaveV3CollateralSwitch"],
  [MAINNET_CHAIN_ID, "0xe29265217d65f5a2ae41972e09c13e107d049004", "AaveV3Payback"],
  [MAINNET_CHAIN_ID, "0xbe7f735d7955e0461579e34266f41f928ae06d78", "AaveV3SetEMode"],
  [MAINNET_CHAIN_ID, "0x630f530ac523c935cf2528e62d0a06f8900c5b1b", "AaveV3SwapBorrowRateMode"],
  [MAINNET_CHAIN_ID, "0x9d4e4b26a5e2e6dad30c5d95f5ce78a8310f04c2", "AaveV3Withdraw"],
  [MAINNET_CHAIN_ID, "0x93d333930c7f7260a1e6061b0a8c0cbdec95f367", "FLBalancer"],
  [MAINNET_CHAIN_ID, "0x540a83e36e5e6aa916a6c591934d800e17115048", "FLBalancer"],
  [MAINNET_CHAIN_ID, "0x5c7a9f4635ae4f95da2e45317311aae255fb71b3", "FLBalancer"],
  [MAINNET_CHAIN_ID, "0xe78c05c508405207ecc256781b9415e6de1c8336", "FLAction"],
  [MAINNET_CHAIN_ID, "0xac83378e8b075f95640d581a42cba80452caeea3", "FLAction"],
  [MAINNET_CHAIN_ID, "0x7a0f3963c666d4549e5909a7162b560abf9f006d", "FLAction"],
  [MAINNET_CHAIN_ID, "0x5f1dc84ba060ea3f7429c6a7bbedd9243cf1209b", "FLAction"],
  [MAINNET_CHAIN_ID, "0xc2b92b6c69e5c3b6b29385c1a17fee906e0ca910", "FLAction"],
  [MAINNET_CHAIN_ID, "0x2be65f12dcc55c8485030e306a1b01f47c437a8a", "FLAction"],
  [MAINNET_CHAIN_ID, "0x72915d41982dfcaf30b871290618e59c45edba7f", "FLAction"],
  [MAINNET_CHAIN_ID, "0x9ec9e483edb2daca782222ff32b261ad56e43879", "FLAction"],
  [MAINNET_CHAIN_ID, "0xa7ab39edcb0a1b742dcd908ec6cfe178d8322580", "AaveV3DelegateCredit"],
  [BASE_CHAIN_ID, "0x0e778a2e5c9a2cc75c5b38d6347284b8836e65d6", "StrategyExecutor"],
  [BASE_CHAIN_ID, "0x0d099e38f6af8778c5053349c350aad906b1432f", "StrategyExecutor"],
  [BASE_CHAIN_ID, "0x49658e0cf3883c338397c7257619b280df581057", "StrategyExecutor"],
  [BASE_CHAIN_ID, "0xc91305dde651c899ef8ee1d0c33e7dab1b5abf0d", "RecipeExecutor"],
  [BASE_CHAIN_ID, "0x7de85e67745a027d41aba5fe2d9b288e6467d710", "RecipeExecutor"],
  [BASE_CHAIN_ID, "0x7a87565b77dd65bbc153fe20e97743842f1a6e0c", "RecipeExecutor"],
  [BASE_CHAIN_ID, "0xd0ae279e330f98c399375f80968c8bf860202766", "RecipeExecutor"],
  [BASE_CHAIN_ID, "0xddffd19564f9703800da8a2fb9c2b4a7242bf01f", "RecipeExecutor"],
  [BASE_CHAIN_ID, "0x87af4769e4134379125a262408e1f3ec60d2ab52", "FLAction"],
  [BASE_CHAIN_ID, "0x172a75c3ccaf3b35bc1c604cbea1367bf7fb968e", "FLAction"],
  [BASE_CHAIN_ID, "0xda86b4c61a545a4b217746ba43c8157f0ec612c7", "FLAction"],
  [BASE_CHAIN_ID, "0x5523e61fbef59825831ffbb1306abc3bb03bb3a4", "FLAction"],
  [BASE_CHAIN_ID, "0xaabd4b0372240e319f9722c4fd1e2fe0c8d422d2", "FLAction"],
  [BASE_CHAIN_ID, "0x862e533198c9656b75bb6a5ddf0953f7ed5e8507", "FLBalancer"],
  [BASE_CHAIN_ID, "0x3d57875885e3cee9e56cb65d21789893b6e67815", "AaveV3ATokenPayback"],
  [BASE_CHAIN_ID, "0x8c6ec1a4869e2b307ee1667e1c18d5776b61cce3", "AaveV3Borrow"],
  [BASE_CHAIN_ID, "0xceb876c6a4dd76afe645622db00d4e051d16da66", "AaveV3ClaimRewards"],
  [BASE_CHAIN_ID, "0xfdfea6469c537b19a334726e01621810bc49b929", "AaveV3CollateralSwitch"],
  [BASE_CHAIN_ID, "0x1a8b4df4de4274630a5c5a8e42fa5f0ddf654ec2", "AaveV3Payback"],
  [BASE_CHAIN_ID, "0xdef8b05ce194d50c376233c9c5530027f6180442", "AaveV3SetEMode"],
  [BASE_CHAIN_ID, "0x4df428298a204e4881d95611320b30938cb3facd", "AaveV3Supply"],
  [BASE_CHAIN_ID, "0x741fcfc1d708cea0d845fd04de51022b6d00e060", "AaveV3Supply"],
  [BASE_CHAIN_ID, "0x9e295afac75e7843b88a563d119fd953edf441c2", "AaveV3DelegateWithSig"],
  [BASE_CHAIN_ID, "0x9d1d7a0dd5e82cce9cc131ec0c807b0f543be70e", "AaveV3SwapBorrowRateMode"],
  [BASE_CHAIN_ID, "0x1d2fa7dacc660a9124c3685ee8a6e699d10409eb", "AaveV3Withdraw"],
  [BASE_CHAIN_ID, "0xf85ad63c513a76a1dc05b2addc4777f17336c7e9", "AaveV3DelegateCredit"],
  [ARBITRUM_CHAIN_ID, "0xa2127f5c7e943c05b6a6a3a541557087f1f1287d", "AaveV3Supply"],
  [ARBITRUM_CHAIN_ID, "0xf159c79077001e2a2c1a178be68db7f69a6da486", "AaveV3Supply"],
  [ARBITRUM_CHAIN_ID, "0x18a1e6775a4ff6f07c4b9aa46f82d13c593c17d2", "AaveV3Supply"],
  [ARBITRUM_CHAIN_ID, "0x1ffd0e73eb34013951a3da99e10ba5bc4e786dd3", "AaveV3Supply"],
  [ARBITRUM_CHAIN_ID, "0xd4ae9d95faca89b235b8a71f410501104ff16e56", "AaveV3Supply"],
  [ARBITRUM_CHAIN_ID, "0xff2ce05250d1880f0f45ea8fb453292caba42f12", "AaveV3DelegateWithSig"],
  [ARBITRUM_CHAIN_ID, "0x261906e5e0d0d38d9cbb5c10db9c4031aabdf8c1", "AaveV3ATokenPayback"],
  [ARBITRUM_CHAIN_ID, "0x5786809da660db613994460f096f19fcd19ed4c9", "AaveV3Borrow"],
  [ARBITRUM_CHAIN_ID, "0xe729954e40546557fa547ecd163644457da28a04", "AaveV3Borrow"],
  [ARBITRUM_CHAIN_ID, "0x7acdd66c13f87b1cbce7b106a8c34e426475badd", "AaveV3CollateralSwitch"],
  [ARBITRUM_CHAIN_ID, "0xd88d5356e08dad84e1576f89f4bf43c79a8bf0b2", "AaveV3Payback"],
  [ARBITRUM_CHAIN_ID, "0x05dd6025d4075bbca3260c5edbefcf7574d4af70", "AaveV3Payback"],
  [ARBITRUM_CHAIN_ID, "0x99d5068d9520316e8d3b5136c0b6ea33c5e0c27e", "AaveV3SetEMode"],
  [ARBITRUM_CHAIN_ID, "0x738042389a8d6b0f6d6ab009c42dff84ebb737c0", "AaveV3SwapBorrowRateMode"],
  [ARBITRUM_CHAIN_ID, "0xbf492f869ddb1a18bb4f41b6c3059d9f882fe7ff", "AaveV3Withdraw"],
  [ARBITRUM_CHAIN_ID, "0x204ae0d3f7cb0db44a297dc4ad433298ed2042f3", "AaveV3Withdraw"],
  [ARBITRUM_CHAIN_ID, "0x3a4d72ed2a47a409a82ba61f0fca1c749ea8ab66", "AaveV3ClaimRewards"],
  [ARBITRUM_CHAIN_ID, "0x667609f05ddc5e9fb939ec376f07953403745cf3", "RecipeExecutor"],
  [ARBITRUM_CHAIN_ID, "0x6927f7dc79b4215f307e6c1c4d5883d134053bab", "RecipeExecutor"],
  [ARBITRUM_CHAIN_ID, "0x7a25174229ea402d8ccd35fc6d55af079c399884", "RecipeExecutor"],
  [ARBITRUM_CHAIN_ID, "0x4417bfffd5e3131069f62fac07e40704ee234404", "RecipeExecutor"],
  [ARBITRUM_CHAIN_ID, "0xe775c59e5662597bce8ab4432c06380709554883", "RecipeExecutor"],
  [ARBITRUM_CHAIN_ID, "0xc1cb462033d8319016df4e8a1810f1afb06b50bb", "RecipeExecutor"],
  [ARBITRUM_CHAIN_ID, "0xf041c72e201cd7d04a240fe06c5783e2ee2d92b3", "FLAction"],
  [ARBITRUM_CHAIN_ID, "0x1f46db75d1d0295933c8c05f691b15896c0f5752", "FLAction"],
  [ARBITRUM_CHAIN_ID, "0x6ad754298a902320919cba7a633a222d56d4b83b", "FLAction"],
  [ARBITRUM_CHAIN_ID, "0x557f8e26358aa697a3b3838f21fa20df3ab9afbd", "FLAction"],
  [ARBITRUM_CHAIN_ID, "0x9fd9884428615df36c28b9ba206b67ded81eb741", "FLAction"],
  [ARBITRUM_CHAIN_ID, "0xab4aa2fcea33205b44a556f8c48cec3f21aff0c3", "FLAction"],
  [ARBITRUM_CHAIN_ID, "0x1561eaf39c98d45c55c7dc605e627672f4406819", "FLAction"],
  [ARBITRUM_CHAIN_ID, "0xfbd213073fc4f597c840b1ee202678d210d765fb", "FLAction"],
  [ARBITRUM_CHAIN_ID, "0x7ec50d40c78a05dd9e8a93a222e21b2d2b29420b", "StrategyExecutor"],
  [ARBITRUM_CHAIN_ID, "0xa4f087267828c3ca8ac18b6fe7f456ab20781aa6", "StrategyExecutor"],
  [ARBITRUM_CHAIN_ID, "0x9652f91b10045cd2a36ca8d87df4a800ed2af05d", "StrategyExecutor"],
  [ARBITRUM_CHAIN_ID, "0xdb28fe77709d88badc86868b27937428c3f48e73", "FLBalancer"],
  [ARBITRUM_CHAIN_ID, "0x8c13353e3da67d3171d6f73751e3caa791a3aacd", "AaveV3DelegateCredit"],
];

/** A product entry contract: who owns it, its name in the owner's deployments,
 *  and the role words the receipt uses. */
export interface BarOwner {
  subject: BarSubject;
  contractName: string;
  role: string;
  /** Where the owner is stated, for the receipt's name leaf. */
  source: string;
  /** The owner's deployments, the name leaf's link. */
  href: string;
}

const OWNERS = new Map<string, BarOwner>();
function add(chainId: ChainId, address: string, owner: BarOwner) {
  const key = `${chainId}:${address}`;
  if (OWNERS.has(key)) throw new Error(`bar-owners: duplicate ${key}`);
  OWNERS.set(key, owner);
}
for (const [chainId, address, contractName] of DEFI_SAVER)
  add(chainId, address, {
    subject: DEFI_SAVER_BAR,
    contractName,
    role: DEFI_SAVER_ROLES[contractName],
    source: "DeFi Saver's deployments (defisaver-v3-contracts, addresses/)",
    href: "https://github.com/defisaver/defisaver-v3-contracts/tree/main/addresses",
  });
for (const [chainId, address] of SUMMER_FI)
  add(chainId, address, {
    subject: SUMMER_FI_BAR,
    contractName: "OperationExecutor",
    role: "operation executor",
    source: "Summer.fi's deployments (oasis-earn-sc, packages/deploy-configurations/configs/)",
    href: "https://github.com/OasisDEX/oasis-earn-sc/tree/dev/packages/deploy-configurations/configs",
  });

export function barOwnerOf(address: string | null | undefined, chainId: ChainId): BarOwner | undefined {
  return address ? OWNERS.get(`${chainId}:${address.toLowerCase()}`) : undefined;
}

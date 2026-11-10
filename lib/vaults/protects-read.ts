// The reads behind a vault page's "What protects it" (V9) and "The protocol
// underneath" (V10), rails-ops ui-jobs 554 pieces A and B. One reader per
// family, every call at one pinned head block through `vaultHeadClient`; the
// deploy checks read the archive (`eth_getCode` either side of the creation
// block, then the block's time) through `chainClient`. The facts go to
// lib/vaults/protects-words.ts and lib/vaults/protects-provenance.ts.
//
// SERVER-ONLY: the reads use the RPC keys.

import "server-only";
import { parseAbi, stringToHex, type Address, type PublicClient } from "viem";
import type { ReadContract } from "@/components/shared/read-stamp";
import type { ChainId } from "@/lib/shared/chains";
import { vaultHeadClient } from "@/lib/sources/api/head-reads-client";
import { chainClient } from "@/lib/sources/chain/rpc";
import { MORPHO_BASE_DEPLOY_BLOCK } from "@/lib/morpho-base/asset-catalog";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";
import type {
  AaveGovFact,
  CodeFact,
  DeployFact,
  ProtectsFact,
  ProxyFact,
  UnderneathFact,
  WaitFact,
} from "@/lib/vaults/protects-words";

export type ProtectsKind = "metamorpho" | "yearn-v3" | "stata" | "sgho" | "umbrella-stake" | "maple-pool";

export interface ProtectsSubject {
  chainId: ChainId;
  address: string;
  kind: ProtectsKind;
  /** A Yearn vault's creation block, from the roster: the deploy of a vault that holds its code whole. */
  createdBlock?: number;
}

export interface ProtectsRead {
  chainId: ChainId;
  block: number;
  protects: ProtectsFact;
  underneath: UnderneathFact;
  /** What each section's read stamp lists as read at the block. */
  protectsContracts: ReadContract[];
  underneathContracts: ReadContract[];
}

// ── Addresses (official address books) ─────────────────────────────────────

/** Morpho Blue: the same address on Ethereum and Base. */
const MORPHO_BLUE: Address = "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb";
/** Aave V3 Ethereum, from aave-dao/aave-address-book (AaveV3Ethereum, GovernanceV3Ethereum). */
const AAVE = {
  pool: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
  payloadsController: "0xdabad81af85554e9ae636395611c58f7ec1aaec5",
  governance: "0x9aee0b04504cef83a65ac3f0e838d0593bcb2bc7",
} as const satisfies Record<string, Address>;
const MAPLE_GLOBALS: Address = "0x804a6f5f667170f545bf14e5ddb48c70b788390c";

/** Creation blocks: a repo constant where one exists, else found by bisecting
 *  `eth_getCode` (9 Nov 2026). Each is checked again when read. */
const DEPLOYS: Record<string, number> = {
  [`1:${MORPHO_BLUE}`]: 18_883_124,
  [`8453:${MORPHO_BLUE}`]: MORPHO_BASE_DEPLOY_BLOCK,
  [`1:${AAVE.pool}`]: 16_291_127,
  /** Yearn VaultV3 implementations, the targets of each factory's copies. */
  "1:0x1ab62413e0cf2ebeb73da7d40c70e7202ae14467": 19_372_641, // 3.0.2
  "1:0xca78af7443f3f8fa0148b746cb18ff67383cdf3f": 20_818_132, // 3.0.3
  "1:0xd8063123bba3b480569244ae66bfe72b6c84b00d": 21_087_100, // 3.0.4
  "1:0xdd3fa86409658d207a9be0141ee560c8db557824": 25_353_099, // 3.1.0
  /** Umbrella. */
  "1:0xd400fc38ed4732893174325693a63c30ee3881a8": 22_481_753,
  /** sGHO. */
  "1:0xe1753f2e00940cc31213dd92013cf019dfe4ca1d": 25_028_623,
  ...Object.fromEntries(MAPLE_POOLS.map((p) => [`1:${p.poolManager}`, p.deployBlock])),
};

const DEPLOY_SOURCE: Record<string, string> = {
  [`8453:${MORPHO_BLUE}`]: "MORPHO_BASE_DEPLOY_BLOCK in lib/morpho-base/asset-catalog.ts",
  ...Object.fromEntries(
    MAPLE_POOLS.map((p) => [`1:${p.poolManager}`, "the pool's deployBlock in lib/maple/asset-catalog.ts"]),
  ),
};

// ── Slots and code ─────────────────────────────────────────────────────────

const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const ZERO = "0x0000000000000000000000000000000000000000";

const word = (s: string | undefined): Address | null => {
  const a = s ? (`0x${s.slice(-40).toLowerCase()}` as Address) : null;
  return a && a !== ZERO ? a : null;
};

/** The opcodes that let deployed code run other code or delete itself, found
 *  by a linear sweep that skips PUSH data and the bytes after a halt until the
 *  next JUMPDEST (where data sections and appended immutables sit). */
export function codeHooks(code: string): string[] {
  const b = code.slice(2);
  const found = new Set<string>();
  let live = true;
  for (let i = 0; i < b.length; i += 2) {
    const op = parseInt(b.slice(i, i + 2), 16);
    if (op === 0x5b) {
      live = true;
      continue;
    }
    if (!live) continue;
    if (op >= 0x60 && op <= 0x7f) {
      i += (op - 0x5f) * 2;
      continue;
    }
    if (op === 0xf4) found.add("DELEGATECALL");
    else if (op === 0xf2) found.add("CALLCODE");
    else if (op === 0xff) found.add("SELFDESTRUCT");
    // STOP, JUMP, RETURN, REVERT, INVALID, SELFDESTRUCT end the straight line.
    if (op === 0x00 || op === 0x56 || op === 0xf3 || op === 0xfd || op === 0xfe || op === 0xff) live = false;
  }
  return [...found];
}

/** The EIP-1167 copy's target, where `code` is one. */
function cloneTarget(code: string): Address | null {
  const m = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i.exec(code);
  return m ? (`0x${m[1].toLowerCase()}` as Address) : null;
}

const codeFact = (address: string, code: string | undefined): CodeFact => ({
  address,
  bytes: Math.max(0, ((code ?? "0x").length - 2) / 2),
  hooks: codeHooks(code ?? "0x"),
});

/** Checked deploys, kept for the process: a creation block does not move. */
const deployMemo = new Map<string, DeployFact>();

/** The creation block, checked: no code one block before, code at it. */
async function deployOf(chainId: ChainId, address: string, known?: { block: number; source: string }) {
  const key = `${chainId}:${address.toLowerCase()}`;
  const block = DEPLOYS[key] ?? known?.block;
  if (block == null) return null;
  const memo = deployMemo.get(key);
  if (memo && memo.block === block) return memo;
  const c = chainClient(chainId);
  const a = address as Address;
  const [before, at, b] = await Promise.all([
    c.getCode({ address: a, blockNumber: BigInt(block - 1) }).catch(() => null),
    c.getCode({ address: a, blockNumber: BigInt(block) }).catch(() => null),
    c.getBlock({ blockNumber: BigInt(block) }).catch(() => null),
  ]);
  const answered = before !== null && at !== null;
  const checked = answered ? (before === undefined || before === "0x") && at != null && at.length > 2 : null;
  const d: DeployFact = {
    address: address.toLowerCase(),
    block,
    at: b ? Number(b.timestamp) : null,
    checked,
    source: DEPLOY_SOURCE[key] ?? (DEPLOYS[key] != null ? "found by bisecting eth_getCode" : known!.source),
  };
  if (checked && d.at != null) deployMemo.set(key, d);
  return d;
}

interface Head {
  c: PublicClient;
  block: bigint;
}

const OWNER = parseAbi(["function owner() view returns (address)"]);
const ownerOf = (h: Head, address: string) =>
  h.c.readContract({ address: address as Address, abi: OWNER, functionName: "owner", blockNumber: h.block });

async function proxyOf(h: Head, name: string, address: string): Promise<ProxyFact> {
  const a = address as Address;
  const [impl, admin] = await Promise.all([
    h.c.getStorageAt({ address: a, slot: IMPL_SLOT, blockNumber: h.block }),
    h.c.getStorageAt({ address: a, slot: ADMIN_SLOT, blockNumber: h.block }),
  ]);
  const adminAddr = word(admin);
  const adminOwner = adminAddr ? await ownerOf(h, adminAddr).catch(() => null) : null;
  return { name, address: address.toLowerCase(), impl: word(impl), admin: adminAddr, adminOwner };
}

// ── Aave governance (the wrappers, sGHO and Umbrella) ──────────────────────

const PC_ABI = parseAbi([
  "struct ExecutorConfig { address executor; uint40 delay; }",
  "function getExecutorSettingsByAccessControl(uint8 accessControl) view returns (ExecutorConfig)",
  "function guardian() view returns (address)",
]);
const GOV_ABI = parseAbi([
  "struct VotingConfig { uint24 coolDownBeforeVotingStart; uint24 votingDuration; uint56 yesThreshold; uint56 yesNoDifferential; uint56 minPropositionPower; }",
  "function getVotingConfig(uint8 accessLevel) view returns (VotingConfig)",
]);
const ACCESS_ABI = parseAbi(["function hasRole(bytes32 role, address account) view returns (bool)"]);
const DEFAULT_ADMIN_ROLE = `0x${"0".repeat(64)}` as const;

async function aaveGovernance(h: Head): Promise<AaveGovFact> {
  const at = { address: AAVE.payloadsController, abi: PC_ABI, blockNumber: h.block } as const;
  const [exec, guardian, voting] = await Promise.all([
    h.c.readContract({ ...at, functionName: "getExecutorSettingsByAccessControl", args: [1] }),
    h.c.readContract({ ...at, functionName: "guardian" }),
    h.c.readContract({
      address: AAVE.governance,
      abi: GOV_ABI,
      functionName: "getVotingConfig",
      args: [1],
      blockNumber: h.block,
    }),
  ]);
  return {
    governance: AAVE.governance,
    payloadsController: AAVE.payloadsController,
    executor: exec.executor.toLowerCase(),
    delay: Number(exec.delay),
    votingDuration: Number(voting.votingDuration),
    coolDown: Number(voting.coolDownBeforeVotingStart),
    guardian: guardian.toLowerCase(),
  };
}

const hasAdmin = (h: Head, contract: string, account: string) =>
  h.c
    .readContract({
      address: contract as Address,
      abi: ACCESS_ABI,
      functionName: "hasRole",
      args: [DEFAULT_ADMIN_ROLE, account as Address],
      blockNumber: h.block,
    })
    .catch(() => null);

const GOV_CONTRACTS: ReadContract[] = [
  { name: "Aave Governance", address: AAVE.governance, reads: "getVotingConfig(1)" },
  {
    name: "Aave PayloadsController",
    address: AAVE.payloadsController,
    reads: "getExecutorSettingsByAccessControl(1), guardian()",
  },
];

type Reader = (s: ProtectsSubject, h: Head) => Promise<Omit<ProtectsRead, "chainId" | "block">>;

// ── MetaMorpho ─────────────────────────────────────────────────────────────

const MM_ABI = parseAbi([
  "function timelock() view returns (uint256)",
  "function guardian() view returns (address)",
  "function owner() view returns (address)",
  "function pendingTimelock() view returns (uint192 value, uint64 validAt)",
  "function pendingGuardian() view returns (address value, uint64 validAt)",
]);

const metaMorpho: Reader = async (s, h) => {
  const at = { address: s.address as Address, abi: MM_ABI, blockNumber: h.block } as const;
  const [timelock, guardian, owner, [ptValue, ptAt], [pgValue, pgAt]] = await Promise.all([
    h.c.readContract({ ...at, functionName: "timelock" }),
    h.c.readContract({ ...at, functionName: "guardian" }),
    h.c.readContract({ ...at, functionName: "owner" }),
    h.c.readContract({ ...at, functionName: "pendingTimelock" }),
    h.c.readContract({ ...at, functionName: "pendingGuardian" }),
  ]);
  const [deploy, proxy, code, blueOwner] = await Promise.all([
    deployOf(s.chainId, MORPHO_BLUE),
    proxyOf(h, "Morpho Blue", MORPHO_BLUE),
    h.c.getCode({ address: MORPHO_BLUE, blockNumber: h.block }),
    ownerOf(h, MORPHO_BLUE),
  ]);
  return {
    protects: {
      kind: "metamorpho",
      vault: s.address,
      timelock: Number(timelock),
      guardian: word(guardian),
      owner: owner.toLowerCase(),
      pendingTimelock: ptAt > BigInt(0) ? { value: Number(ptValue), validAt: Number(ptAt) } : null,
      pendingGuardian: pgAt > BigInt(0) ? { value: pgValue.toLowerCase(), validAt: Number(pgAt) } : null,
    },
    underneath: {
      kind: "morpho-blue",
      address: MORPHO_BLUE,
      deploy,
      proxy,
      code: codeFact(MORPHO_BLUE, code),
      owner: blueOwner.toLowerCase(),
    },
    protectsContracts: [
      {
        name: "Vault",
        address: s.address,
        reads: "timelock(), guardian(), owner(), pendingTimelock(), pendingGuardian()",
      },
    ],
    underneathContracts: [
      { name: "Morpho Blue", address: MORPHO_BLUE, reads: "owner(), the EIP-1967 slots, its code" },
    ],
  };
};

// ── Yearn V3 ───────────────────────────────────────────────────────────────

const YEARN_ABI = parseAbi([
  "function profitMaxUnlockTime() view returns (uint256)",
  "function role_manager() view returns (address)",
  "function apiVersion() view returns (string)",
  "function FACTORY() view returns (address)",
]);

const yearn: Reader = async (s, h) => {
  const at = { address: s.address as Address, abi: YEARN_ABI, blockNumber: h.block } as const;
  const [unlock, roleManager, version, factory, code] = await Promise.all([
    h.c.readContract({ ...at, functionName: "profitMaxUnlockTime" }),
    h.c.readContract({ ...at, functionName: "role_manager" }),
    h.c.readContract({ ...at, functionName: "apiVersion" }),
    h.c.readContract({ ...at, functionName: "FACTORY" }),
    h.c.getCode({ address: s.address as Address, blockNumber: h.block }),
  ]);
  const target = cloneTarget(code ?? "0x");
  const [deploy, runs] = target
    ? await Promise.all([
        deployOf(1, target),
        h.c.getCode({ address: target, blockNumber: h.block }).then((c) => codeFact(target, c)),
      ])
    : [
        await deployOf(
          1,
          s.address,
          s.createdBlock ? { block: s.createdBlock, source: "the Yearn roster's createdBlock" } : undefined,
        ),
        code && code.length > 2 ? codeFact(s.address, code) : null,
      ];
  return {
    protects: { kind: "yearn-v3", vault: s.address, unlock: Number(unlock), roleManager: roleManager.toLowerCase() },
    underneath: {
      kind: "yearn-v3",
      vault: s.address,
      version,
      factory: factory.toLowerCase(),
      cloneOf: target,
      code: runs,
      deploy,
    },
    protectsContracts: [{ name: "Vault", address: s.address, reads: "profitMaxUnlockTime(), role_manager()" }],
    underneathContracts: [
      { name: "Vault", address: s.address, reads: "apiVersion(), FACTORY(), its code" },
      ...(target ? [{ name: "Implementation", address: target, reads: "its code" }] : []),
    ],
  };
};

// ── Aave: the wrappers and sGHO ────────────────────────────────────────────

const STATA_ABI = parseAbi(["function POOL() view returns (address)"]);
const POOL_ABI = parseAbi(["function ADDRESSES_PROVIDER() view returns (address)"]);

const stata: Reader = async (s, h) => {
  const gov = await aaveGovernance(h);
  const pool = (
    await h.c
      .readContract({ address: s.address as Address, abi: STATA_ABI, functionName: "POOL", blockNumber: h.block })
      .catch(() => AAVE.pool as Address)
  ).toLowerCase();
  const provider = (
    await h.c.readContract({
      address: pool as Address,
      abi: POOL_ABI,
      functionName: "ADDRESSES_PROVIDER",
      blockNumber: h.block,
    })
  ).toLowerCase();
  const [deploy, poolProxy, poolCode, providerOwner, wrapper] = await Promise.all([
    deployOf(1, pool),
    proxyOf(h, "Pool", pool),
    h.c.getCode({ address: pool as Address, blockNumber: h.block }),
    ownerOf(h, provider).catch(() => null),
    proxyOf(h, "Wrapper", s.address),
  ]);
  return {
    protects: { kind: "aave-gov", subject: "stata", vault: s.address, gov, govAdmin: null },
    underneath: {
      kind: "aave-pool",
      pool,
      deploy,
      poolImpl: poolProxy.impl,
      provider,
      adminInCode: (poolCode ?? "").toLowerCase().includes(provider.slice(2)),
      providerOwner: providerOwner?.toLowerCase() ?? null,
      wrapper,
      gov,
    },
    protectsContracts: GOV_CONTRACTS,
    underneathContracts: [
      { name: "Wrapper", address: s.address, reads: "POOL(), the EIP-1967 slots" },
      { name: "Aave V3 Pool", address: pool, reads: "ADDRESSES_PROVIDER(), the EIP-1967 slots, its code" },
      { name: "PoolAddressesProvider", address: provider, reads: "owner()" },
      ...GOV_CONTRACTS,
    ],
  };
};

const sgho: Reader = async (s, h) => {
  const gov = await aaveGovernance(h);
  const [govAdmin, deploy, proxy] = await Promise.all([
    hasAdmin(h, s.address, gov.executor),
    deployOf(1, s.address),
    proxyOf(h, "sGHO", s.address),
  ]);
  return {
    protects: { kind: "aave-gov", subject: "sgho", vault: s.address, gov, govAdmin },
    underneath: { kind: "sgho", deploy, proxy, gov },
    protectsContracts: [
      { name: "sGHO", address: s.address, reads: "hasRole(DEFAULT_ADMIN_ROLE, executor)" },
      ...GOV_CONTRACTS,
    ],
    underneathContracts: [{ name: "sGHO", address: s.address, reads: "the EIP-1967 slots" }, ...GOV_CONTRACTS],
  };
};

// ── Umbrella ───────────────────────────────────────────────────────────────

const UMBRELLA_ABI = parseAbi([
  "function getCooldown() view returns (uint256)",
  "function getUnstakeWindow() view returns (uint256)",
]);

const umbrella: Reader = async (s, h) => {
  const at = { address: s.address as Address, abi: UMBRELLA_ABI, blockNumber: h.block } as const;
  const [cooldown, window, core, gov] = await Promise.all([
    h.c.readContract({ ...at, functionName: "getCooldown" }),
    h.c.readContract({ ...at, functionName: "getUnstakeWindow" }),
    ownerOf(h, s.address),
    aaveGovernance(h),
  ]);
  const umbrellaAddr = core.toLowerCase();
  const [govAdmin, deploy, coreProxy, stake] = await Promise.all([
    hasAdmin(h, umbrellaAddr, gov.executor),
    deployOf(1, umbrellaAddr),
    proxyOf(h, "Umbrella", umbrellaAddr),
    proxyOf(h, "Stake token", s.address),
  ]);
  return {
    protects: {
      kind: "umbrella",
      vault: s.address,
      cooldown: Number(cooldown),
      window: Number(window),
      umbrella: umbrellaAddr,
      govAdmin,
      gov,
    },
    underneath: { kind: "umbrella", deploy, core: coreProxy, stake, gov },
    protectsContracts: [
      { name: "Stake token", address: s.address, reads: "getCooldown(), getUnstakeWindow(), owner()" },
      { name: "Umbrella", address: umbrellaAddr, reads: "hasRole(DEFAULT_ADMIN_ROLE, executor)" },
      ...GOV_CONTRACTS,
    ],
    underneathContracts: [
      { name: "Umbrella", address: umbrellaAddr, reads: "the EIP-1967 slots" },
      { name: "Stake token", address: s.address, reads: "the EIP-1967 slots" },
      ...GOV_CONTRACTS,
    ],
  };
};

// ── Maple ──────────────────────────────────────────────────────────────────

const MAPLE_ABI = parseAbi([
  "function manager() view returns (address)",
  "function poolDelegate() view returns (address)",
  "function implementation() view returns (address)",
  "function factory() view returns (address)",
  "function versionOf(address) view returns (uint256)",
  "function securityAdmin() view returns (address)",
  "function governor() view returns (address)",
  "function defaultTimelockParameters() view returns (uint128 delay, uint128 duration)",
  "function timelockParametersOf(address contract_, bytes32 functionId_) view returns (uint128 delay, uint128 duration)",
]);

const maple: Reader = async (s, h) => {
  const read = <T>(address: string, functionName: string, args: readonly unknown[] = []) =>
    h.c.readContract({
      address: address as Address,
      abi: MAPLE_ABI,
      functionName,
      args,
      blockNumber: h.block,
    } as never) as Promise<T>;
  const pool = MAPLE_POOLS.find((p) => p.pool === s.address.toLowerCase());
  const [pmRaw, securityAdmin, governor, defaults] = await Promise.all([
    read<Address>(s.address, "manager"),
    read<Address>(MAPLE_GLOBALS, "securityAdmin"),
    read<Address>(MAPLE_GLOBALS, "governor"),
    read<readonly [bigint, bigint]>(MAPLE_GLOBALS, "defaultTimelockParameters"),
  ]);
  const pm = pmRaw.toLowerCase();
  const managers: [string, string, string][] = pool
    ? [
        ["withdrawal manager", pool.withdrawalManager, "WM:UPGRADE"],
        ["fixed-term loan manager", pool.fixedTermLoanManager, "LM:UPGRADE"],
        ["open-term loan manager", pool.openTermLoanManager, "LM:UPGRADE"],
      ]
    : [];
  const [delegate, waits, deploy, managerProxy, impl, factory, poolProxy, poolCode] = await Promise.all([
    read<Address>(pm, "poolDelegate").catch(() => null),
    Promise.all(
      managers.map(async ([role, address, id]): Promise<WaitFact> => {
        const [delay, window] = await read<readonly [bigint, bigint]>(MAPLE_GLOBALS, "timelockParametersOf", [
          address,
          stringToHex(id, { size: 32 }),
        ]);
        return { role, address, id, delay: Number(delay), window: Number(window) };
      }),
    ),
    deployOf(1, pm),
    proxyOf(h, "PoolManager", pm),
    read<Address>(pm, "implementation"),
    read<Address>(pm, "factory"),
    proxyOf(h, "Pool", s.address),
    h.c.getCode({ address: s.address as Address, blockNumber: h.block }),
  ]);
  const version = await read<bigint>(factory, "versionOf", [impl]).catch(() => null);
  return {
    protects: {
      kind: "maple",
      pool: s.address,
      manager: pm,
      delegate: delegate?.toLowerCase() ?? null,
      securityAdmin: securityAdmin.toLowerCase(),
      globals: MAPLE_GLOBALS,
      defaults: { delay: Number(defaults[0]), window: Number(defaults[1]) },
      waits,
    },
    underneath: {
      kind: "maple",
      pool: s.address,
      deploy,
      manager: managerProxy,
      impl: impl.toLowerCase(),
      factory: factory.toLowerCase(),
      version: version == null ? null : Number(version),
      governor: governor.toLowerCase(),
      securityAdmin: securityAdmin.toLowerCase(),
      poolProxy,
      poolCode: codeFact(s.address, poolCode),
    },
    protectsContracts: [
      { name: "Pool", address: s.address, reads: "manager()" },
      { name: "PoolManager", address: pm, reads: "poolDelegate()" },
      {
        name: "MapleGlobals",
        address: MAPLE_GLOBALS,
        reads: "securityAdmin(), defaultTimelockParameters(), timelockParametersOf(manager, id) for each manager",
      },
    ],
    underneathContracts: [
      { name: "PoolManager", address: pm, reads: "implementation(), factory(), the EIP-1967 slots" },
      { name: "Factory", address: factory.toLowerCase(), reads: "versionOf(implementation)" },
      { name: "MapleGlobals", address: MAPLE_GLOBALS, reads: "securityAdmin(), governor()" },
      { name: "Pool", address: s.address, reads: "the EIP-1967 slots, its code" },
    ],
  };
};

const READERS: Record<ProtectsKind, Reader> = {
  metamorpho: metaMorpho,
  "yearn-v3": yearn,
  stata,
  sgho,
  "umbrella-stake": umbrella,
  "maple-pool": maple,
};

/** Both sections' facts for one vault, read at one head block; null where a read failed. */
export async function readVaultProtects(s: ProtectsSubject): Promise<ProtectsRead | null> {
  try {
    const c = vaultHeadClient(s.chainId);
    const block = await c.getBlockNumber();
    const r = await READERS[s.kind]({ ...s, address: s.address.toLowerCase() }, { c, block });
    return { chainId: s.chainId, block: Number(block), ...r };
  } catch (e) {
    console.error(`protects read for ${s.chainId}:${s.address} failed`, e);
    return null;
  }
}

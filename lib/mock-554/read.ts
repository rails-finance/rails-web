// ui-jobs 554, step 1 (mock): "What protects it" and "The protocol underneath"
// for six vaults, read from the chain at head when the page loads.
// ----------------------------------------------------------------------------
// Each vault gets two lines, each a figure-first headline, one sentence and a
// receipt written out as text (the mock has no inspector). Head reads go
// through `vaultHeadClient` at one pinned block; the deploy checks read the
// archive (`eth_getCode` either side of the creation block, then the block's
// timestamp) through `chainClient`. Which changes wait, and who may upgrade
// what, is taken from each protocol's source on GitHub and named as such in
// the receipt. Where a read is missing the line says so.
//
// SERVER-ONLY: the reads use the RPC keys.

import "server-only";
import { parseAbi, stringToHex, type Address, type PublicClient } from "viem";
import { formatDate } from "@/lib/date";
import type { ChainId } from "@/lib/shared/chains";
import { vaultHeadClient } from "@/lib/sources/api/head-reads-client";
import { chainClient } from "@/lib/sources/chain/rpc";
import { MORPHO_BASE_DEPLOY_BLOCK } from "@/lib/morpho-base/asset-catalog";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";
import { durationText, shortHex } from "@/lib/vaults/health-words";

export type MockKind = "metamorpho" | "yearn-v3" | "stata" | "umbrella-stake" | "maple-pool";

export interface MockVault {
  chainId: ChainId;
  address: Address;
  kind: MockKind;
  family: string;
  /** Why this vault is in the mock, for the index. */
  why: string;
}

export const MOCK_VAULTS: readonly MockVault[] = [
  {
    chainId: 8453,
    address: "0xee8f4ec5672f09119b96ab6fb59c27e1b7e44b61",
    kind: "metamorpho",
    family: "MetaMorpho",
    why: "the proposal's Base example",
  },
  {
    chainId: 1,
    address: "0xbeef01735c132ada46aa9aa4c54623caa92a64cb",
    kind: "metamorpho",
    family: "MetaMorpho",
    why: "the largest USDC vault in the Ethereum roster with a guardian set (guardian() read across the roster's USDC and USDT vaults)",
  },
  {
    chainId: 1,
    address: "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e",
    kind: "stata",
    family: "Aave wrapper",
    why: "the Aave USDC wrapper",
  },
  {
    chainId: 1,
    address: "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6",
    kind: "umbrella-stake",
    family: "Umbrella stake",
    why: "Umbrella's stake on the USDC wrapper (stkwaEthUSDC.v1, UMBRELLA_STAKE_ASSETS.STK_WA_USDC_V1)",
  },
  {
    chainId: 1,
    address: "0x4f827a63755855cdf3e8f3bcd20265c833f15033",
    kind: "umbrella-stake",
    family: "Umbrella stake",
    why: "the address in the brief, which is Umbrella's GHO stake (stkGHO.v1)",
  },
  {
    chainId: 1,
    address: "0xbe53a109b494e5c9f97b9cd39fe969be68bf6204",
    kind: "yearn-v3",
    family: "Yearn V3",
    why: "Yearn's USDC vault",
  },
  {
    chainId: 1,
    address: "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b",
    kind: "maple-pool",
    family: "Maple pool",
    why: "Maple's USDC pool",
  },
];

export const mockVault = (chainId: number, address: string): MockVault | undefined =>
  MOCK_VAULTS.find((v) => v.chainId === chainId && v.address === address.toLowerCase());

export interface MockLine {
  label: string;
  headline: string;
  sentence: string;
  /** What Rails did not read or check, said plainly on the line. */
  gap: string | null;
  receipt: string;
}

export interface MockRead {
  vault: MockVault;
  name: string | null;
  block: number;
  readAt: string;
  protects: MockLine;
  underneath: MockLine;
}

// ── Addresses (official address books) ─────────────────────────────────────

/** Morpho Blue: the same address on Ethereum and Base. */
const MORPHO_BLUE: Address = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
/** Aave V3 Ethereum, from bgd-labs/aave-address-book (AaveV3Ethereum, GovernanceV3Ethereum). */
const AAVE = {
  pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  addressesProvider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
  payloadsController: "0xdAbad81aF85554E9ae636395611C58F7eC1aAEc5",
  governance: "0x9AEE0B04504CeF83A65AC3f0e838D0593BCb2BC7",
} as const satisfies Record<string, Address>;
const MAPLE_GLOBALS: Address = "0x804a6F5F667170F545Bf14e5DDB48C70B788390C";

/** Creation blocks: a repo constant where one exists, else found by bisecting
 *  `eth_getCode` (9 Nov 2026). Each is checked again on every load. */
const DEPLOYS: Record<string, number> = {
  [`1:${MORPHO_BLUE.toLowerCase()}`]: 18_883_124,
  [`8453:${MORPHO_BLUE.toLowerCase()}`]: MORPHO_BASE_DEPLOY_BLOCK,
  [`1:${AAVE.pool.toLowerCase()}`]: 16_291_127,
  /** Yearn VaultV3 3.0.2 implementation. */
  "1:0x1ab62413e0cf2ebeb73da7d40c70e7202ae14467": 19_372_641,
  /** Umbrella. */
  "1:0xd400fc38ed4732893174325693a63c30ee3881a8": 22_481_753,
  ...Object.fromEntries(MAPLE_POOLS.map((p) => [`1:${p.poolManager}`, p.deployBlock])),
};

const DEPLOY_SOURCE: Record<string, string> = {
  [`8453:${MORPHO_BLUE.toLowerCase()}`]: "MORPHO_BASE_DEPLOY_BLOCK in lib/morpho-base/asset-catalog.ts",
  ...Object.fromEntries(MAPLE_POOLS.map((p) => [`1:${p.poolManager}`, "deployBlock in lib/maple/asset-catalog.ts"])),
};

// ── Slots and code ─────────────────────────────────────────────────────────

const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const ZERO = "0x0000000000000000000000000000000000000000";

const n = (x: number | bigint) => Number(x).toLocaleString("en-US");
const days = (seconds: number | bigint) => durationText(Number(seconds));
/** "3-day", for a duration that qualifies a noun. */
const dayAdj = (seconds: number | bigint) => days(seconds).replace(/ (day|hour|minute)s?\b/g, "-$1");
const when = (unix: number | bigint) => formatDate(new Date(Number(unix) * 1000));
const word = (s: string | undefined) => (s ? (`0x${s.slice(-40)}` as Address) : ZERO);

/** The opcodes that let deployed code run other code or delete itself, found
 *  by walking the bytecode with PUSH data skipped. */
function codeHooks(code: string): string[] {
  const b = code.slice(2);
  const found = new Set<string>();
  for (let i = 0; i < b.length; i += 2) {
    const op = parseInt(b.slice(i, i + 2), 16);
    if (op >= 0x60 && op <= 0x7f) i += (op - 0x5f) * 2;
    else if (op === 0xf4) found.add("DELEGATECALL");
    else if (op === 0xf2) found.add("CALLCODE");
    else if (op === 0xff) found.add("SELFDESTRUCT");
  }
  return [...found];
}

/** The EIP-1167 clone's target, where `code` is one. */
function cloneTarget(code: string): Address | null {
  const m = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i.exec(code);
  return m ? (`0x${m[1]}` as Address) : null;
}

interface Deploy {
  block: number;
  date: string | null;
  checked: boolean;
  source: string;
}

/** The creation block, checked: no code one block before, code at it. */
async function deployOf(chainId: ChainId, address: Address): Promise<Deploy | null> {
  const key = `${chainId}:${address.toLowerCase()}`;
  const block = DEPLOYS[key];
  if (block == null) return null;
  const c = chainClient(chainId);
  const [before, at, b] = await Promise.all([
    c.getCode({ address, blockNumber: BigInt(block - 1) }).catch(() => "?"),
    c.getCode({ address, blockNumber: BigInt(block) }).catch(() => "?"),
    c.getBlock({ blockNumber: BigInt(block) }).catch(() => null),
  ]);
  const checked = (before === undefined || before === "0x") && typeof at === "string" && at.length > 2 && at !== "?";
  return {
    block,
    date: b ? when(b.timestamp) : null,
    checked,
    source: DEPLOY_SOURCE[key] ?? "found by bisecting eth_getCode",
  };
}

function deployReceipt(name: string, address: Address, d: Deploy | null): string {
  if (!d) return `${name} ${address}: no creation block on file.`;
  return (
    `${name} ${address}: created at block ${n(d.block)} (${d.source}; ` +
    (d.checked
      ? `checked: eth_getCode empty at ${n(d.block - 1)}, code at ${n(d.block)}`
      : "the eth_getCode check did not answer") +
    (d.date ? `), block timestamp ${d.date}.` : "), block timestamp not read.")
  );
}

const deployedText = (name: string, d: Deploy | null) =>
  d?.date ? `${name}, deployed on ${d.date}` : `${name}, deployment date not read`;

interface Head {
  c: PublicClient;
  block: bigint;
}

async function slots(h: Head, address: Address) {
  const [impl, admin] = await Promise.all([
    h.c.getStorageAt({ address, slot: IMPL_SLOT, blockNumber: h.block }),
    h.c.getStorageAt({ address, slot: ADMIN_SLOT, blockNumber: h.block }),
  ]);
  return { impl: word(impl), admin: word(admin) };
}

const OWNER = parseAbi(["function owner() view returns (address)"]);
const owner = (h: Head, address: Address) =>
  h.c.readContract({ address, abi: OWNER, functionName: "owner", blockNumber: h.block });

// ── Aave governance (shared by the wrapper and Umbrella) ───────────────────

const PC_ABI = parseAbi([
  "struct ExecutorConfig { address executor; uint40 delay; }",
  "function getExecutorSettingsByAccessControl(uint8 accessControl) view returns (ExecutorConfig)",
  "function guardian() view returns (address)",
]);
const GOV_ABI = parseAbi([
  "struct VotingConfig { uint24 coolDownBeforeVotingStart; uint24 votingDuration; uint56 yesThreshold; uint56 yesNoDifferential; uint56 minPropositionPower; }",
  "function getVotingConfig(uint8 accessLevel) view returns (VotingConfig)",
]);

async function aaveGovernance(h: Head) {
  const [exec, guardian, voting, papOwner] = await Promise.all([
    h.c.readContract({
      address: AAVE.payloadsController,
      abi: PC_ABI,
      functionName: "getExecutorSettingsByAccessControl",
      args: [1],
      blockNumber: h.block,
    }),
    h.c.readContract({
      address: AAVE.payloadsController,
      abi: PC_ABI,
      functionName: "guardian",
      blockNumber: h.block,
    }),
    h.c.readContract({
      address: AAVE.governance,
      abi: GOV_ABI,
      functionName: "getVotingConfig",
      args: [1],
      blockNumber: h.block,
    }),
    owner(h, AAVE.addressesProvider),
  ]);
  const receipt =
    `Aave governance at block ${n(h.block)}: Governance ${AAVE.governance} getVotingConfig(1) = ` +
    `${days(voting.coolDownBeforeVotingStart)} before voting opens, ${days(voting.votingDuration)} of voting; ` +
    `PayloadsController ${AAVE.payloadsController} getExecutorSettingsByAccessControl(1) = executor ${exec.executor}, ` +
    `delay ${n(exec.delay)} s; guardian() = ${guardian} (cancelPayload is onlyGuardian in bgd-labs/aave-governance-v3).`;
  return { exec, guardian, voting, papOwner, receipt };
}

/** "after a 3-day vote and a 1-day wait". */
const govWait = (g: Awaited<ReturnType<typeof aaveGovernance>>) =>
  `after a ${dayAdj(g.voting.votingDuration)} vote and a ${dayAdj(g.exec.delay)} wait`;

/** Who changes a proxy behind a ProxyAdmin, as a receipt clause. */
async function proxyAdminClause(h: Head, name: string, address: Address) {
  const s = await slots(h, address);
  if (s.impl === ZERO) return { upgradable: false, by: null, text: `${name} ${address}: no EIP-1967 implementation.` };
  const by = s.admin === ZERO ? null : await owner(h, s.admin).catch(() => null);
  return {
    upgradable: true,
    by,
    text:
      `${name} ${address}: EIP-1967 implementation ${s.impl}, admin ${s.admin}` +
      (by ? `, whose owner() is ${by}.` : ", owner not read."),
  };
}

// ── Families ───────────────────────────────────────────────────────────────

const MM_ABI = parseAbi([
  "function name() view returns (string)",
  "function timelock() view returns (uint256)",
  "function guardian() view returns (address)",
  "function owner() view returns (address)",
  "function pendingTimelock() view returns (uint192 value, uint64 validAt)",
  "function pendingGuardian() view returns (address value, uint64 validAt)",
]);
const BLUE_ABI = parseAbi(["function owner() view returns (address)"]);

async function metaMorpho(v: MockVault, h: Head): Promise<Omit<MockRead, "vault" | "readAt">> {
  const at = { address: v.address, abi: MM_ABI, blockNumber: h.block } as const;
  const [name, timelock, guardian, vaultOwner, pt, pg] = await Promise.all([
    h.c.readContract({ ...at, functionName: "name" }),
    h.c.readContract({ ...at, functionName: "timelock" }),
    h.c.readContract({ ...at, functionName: "guardian" }),
    h.c.readContract({ ...at, functionName: "owner" }),
    h.c.readContract({ ...at, functionName: "pendingTimelock" }),
    h.c.readContract({ ...at, functionName: "pendingGuardian" }),
  ]);
  const [ptValue, ptAt] = pt;
  const [pgValue, pgAt] = pg;
  const pending = [
    ptAt > BigInt(0) ? `A timelock of ${days(ptValue)} is waiting, from ${when(ptAt)}.` : null,
    pgAt > BigInt(0) ? `A new guardian, ${shortHex(pgValue)}, is waiting, from ${when(pgAt)}.` : null,
  ].filter(Boolean);
  const hasGuardian = guardian !== ZERO;
  const headline =
    timelock === BigInt(0)
      ? "New markets, higher caps and removals take effect at once"
      : `New markets, higher caps, removals and a shorter timelock wait ${days(timelock)}`;
  const sentence = [
    timelock === BigInt(0)
      ? "The vault's timelock is zero."
      : hasGuardian
        ? `The guardian, ${shortHex(guardian)}, can cancel them while they wait.`
        : `No guardian is set; the owner, ${shortHex(vaultOwner)}, can cancel them while they wait.`,
    ...pending,
  ].join(" ");
  const protects: MockLine = {
    label: "Timelock",
    headline,
    sentence,
    gap: null,
    receipt:
      `Vault ${v.address} at block ${n(h.block)}: timelock() = ${n(timelock)} s; guardian() = ${guardian}; ` +
      `pendingTimelock() = ${ptAt > BigInt(0) ? `${n(ptValue)} s from ${when(ptAt)}` : "none"}; ` +
      `pendingGuardian() = ${pgAt > BigInt(0) ? `${pgValue} from ${when(pgAt)}` : "none"}; owner() = ${vaultOwner}. ` +
      "Which changes wait: submitCap, submitMarketRemoval, submitTimelock (decrease) and submitGuardian " +
      "in morpho-org/metamorpho MetaMorpho.sol; revokePending* is open to the guardian role (the owner or the guardian).",
  };

  const [deploy, s, code, blueOwner] = await Promise.all([
    deployOf(v.chainId, MORPHO_BLUE),
    slots(h, MORPHO_BLUE),
    h.c.getCode({ address: MORPHO_BLUE, blockNumber: h.block }),
    h.c.readContract({ address: MORPHO_BLUE, abi: BLUE_ABI, functionName: "owner", blockNumber: h.block }),
  ]);
  const hooks = codeHooks(code ?? "0x");
  const fixed = s.impl === ZERO && s.admin === ZERO && hooks.length === 0;
  const underneath: MockLine = {
    label: "Morpho Blue",
    headline: deployedText("Morpho Blue", deploy),
    sentence: fixed
      ? `Its code cannot be changed. Its owner, ${shortHex(blueOwner)}, can switch on new rate models and loan-to-value levels and set a market's fee, at once.`
      : "Rails found a proxy slot or a delegate call in its code.",
    gap: null,
    receipt:
      deployReceipt("Morpho Blue", MORPHO_BLUE, deploy) +
      ` At block ${n(h.block)}: EIP-1967 implementation and admin slots ${s.impl === ZERO && s.admin === ZERO ? "empty" : `${s.impl}, ${s.admin}`}; ` +
      `bytecode ${n(((code ?? "0x").length - 2) / 2)} bytes, ${hooks.length ? hooks.join(", ") : "no DELEGATECALL, CALLCODE or SELFDESTRUCT"}; ` +
      `owner() = ${blueOwner}. The owner's powers (enableIrm, enableLltv, setFee up to 25%, setFeeRecipient, setOwner) from morpho-org/morpho-blue Morpho.sol.`,
  };
  return { name, block: Number(h.block), protects, underneath };
}

const YEARN_ABI = parseAbi([
  "function name() view returns (string)",
  "function profitMaxUnlockTime() view returns (uint256)",
  "function role_manager() view returns (address)",
  "function apiVersion() view returns (string)",
  "function FACTORY() view returns (address)",
]);

async function yearn(v: MockVault, h: Head): Promise<Omit<MockRead, "vault" | "readAt">> {
  const at = { address: v.address, abi: YEARN_ABI, blockNumber: h.block } as const;
  const [name, unlock, roleManager, version, factory, code] = await Promise.all([
    h.c.readContract({ ...at, functionName: "name" }),
    h.c.readContract({ ...at, functionName: "profitMaxUnlockTime" }),
    h.c.readContract({ ...at, functionName: "role_manager" }),
    h.c.readContract({ ...at, functionName: "apiVersion" }),
    h.c.readContract({ ...at, functionName: "FACTORY" }),
    h.c.getCode({ address: v.address, blockNumber: h.block }),
  ]);
  const protects: MockLine = {
    label: "Profit release",
    headline: `Profit is released over ${days(unlock)}`,
    sentence: `The role manager, ${shortHex(roleManager)}, hands out every role; the vault applies role holders' changes at once.`,
    gap: "Whether a role holder works behind a timelock of its own is not read.",
    receipt:
      `Vault ${v.address} at block ${n(h.block)}: profitMaxUnlockTime() = ${n(unlock)} s; role_manager() = ${roleManager}. ` +
      "VaultV3.vy in yearn/yearn-vaults-v3 has no timelock on its setters. Missing: a read of what each role holder is " +
      "(a multisig, a timelock or a periphery contract).",
  };

  const impl = cloneTarget(code ?? "0x");
  const [deploy, implCode] = impl
    ? await Promise.all([deployOf(1, impl), h.c.getCode({ address: impl, blockNumber: h.block })])
    : [null, null];
  const hooks = implCode ? codeHooks(implCode) : null;
  const fixed = impl != null && hooks != null && hooks.length === 0;
  const underneath: MockLine = {
    label: "Yearn V3",
    headline: deployedText(`Yearn V3 vault ${version}`, deploy),
    sentence: fixed ? "Its code cannot be changed." : "Rails did not find the fixed implementation this vault copies.",
    gap: null,
    receipt:
      `Vault ${v.address} at block ${n(h.block)}: its code is ${impl ? `an EIP-1167 copy of ${impl}` : "not an EIP-1167 copy"}; ` +
      `apiVersion() = ${version}; FACTORY() = ${factory}. ` +
      (impl
        ? `${deployReceipt("Implementation", impl, deploy)} Its bytecode carries ${hooks?.length ? hooks.join(", ") : "no DELEGATECALL, CALLCODE or SELFDESTRUCT"}.`
        : ""),
  };
  return { name, block: Number(h.block), protects, underneath };
}

const ERC20_NAME = parseAbi(["function name() view returns (string)"]);
const UMBRELLA_ABI = parseAbi([
  "function getCooldown() view returns (uint256)",
  "function getUnstakeWindow() view returns (uint256)",
]);
const ACCESS_ABI = parseAbi(["function hasRole(bytes32 role, address account) view returns (bool)"]);

async function stata(v: MockVault, h: Head): Promise<Omit<MockRead, "vault" | "readAt">> {
  const [name, g] = await Promise.all([
    h.c.readContract({ address: v.address, abi: ERC20_NAME, functionName: "name", blockNumber: h.block }),
    aaveGovernance(h),
  ]);
  const protects: MockLine = {
    label: "Governance",
    headline: `A ${dayAdj(g.voting.votingDuration)} vote, then a ${dayAdj(g.exec.delay)} wait`,
    sentence: `Aave governance changes the wrapper and the pool it lends into; Aave's guardian, ${shortHex(g.guardian)}, can cancel a change while it waits.`,
    gap: null,
    receipt: g.receipt,
  };

  const [deploy, poolSlots, poolCode, wrapper] = await Promise.all([
    deployOf(1, AAVE.pool),
    slots(h, AAVE.pool),
    h.c.getCode({ address: AAVE.pool, blockNumber: h.block }),
    proxyAdminClause(h, "Wrapper", v.address),
  ]);
  const adminInCode = (poolCode ?? "").toLowerCase().includes(AAVE.addressesProvider.slice(2).toLowerCase());
  const governed = g.papOwner.toLowerCase() === g.exec.executor.toLowerCase();
  const underneath: MockLine = {
    label: "Aave V3 Pool",
    headline: deployedText("Aave V3 Pool", deploy),
    sentence:
      governed && adminInCode
        ? `Aave governance can replace its code, and the wrapper's, ${govWait(g)}.`
        : "Rails could not trace who can replace its code.",
    gap: null,
    receipt:
      deployReceipt("Pool", AAVE.pool, deploy) +
      ` At block ${n(h.block)}: EIP-1967 implementation ${poolSlots.impl}; the proxy's admin is fixed in its bytecode ` +
      `(${adminInCode ? "it carries" : "not found:"} PoolAddressesProvider ${AAVE.addressesProvider}); ` +
      `PoolAddressesProvider owner() = ${g.papOwner}, the level-1 executor. ${wrapper.text}`,
  };
  return { name, block: Number(h.block), protects, underneath };
}

async function umbrella(v: MockVault, h: Head): Promise<Omit<MockRead, "vault" | "readAt">> {
  const at = { address: v.address, blockNumber: h.block } as const;
  const [name, cooldown, window, stakeOwner, g] = await Promise.all([
    h.c.readContract({ ...at, abi: ERC20_NAME, functionName: "name" }),
    h.c.readContract({ ...at, abi: UMBRELLA_ABI, functionName: "getCooldown" }),
    h.c.readContract({ ...at, abi: UMBRELLA_ABI, functionName: "getUnstakeWindow" }),
    owner(h, v.address),
    aaveGovernance(h),
  ]);
  const govAdmin = await h.c
    .readContract({
      address: stakeOwner,
      abi: ACCESS_ABI,
      functionName: "hasRole",
      args: [`0x${"0".repeat(64)}`, g.exec.executor],
      blockNumber: h.block,
    })
    .catch(() => null);
  const protects: MockLine = {
    label: "Cooldown",
    headline: `${days(cooldown)} to unstake, then a ${dayAdj(window)} window`,
    sentence:
      `Umbrella, ${shortHex(stakeOwner)}, can slash the stake when the Aave reserve it covers runs a deficit; ` +
      (govAdmin ? `Aave governance controls Umbrella ${govWait(g)}.` : "who controls Umbrella was not read."),
    gap: null,
    receipt:
      `Stake token ${v.address} at block ${n(h.block)}: getCooldown() = ${n(cooldown)} s; getUnstakeWindow() = ${n(window)} s; ` +
      `owner() = ${stakeOwner} (Umbrella; slash is onlyOwner in StakeToken.sol, and Umbrella.slash runs when isReserveSlashable, ` +
      `aave-dao/aave-umbrella). Umbrella hasRole(DEFAULT_ADMIN_ROLE, ${g.exec.executor}) = ${String(govAdmin)}. ${g.receipt}`,
  };

  const [deploy, core, stake] = await Promise.all([
    deployOf(1, stakeOwner),
    proxyAdminClause(h, "Umbrella", stakeOwner),
    proxyAdminClause(h, "Stake token", v.address),
  ]);
  const byGov = (x: { by: Address | null }) => x.by?.toLowerCase() === g.exec.executor.toLowerCase();
  const underneath: MockLine = {
    label: "Umbrella",
    headline: deployedText("Umbrella", deploy),
    sentence:
      core.upgradable && byGov(core) && byGov(stake)
        ? `Aave governance can replace its code, and the stake token's, ${govWait(g)}.`
        : "Rails could not trace who can replace its code.",
    gap: null,
    receipt: `${deployReceipt("Umbrella", stakeOwner, deploy)} At block ${n(h.block)}: ${core.text} ${stake.text} Executor ${g.exec.executor} is Aave's level-1 executor.`,
  };
  return { name, block: Number(h.block), protects, underneath };
}

const MAPLE_ABI = parseAbi([
  "function name() view returns (string)",
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

async function maple(v: MockVault, h: Head): Promise<Omit<MockRead, "vault" | "readAt">> {
  const read = <T>(address: Address, functionName: string, args: readonly unknown[] = []) =>
    h.c.readContract({ address, abi: MAPLE_ABI, functionName, args, blockNumber: h.block } as never) as Promise<T>;
  const pool = MAPLE_POOLS.find((p) => p.pool === v.address);
  const [name, pm, delegate, securityAdmin, governor, defaults] = await Promise.all([
    read<string>(v.address, "name"),
    read<Address>(v.address, "manager"),
    pool ? read<Address>(pool.poolManager as Address, "poolDelegate") : Promise.resolve(null),
    read<Address>(MAPLE_GLOBALS, "securityAdmin"),
    read<Address>(MAPLE_GLOBALS, "governor"),
    read<readonly [bigint, bigint]>(MAPLE_GLOBALS, "defaultTimelockParameters"),
  ]);
  const managers = pool
    ? [
        ["withdrawal manager", pool.withdrawalManager, "WM:UPGRADE"],
        ["fixed-term loan manager", pool.fixedTermLoanManager, "LM:UPGRADE"],
        ["open-term loan manager", pool.openTermLoanManager, "LM:UPGRADE"],
      ]
    : [];
  const own = await Promise.all(
    managers.map(([, a, id]) =>
      read<readonly [bigint, bigint]>(MAPLE_GLOBALS, "timelockParametersOf", [a, stringToHex(id, { size: 32 })]),
    ),
  );
  // A zero duration falls back to the default (MapleGlobals.isValidScheduledCall).
  const waits = own.map(([d, dur]) => (dur === BigInt(0) ? defaults : ([d, dur] as const)));
  const allSame = waits.every((w) => w[0] === waits[0]?.[0] && w[1] === waits[0]?.[1]);
  const [delay, window] = waits[0] ?? defaults;
  const protects: MockLine = {
    label: "Upgrades",
    headline: allSame
      ? `The pool delegate's upgrades wait ${days(delay)}, then a ${dayAdj(window)} window`
      : "The pool delegate's upgrades wait on Maple's timelock",
    sentence:
      `The pool delegate, ${delegate ? shortHex(delegate) : "unread"}, runs the pool's lending; ` +
      `Maple's security admin, ${shortHex(securityAdmin)}, can upgrade without the wait.`,
    gap: "The deployed managers' versions are not matched to Maple's source on GitHub.",
    receipt:
      `Pool ${v.address} at block ${n(h.block)}: manager() = ${pm}; poolDelegate() = ${delegate ?? "not read"}. ` +
      `MapleGlobals ${MAPLE_GLOBALS}: defaultTimelockParameters() = ${n(defaults[0])} s delay, ${n(defaults[1])} s window; ` +
      managers
        .map(([w, a, id], i) => `timelockParametersOf(${w} ${a}, "${id}") = ${n(own[i][0])}, ${n(own[i][1])}`)
        .join("; ") +
      `; securityAdmin() = ${securityAdmin}. The scheduled-call rule (pool delegate waits, security admin does not) is the ` +
      "upgrade() of maple-labs/withdrawal-manager-queue and open-term-loan-manager on GitHub main. Missing: the deployed " +
      "versions of the three managers, matched to that source.",
  };

  const [deploy, s, impl, factory] = await Promise.all([
    deployOf(1, pm),
    slots(h, pm),
    read<Address>(pm, "implementation"),
    read<Address>(pm, "factory"),
  ]);
  const version = await read<bigint>(factory, "versionOf", [impl]).catch(() => null);
  const [poolSlots, poolCode] = await Promise.all([
    slots(h, v.address),
    h.c.getCode({ address: v.address, blockNumber: h.block }),
  ]);
  const poolHooks = codeHooks(poolCode ?? "0x");
  const underneath: MockLine = {
    label: "Pool manager",
    headline: deployedText("Maple pool manager", deploy),
    sentence: `Maple's security admin, ${shortHex(securityAdmin)}, can upgrade its code at once to a version Maple's governor, ${shortHex(governor)}, has enabled.`,
    gap: null,
    receipt:
      `${deployReceipt("PoolManager", pm, deploy)} At block ${n(h.block)}: EIP-1967 implementation ${s.impl}; ` +
      `implementation() = ${impl}; factory() = ${factory}; versionOf(implementation) = ${version ?? "not read"}. ` +
      "Upgrade rule: MaplePoolManager.upgrade is securityAdmin-only in maple-labs/pool-v2 v5.0.0; " +
      `MapleProxyFactory.upgradeInstance needs a path the governor (${governor}) enabled. ` +
      `The pool ${v.address}: implementation slot ${poolSlots.impl === ZERO ? "empty" : poolSlots.impl}, bytecode ` +
      `${poolHooks.length ? poolHooks.join(", ") : "without DELEGATECALL, CALLCODE or SELFDESTRUCT"}.`,
  };
  return { name, block: Number(h.block), protects, underneath };
}

const READERS: Record<MockKind, (v: MockVault, h: Head) => Promise<Omit<MockRead, "vault" | "readAt">>> = {
  metamorpho: metaMorpho,
  "yearn-v3": yearn,
  stata,
  "umbrella-stake": umbrella,
  "maple-pool": maple,
};

/** Both lines for one vault, read at one head block. */
export async function readMock554(v: MockVault): Promise<MockRead> {
  const c = vaultHeadClient(v.chainId);
  const block = await c.getBlockNumber();
  const r = await READERS[v.kind](v, { c, block });
  return { vault: v, readAt: new Date().toISOString(), ...r };
}

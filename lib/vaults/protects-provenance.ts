// The receipts of "What protects it" (V9) and "The protocol underneath" (V10),
// rails-ops ui-jobs 554: each line's headline traces to the calls behind it
// at the section's block, the creation block's check, and the rule in the
// protocol's published source that makes a read a wait or a power. The
// surface names no function or block (decision 0059 point 1).

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import {
  governedBy,
  mapleWait,
  type AaveGovFact,
  type CodeFact,
  type DeployFact,
  type ProtectsFact,
  type ProxyFact,
  type UnderneathFact,
} from "@/lib/vaults/protects-words";

const n = (v: number) => v.toLocaleString("en-US");
const s = (seconds: number) => `${n(seconds)} s`;
const when = (unix: number) => formatDate(new Date(unix * 1000));

const call = (label: string, value: string, contract?: { name: string; address: string }): ProvInput => ({
  label,
  value,
  kind: "chain",
  pclass: "state",
  ...(contract ? { contract } : {}),
});

const hooksText = (c: CodeFact) =>
  c.hooks.length
    ? `its reachable code carries ${c.hooks.join(", ")}`
    : "its reachable code carries no DELEGATECALL, CALLCODE or SELFDESTRUCT";

const HOOKS_RULE =
  "Rails sweeps the code once, skipping push data and the bytes after a halt until the next JUMPDEST, where data and appended constants sit.";

function deployInputs(name: string, d: DeployFact | null): ProvInput[] {
  if (!d) return [{ label: `${name} creation block`, value: "none on file", kind: "derived" }];
  return [
    {
      label: `${name} creation block`,
      value: n(d.block),
      kind: "chain",
      pclass: "state",
      note: d.source,
      contract: { name, address: d.address },
    },
    {
      label: `eth_getCode · blocks ${n(d.block - 1)} and ${n(d.block)}`,
      value: d.checked == null ? "did not answer" : d.checked ? "empty, then code" : "the check failed",
      kind: "chain",
      pclass: "state",
    },
    { label: `block ${n(d.block)} time`, value: d.at == null ? "not read" : when(d.at), kind: "chain" },
  ];
}

const deploySentence = (name: string, d: DeployFact | null) =>
  !d
    ? `Rails holds no creation block for ${name}.`
    : d.checked && d.at != null
      ? `${name} was created at block ${n(d.block)} (${d.source}): \`eth_getCode\` is empty at block ${n(d.block - 1)} and holds code at block ${n(d.block)}, whose time is ${when(d.at)}.`
      : `${name}'s creation block on file is ${n(d.block)} (${d.source}); the check against the chain ${d.checked === false ? "failed" : "did not answer"}, so no date is stated.`;

const proxyText = (p: ProxyFact) =>
  p.impl == null
    ? `${p.name} ${p.address} has no EIP-1967 implementation.`
    : `${p.name} ${p.address}: EIP-1967 implementation ${p.impl}, admin ${p.admin ?? "empty"}${p.adminOwner ? `, whose \`owner()\` is ${p.adminOwner}` : ""}.`;

const proxyInputs = (p: ProxyFact): ProvInput[] => [
  call(`${p.name} implementation slot`, p.impl ?? "empty", { name: p.name, address: p.address }),
  call(`${p.name} admin slot`, p.admin ?? "empty", { name: p.name, address: p.address }),
  ...(p.admin ? [call(`${p.name} admin owner()`, p.adminOwner ?? "not read")] : []),
];

const govSentence = (g: AaveGovFact) =>
  `Aave Governance ${g.governance} \`getVotingConfig(1)\` gives ${s(g.coolDown)} before a vote opens and ${s(g.votingDuration)} of voting; PayloadsController ${g.payloadsController} \`getExecutorSettingsByAccessControl(1)\` gives the level-1 executor ${g.executor} and its delay of ${s(g.delay)}; its \`guardian()\` is ${g.guardian}, the one address \`cancelPayload\` admits in aave-dao/aave-governance-v3.`;

const govInputs = (g: AaveGovFact): ProvInput[] => [
  call("getVotingConfig(1) · voting duration", s(g.votingDuration), { name: "Aave Governance", address: g.governance }),
  call("getVotingConfig(1) · cool-down before voting", s(g.coolDown), {
    name: "Aave Governance",
    address: g.governance,
  }),
  call("level-1 executor", g.executor, { name: "PayloadsController", address: g.payloadsController }),
  call("executor delay", s(g.delay), { name: "PayloadsController", address: g.payloadsController }),
  call("guardian()", g.guardian, { name: "PayloadsController", address: g.payloadsController }),
];

const verifyAt = (chainId: ChainId, address: string, name: string) => ({
  kind: "etherscan" as const,
  href: explorerUrl(chainId, "address", address),
  text: `${name} on the chain's explorer`,
});

/** The receipt of "What protects it". */
export function protectsProv(f: ProtectsFact, chainId: ChainId, block: number): Provenance {
  const via = `eth_call @ block ${n(block)}`;
  const base = { kind: "chain" as const, pclass: "state" as const, source: { block }, via };
  switch (f.kind) {
    case "metamorpho":
      return {
        ...base,
        summary: `Timelock — at block ${n(block)} the vault's \`timelock()\` is ${s(f.timelock)}, its \`guardian()\` ${f.guardian ?? "the zero address"} and its \`owner()\` ${f.owner}; ${f.pendingTimelock ? `a timelock of ${s(f.pendingTimelock.value)} waits from ${when(f.pendingTimelock.validAt)}` : "no timelock change waits"} and ${f.pendingGuardian ? `guardian ${f.pendingGuardian.value} waits from ${when(f.pendingGuardian.validAt)}` : "no guardian change waits"}. In morpho-org/metamorpho MetaMorpho.sol, \`submitCap\` (a new market or a higher cap), \`submitMarketRemoval\`, \`submitTimelock\` (a shorter one) and \`submitGuardian\` wait out the timelock, and the \`revokePending\` calls are open to the owner and the guardian.`,
        contract: { name: "Vault", address: f.vault },
        verify: verifyAt(chainId, f.vault, "The vault"),
        inputs: [
          call("timelock()", s(f.timelock)),
          call("guardian()", f.guardian ?? "zero address"),
          call("owner()", f.owner),
          call(
            "pendingTimelock()",
            f.pendingTimelock ? `${s(f.pendingTimelock.value)} from ${when(f.pendingTimelock.validAt)}` : "none",
          ),
          call(
            "pendingGuardian()",
            f.pendingGuardian ? `${f.pendingGuardian.value} from ${when(f.pendingGuardian.validAt)}` : "none",
          ),
        ],
      };
    case "yearn-v3":
      return {
        ...base,
        summary: `Profit release — at block ${n(block)} the vault's \`profitMaxUnlockTime()\` is ${s(f.unlock)} and its \`role_manager()\` is ${f.roleManager}. VaultV3.vy in yearn/yearn-vaults-v3 applies a role holder's change in the same transaction. Rails has not read what each role holder is: a multisig, a timelock or a periphery contract.`,
        contract: { name: "Vault", address: f.vault },
        verify: verifyAt(chainId, f.vault, "The vault"),
        inputs: [call("profitMaxUnlockTime()", s(f.unlock)), call("role_manager()", f.roleManager)],
      };
    case "aave-gov":
      return {
        ...base,
        summary: `Governance — ${govSentence(f.gov)}${f.subject === "sgho" ? ` sGHO's \`hasRole(DEFAULT_ADMIN_ROLE, ${f.gov.executor})\` answers ${String(f.govAdmin)}. Rails has not read which addresses hold its yield manager role.` : ""}`,
        contract: { name: "Aave PayloadsController", address: f.gov.payloadsController },
        verify: verifyAt(chainId, f.gov.payloadsController, "The PayloadsController"),
        inputs: [
          ...govInputs(f.gov),
          ...(f.subject === "sgho"
            ? [
                call("hasRole(DEFAULT_ADMIN_ROLE, executor)", String(f.govAdmin), {
                  name: "sGHO",
                  address: f.vault,
                }),
              ]
            : []),
        ],
      };
    case "umbrella":
      return {
        ...base,
        summary: `Cooldown — at block ${n(block)} the stake token's \`getCooldown()\` is ${s(f.cooldown)}, its \`getUnstakeWindow()\` ${s(f.window)} and its \`owner()\` ${f.umbrella}, Umbrella. In aave-dao/aave-umbrella, \`slash\` on the stake token is open to its owner alone, and Umbrella slashes when \`isReserveSlashable\` holds. Umbrella's \`hasRole(DEFAULT_ADMIN_ROLE, ${f.gov.executor})\` answers ${String(f.govAdmin)}. ${govSentence(f.gov)}`,
        contract: { name: "Stake token", address: f.vault },
        verify: verifyAt(chainId, f.vault, "The stake token"),
        inputs: [
          call("getCooldown()", s(f.cooldown)),
          call("getUnstakeWindow()", s(f.window)),
          call("owner()", f.umbrella),
          call("hasRole(DEFAULT_ADMIN_ROLE, executor)", String(f.govAdmin), { name: "Umbrella", address: f.umbrella }),
          ...govInputs(f.gov),
        ],
      };
    case "maple": {
      const w = mapleWait(f);
      return {
        ...base,
        summary: `Upgrades — at block ${n(block)} the pool's \`manager()\` is ${f.manager}, whose \`poolDelegate()\` is ${f.delegate ?? "not read"}. MapleGlobals ${f.globals} gives a default wait of ${s(f.defaults.delay)} and a window of ${s(f.defaults.window)}; ${f.waits.map((x) => `for the ${x.role} ${x.address} under "${x.id}", ${s(x.delay)} and ${s(x.window)}`).join("; ")}${w ? "" : ", which differ"}. A zero window falls back to the default (\`isValidScheduledCall\`). Its \`securityAdmin()\` is ${f.securityAdmin}. The rule that the pool delegate's upgrade waits and the security admin's does not is the \`upgrade\` of maple-labs/withdrawal-manager-queue and open-term-loan-manager on GitHub; Rails has not matched the deployed managers' versions to that source.`,
        contract: { name: "MapleGlobals", address: f.globals },
        verify: verifyAt(chainId, f.globals, "MapleGlobals"),
        inputs: [
          call("manager()", f.manager, { name: "Pool", address: f.pool }),
          call("poolDelegate()", f.delegate ?? "not read", { name: "PoolManager", address: f.manager }),
          call("defaultTimelockParameters()", `${s(f.defaults.delay)}, ${s(f.defaults.window)}`),
          ...f.waits.map((x) => call(`timelockParametersOf(${x.role}, "${x.id}")`, `${s(x.delay)}, ${s(x.window)}`)),
          call("securityAdmin()", f.securityAdmin),
        ],
      };
    }
  }
}

/** The receipt of "The protocol underneath". */
export function underneathProv(f: UnderneathFact, chainId: ChainId, block: number): Provenance {
  const via = `eth_call @ block ${n(block)} · eth_getCode at the creation block`;
  const base = { kind: "chain" as const, pclass: "state" as const, source: { block }, via };
  switch (f.kind) {
    case "morpho-blue":
      return {
        ...base,
        summary: `Morpho Blue — ${deploySentence("Morpho Blue", f.deploy)} At block ${n(block)} its EIP-1967 implementation and admin slots are ${f.proxy.impl == null && f.proxy.admin == null ? "empty" : `${f.proxy.impl ?? "empty"} and ${f.proxy.admin ?? "empty"}`}; its code is ${n(f.code.bytes)} bytes and ${hooksText(f.code)}. ${HOOKS_RULE} Its \`owner()\` is ${f.owner}; in morpho-org/morpho-blue Morpho.sol the owner's calls are \`enableIrm\`, \`enableLltv\`, \`setFee\` (up to 25% of interest), \`setFeeRecipient\` and \`setOwner\`, each in effect at once.`,
        contract: { name: "Morpho Blue", address: f.address },
        verify: verifyAt(chainId, f.address, "Morpho Blue"),
        inputs: [
          ...deployInputs("Morpho Blue", f.deploy),
          ...proxyInputs(f.proxy),
          call("code", `${n(f.code.bytes)} bytes, ${f.code.hooks.join(", ") || "no hooks"}`),
          call("owner()", f.owner),
        ],
      };
    case "yearn-v3": {
      const target = f.cloneOf;
      return {
        ...base,
        summary: `Yearn V3 — at block ${n(block)} the vault's \`apiVersion()\` is ${f.version} and its \`FACTORY()\` ${f.factory}; its code is ${target ? `an EIP-1167 copy of ${target}` : "the vault contract whole, with no EIP-1167 copy"}. ${deploySentence(target ? "The implementation" : "The vault", f.deploy)} ${f.code ? `The code that runs is ${n(f.code.bytes)} bytes and ${hooksText(f.code)}. ${HOOKS_RULE}` : "Rails did not read the code that runs."} VaultV3.vy in yearn/yearn-vaults-v3 has no upgrade path.`,
        contract: { name: "Vault", address: f.vault },
        verify: verifyAt(chainId, target ?? f.vault, target ? "The implementation" : "The vault"),
        inputs: [
          call("apiVersion()", f.version),
          call("FACTORY()", f.factory),
          call("code", target ? `EIP-1167 copy of ${target}` : "whole"),
          ...deployInputs(target ? "Implementation" : "Vault", f.deploy),
          ...(f.code
            ? [call("code that runs", `${n(f.code.bytes)} bytes, ${f.code.hooks.join(", ") || "no hooks"}`)]
            : []),
        ],
      };
    }
    case "aave-pool":
      return {
        ...base,
        summary: `Aave V3 Pool — ${deploySentence("The Pool", f.deploy)} At block ${n(block)} the wrapper's \`POOL()\` is ${f.pool}, whose EIP-1967 implementation is ${f.poolImpl ?? "empty"}; the proxy's admin is fixed in its code, which ${f.adminInCode ? "carries" : "does not carry"} its \`ADDRESSES_PROVIDER()\` ${f.provider}, and that provider's \`owner()\` is ${f.providerOwner ?? "not read"}. ${proxyText(f.wrapper)} ${govSentence(f.gov)}${governedBy(f.wrapper, f.gov) ? "" : " The wrapper's admin owner is not the level-1 executor."}`,
        contract: { name: "Aave V3 Pool", address: f.pool },
        verify: verifyAt(chainId, f.pool, "The Pool"),
        inputs: [
          ...deployInputs("Pool", f.deploy),
          call("Pool implementation slot", f.poolImpl ?? "empty"),
          call("ADDRESSES_PROVIDER()", f.provider),
          call("PoolAddressesProvider owner()", f.providerOwner ?? "not read"),
          ...proxyInputs(f.wrapper),
          ...govInputs(f.gov),
        ],
      };
    case "sgho":
      return {
        ...base,
        summary: `sGHO — ${deploySentence("sGHO", f.deploy)} At block ${n(block)}: ${proxyText(f.proxy)} ${govSentence(f.gov)}`,
        contract: { name: "sGHO", address: f.proxy.address },
        verify: verifyAt(chainId, f.proxy.address, "sGHO"),
        inputs: [...deployInputs("sGHO", f.deploy), ...proxyInputs(f.proxy), ...govInputs(f.gov)],
      };
    case "umbrella":
      return {
        ...base,
        summary: `Umbrella — ${deploySentence("Umbrella", f.deploy)} At block ${n(block)}: ${proxyText(f.core)} ${proxyText(f.stake)} ${govSentence(f.gov)}`,
        contract: { name: "Umbrella", address: f.core.address },
        verify: verifyAt(chainId, f.core.address, "Umbrella"),
        inputs: [
          ...deployInputs("Umbrella", f.deploy),
          ...proxyInputs(f.core),
          ...proxyInputs(f.stake),
          ...govInputs(f.gov),
        ],
      };
    case "maple":
      return {
        ...base,
        summary: `Pool manager — ${deploySentence("The PoolManager", f.deploy)} At block ${n(block)}: ${proxyText(f.manager)} Its \`implementation()\` is ${f.impl}, its \`factory()\` ${f.factory}, and the factory's \`versionOf\` for it is ${f.version ?? "not read"}. In maple-labs/pool-v2, \`MaplePoolManager.upgrade\` is open to MapleGlobals' \`securityAdmin()\`, ${f.securityAdmin}, and \`MapleProxyFactory.upgradeInstance\` needs an upgrade path the \`governor()\`, ${f.governor}, enabled. The pool ${f.pool}: implementation slot ${f.poolProxy.impl ?? "empty"}; ${hooksText(f.poolCode)}. ${HOOKS_RULE}`,
        contract: { name: "PoolManager", address: f.manager.address },
        verify: verifyAt(chainId, f.manager.address, "The PoolManager"),
        inputs: [
          ...deployInputs("PoolManager", f.deploy),
          ...proxyInputs(f.manager),
          call("implementation()", f.impl),
          call("factory()", f.factory),
          call("versionOf(implementation)", f.version == null ? "not read" : n(f.version)),
          call("securityAdmin()", f.securityAdmin),
          call("governor()", f.governor),
          call("pool implementation slot", f.poolProxy.impl ?? "empty"),
          call("pool code", `${n(f.poolCode.bytes)} bytes, ${f.poolCode.hooks.join(", ") || "no hooks"}`),
        ],
      };
  }
}

// Receipts for a MetaMorpho vault's recent configuration changes (V9.1) and
// the steward's runs (V14.2, V14.3), rails-ops ui-jobs 554. Each names the
// rails-server route it was read from, the log (event, transaction, log
// index, block) and how far Rails's index of MetaMorpho logs reaches.

import type { Provenance } from "@/components/shared/provenance";
import { chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import {
  coveredThrough,
  shortHex,
  timelockText,
  type ChangeWords,
  type MetaMorphoChange,
  type MetaMorphoCoverage,
  type MetaMorphoRoleRun,
} from "@/lib/vaults/config-changes";
import type { StewardBefore, StewardRunRole, StewardSince } from "@/lib/vaults/steward-runs";
import { spanOf } from "@/lib/vaults/steward-runs";
import { formatDate } from "@/lib/date";

const n = (v: number) => v.toLocaleString("en-US");
const chainWord = (chainId: number) => chainMeta(chainId as ChainId).name;

/** How far the index reaches, as a clause. */
const reach = (chainId: number, c: MetaMorphoCoverage) => {
  const t = coveredThrough(c);
  return t == null
    ? "Rails's index of MetaMorpho logs had not yet read this vault"
    : `Rails's index of MetaMorpho logs holds this vault's logs through ${chainWord(chainId)} block ${n(t)}`;
};

const txVerify = (chainId: number, txHash: string) => ({
  kind: "etherscan" as const,
  href: explorerUrl(chainId as ChainId, "tx-logs", txHash),
  text: `The transaction's logs on ${chainMeta(chainId as ChainId).explorerName}`,
});

const changesRoute = (chainId: number, vault: string) => `GET /api/metamorpho/${chainId}/vaults/${vault}/changes`;

const ARG_NOTE: Partial<Record<MetaMorphoChange["event"], string>> = {
  SetCap: "SetCap(caller, id, cap): the cap now in force on the market, in the vault's asset",
  SubmitCap: "SubmitCap(caller, id, cap): a cap increase that waits for the timelock before anyone can accept it",
  SetSupplyQueue: "SetSupplyQueue(caller, newSupplyQueue): the markets new deposits go to, in order",
  SetWithdrawQueue: "SetWithdrawQueue(caller, newWithdrawQueue): the markets withdrawals take from, in order",
  SetCurator: "SetCurator(newCurator)",
  SetGuardian: "SetGuardian(caller, guardian)",
  SetTimelock: "SetTimelock(caller, newTimelock): seconds",
  OwnershipTransferred: "OwnershipTransferred(previousOwner, newOwner)",
};

const logOf = (chainId: number, c: MetaMorphoChange) =>
  `the ${c.event} log in transaction ${c.txHash}, log index ${c.logIndex}${c.source === "sieve" ? " within the transaction" : ""}, at ${chainWord(chainId)} block ${n(c.blockNumber)}`;

/** One change's date: its block's time. */
export const configChangeDateProv = (
  chainId: number,
  vault: { name: string; address: string },
  c: MetaMorphoChange,
  coverage: MetaMorphoCoverage,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  summary: `Change date — the time of ${chainWord(chainId)} block ${n(c.blockNumber)}, which holds ${logOf(chainId, c)}. Read from ${changesRoute(chainId, vault.address)}; ${reach(chainId, coverage)}.`,
  contract: vault,
  via: `Rails index · MetaMorpho ${c.event} · ${shortHex(c.txHash)} log ${c.logIndex}`,
  verify: txVerify(chainId, c.txHash),
});

/** One change in words: the log's arguments, and the earlier log a "from" value comes from. */
export const configChangeProv = (
  chainId: number,
  vault: { name: string; address: string },
  c: MetaMorphoChange,
  w: ChangeWords,
  coverage: MetaMorphoCoverage,
): Provenance => {
  const args = Object.entries(c.args)
    .map(([k, v]) => `${k} = ${Array.isArray(v) ? `[${v.length} market ids]` : v}`)
    .join(", ");
  const extra = [
    w.previous ? `The value before is from ${logOf(chainId, w.previous)}.` : null,
    w.waiting
      ? `It can be accepted ${w.waiting.timelock > 0 ? `${timelockText(w.waiting.timelock)} after it was submitted` : "as soon as it is submitted"}, by the timelock in force then${w.waiting.acceptedBy ? `; ${logOf(chainId, w.waiting.acceptedBy)} accepted it` : ""}. An acceptance is a SetCap with the same market and cap, at or after that time and before the next SubmitCap on the market; a revoked submission writes a log Rails does not read yet.`
      : w.accepted
        ? `${logOf(chainId, w.accepted)} accepted it: a SetCap with the same market and cap before the next SubmitCap on the market. The timelock in force then is not in the answer.`
        : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: c.blockNumber, txHash: c.txHash },
    summary: `Configuration change — ${logOf(chainId, c)}: ${args}. ${extra ? `${extra} ` : ""}Read from ${changesRoute(chainId, vault.address)}; ${reach(chainId, coverage)}.`,
    contract: vault,
    via: `Rails index · MetaMorpho ${ARG_NOTE[c.event] ?? c.event}`,
    verify: txVerify(chainId, c.txHash),
  };
};

/** The count of changes in the window. */
export const configChangeCountProv = (
  chainId: number,
  vault: { name: string; address: string },
  count: number,
  window: { fromTime: number; block: number },
  coverage: MetaMorphoCoverage,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  summary: `Changes in 30 days — ${n(count)} SetCap, SubmitCap, SetSupplyQueue, SetWithdrawQueue, SetCurator, SetGuardian, SetTimelock and OwnershipTransferred logs of the vault from ${formatDate(window.fromTime)} to ${chainWord(chainId)} block ${n(window.block)}, the page's block. Reallocations are left out. Read from ${changesRoute(chainId, vault.address)}; ${reach(chainId, coverage)}.`,
  contract: vault,
  via: "Rails index · MetaMorpho configuration logs, the 30 days to the page's block",
  formula: "count(logs where block time is within 30 days of the page's block)",
  verify: {
    kind: "recompute",
    text: `To check: list the vault's logs on ${chainMeta(chainId as ChainId).explorerName} for the last 30 days and count these eight events.`,
  },
});

const ROLE_EVENT: Record<StewardRunRole, string> = {
  curator: "SetCurator(newCurator)",
  owner: "OwnershipTransferred(previousOwner, newOwner)",
};

const rolesRoute = (chainId: number, address: string, role: StewardRunRole) =>
  `GET /api/metamorpho/${chainId}/roles/${address}?role=${role}`;

const startOf = (chainId: number, role: StewardRunRole, r: MetaMorphoRoleRun) =>
  `the ${role === "curator" ? "SetCurator" : "OwnershipTransferred"} log in transaction ${r.fromTx} at ${chainWord(chainId)} block ${n(r.fromBlock)}`;

const endOf = (chainId: number, role: StewardRunRole, r: MetaMorphoRoleRun) =>
  r.untilBlock == null
    ? "still held"
    : `the ${role === "curator" ? "SetCurator" : "OwnershipTransferred"} log in transaction ${r.untilTx} at ${chainWord(chainId)} block ${n(r.untilBlock)}`;

/** The start of the steward's current run in a vault. */
export const stewardSinceProv = (address: string, role: StewardRunRole, s: StewardSince): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: s.run.fromBlock, txHash: s.run.fromTx },
  summary: `${role === "curator" ? "Curator" : "Owner"} since — ${startOf(s.chainId, role, s.run)} made ${address} the vault's ${role}, and no later log has passed the role on. Read from ${rolesRoute(s.chainId, address, role)}; ${reach(s.chainId, s.coverage)}.`,
  contract: { name: s.name ?? "vault", address: s.vault },
  via: `Rails index · MetaMorpho ${ROLE_EVENT[role]} · ${shortHex(s.run.fromTx)}`,
  verify: txVerify(s.chainId, s.run.fromTx),
});

/** A ran-before vault's span: every run, its start and end logs. */
export const stewardBeforeProv = (address: string, role: StewardRunRole, b: StewardBefore): Provenance => {
  const { from, until } = spanOf(b);
  const runs = b.runs.map((r) => `from ${startOf(b.chainId, role, r)} to ${endOf(b.chainId, role, r)}`).join("; ");
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: until.untilBlock ?? from.fromBlock, txHash: until.untilTx ?? from.fromTx },
    summary: `Ran before — ${address} was the vault's ${role} ${b.runs.length === 1 ? "once" : `${n(b.runs.length)} times`}: ${runs}. Read from ${rolesRoute(b.chainId, address, role)}; ${reach(b.chainId, b.coverage)}.`,
    contract: { name: b.name ?? "vault", address: b.vault },
    via: `Rails index · MetaMorpho ${ROLE_EVENT[role]}, the runs that gave and passed on the role`,
    verify: txVerify(b.chainId, until.untilTx ?? from.fromTx),
  };
};

/** The count of vaults the steward ran before. */
export const stewardBeforeCountProv = (
  address: string,
  role: StewardRunRole,
  count: number,
  chains: { chainId: number; coverage: MetaMorphoCoverage }[],
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  summary: `Vaults it ran before — ${n(count)} MetaMorpho vaults on ${chains.map((c) => chainWord(c.chainId)).join(" and ")} where every run of ${address} as ${role} has ended, from ${chains.map((c) => rolesRoute(c.chainId, address, role)).join(" and ")}. ${chains.map((c) => `${reach(c.chainId, c.coverage)}.`).join(" ")}`,
  via: `Rails index · MetaMorpho ${ROLE_EVENT[role]} on ${chains.map((c) => chainWord(c.chainId)).join(" and ")}`,
  formula: "count(vaults where every run has an end)",
  verify: {
    kind: "recompute",
    text: `To check: list the ${role === "curator" ? "SetCurator" : "OwnershipTransferred"} logs naming ${address} on each chain's explorer, and find the later log that passed the role on in each vault.`,
  },
});

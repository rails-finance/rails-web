// Every word of the vault pages' "What protects it" (V9) and "The protocol
// underneath" (V10), rails-ops ui-jobs 554 pieces A and B. Each line states
// what the chain answered at one block, and which rule of the protocol's
// published source turns that answer into a wait or a power; nothing here
// rates, forecasts or recommends.
//
// The facts are read by lib/vaults/protects-read.ts and traced by
// lib/vaults/protects-provenance.ts. Pure, with type imports only and the
// house date format.

import { formatDate } from "@/lib/date";
import { durationText, shortHex } from "@/lib/vaults/health-words";

export const PROTECTS_TITLE = "What protects it";
export const UNDERNEATH_TITLE = "The protocol underneath";

/** Said once on each vault page, in the first section's explanation slot. */
export const PROTECTS_DISCLAIMER =
  "Readings of the past at the blocks shown. Rails does not forecast, rate or recommend.";

export const PROTECTS_EXPLAINER = {
  label: "explanation of what protects it",
  readsTitle: "What it reads",
  reads: [
    "The waits, the roles and who holds them are read from the vault's contracts at the time shown.",
    "Which changes wait, and who may cancel them, come from the protocol's published source, named in each receipt.",
    "A grey line names what Rails did not read.",
  ],
};

export const UNDERNEATH_EXPLAINER = {
  label: "explanation of the protocol underneath",
  readsTitle: "What it reads",
  reads: [
    "The deployment date is the date of the block that first holds the contract's code, checked against the block before it.",
    "Whether the code can be replaced is read from the contract's proxy slots and its code.",
    "Who can replace it, and after what wait, is read from the admin's owner and governance's settings.",
  ],
};

export const UNREAD_TEXT = "This could not be read from chain just now, so no figure is stated for it.";

// ── Facts ──────────────────────────────────────────────────────────────────

/** A contract's creation block, checked: no code one block before, code at it. */
export interface DeployFact {
  address: string;
  block: number;
  /** The block's time, seconds; null where unread. */
  at: number | null;
  /** True where the check passed; false where the chain disagreed; null where it did not answer. */
  checked: boolean | null;
  /** Where the block comes from. */
  source: string;
}

/** A contract's proxy slots and who owns its admin. */
export interface ProxyFact {
  name: string;
  address: string;
  /** The EIP-1967 implementation slot; null where empty. */
  impl: string | null;
  admin: string | null;
  /** The admin's `owner()`; null where unread or no admin. */
  adminOwner: string | null;
}

/** The code at an address: its size and the opcodes that run other code or delete it. */
export interface CodeFact {
  address: string;
  bytes: number;
  hooks: string[];
}

export interface AaveGovFact {
  governance: string;
  payloadsController: string;
  executor: string;
  /** Seconds the level-1 executor waits after a vote. */
  delay: number;
  votingDuration: number;
  coolDown: number;
  guardian: string;
}

export interface WaitFact {
  role: string;
  address: string;
  id: string;
  /** Seconds; the contract's own setting, before the default applies. */
  delay: number;
  window: number;
}

export type ProtectsFact =
  | {
      kind: "metamorpho";
      vault: string;
      timelock: number;
      guardian: string | null;
      owner: string;
      pendingTimelock: { value: number; validAt: number } | null;
      pendingGuardian: { value: string; validAt: number } | null;
    }
  | { kind: "yearn-v3"; vault: string; unlock: number; roleManager: string }
  | { kind: "aave-gov"; subject: "stata" | "sgho"; vault: string; gov: AaveGovFact; govAdmin: boolean | null }
  | {
      kind: "umbrella";
      vault: string;
      cooldown: number;
      window: number;
      umbrella: string;
      govAdmin: boolean | null;
      gov: AaveGovFact;
    }
  | {
      kind: "maple";
      pool: string;
      manager: string;
      delegate: string | null;
      securityAdmin: string;
      globals: string;
      defaults: { delay: number; window: number };
      waits: WaitFact[];
    };

export type UnderneathFact =
  | { kind: "morpho-blue"; address: string; deploy: DeployFact | null; proxy: ProxyFact; code: CodeFact; owner: string }
  | {
      kind: "yearn-v3";
      vault: string;
      version: string;
      factory: string;
      /** The EIP-1167 copy's target; null where the vault holds its code whole. */
      cloneOf: string | null;
      /** The code that runs: the target's, or the vault's. */
      code: CodeFact | null;
      deploy: DeployFact | null;
    }
  | {
      kind: "aave-pool";
      pool: string;
      deploy: DeployFact | null;
      poolImpl: string | null;
      provider: string;
      adminInCode: boolean;
      providerOwner: string | null;
      wrapper: ProxyFact;
      gov: AaveGovFact;
    }
  | { kind: "sgho"; deploy: DeployFact | null; proxy: ProxyFact; gov: AaveGovFact }
  | { kind: "umbrella"; deploy: DeployFact | null; core: ProxyFact; stake: ProxyFact; gov: AaveGovFact }
  | {
      kind: "maple";
      pool: string;
      deploy: DeployFact | null;
      manager: ProxyFact;
      impl: string;
      factory: string;
      version: number | null;
      governor: string;
      securityAdmin: string;
      poolProxy: ProxyFact;
      poolCode: CodeFact;
    };

/** One line as the section draws it. */
export interface ProtectsLine {
  label: string;
  headline: string;
  sentence: string;
  /** What Rails did not read, said on the line, muted. */
  gap: string | null;
}

// ── Words ──────────────────────────────────────────────────────────────────

const days = (seconds: number) => durationText(seconds);
/** "3-day", for a duration that qualifies a noun. */
const dayAdj = (seconds: number) => days(seconds).replace(/ (day|hour|minute)s?\b/g, "-$1");
const when = (unix: number) => formatDate(new Date(unix * 1000));
const same = (a: string | null, b: string | null) => a != null && b != null && a.toLowerCase() === b.toLowerCase();

/** "after a 3-day vote and a 1-day wait". */
const govWait = (g: AaveGovFact) => `after a ${dayAdj(g.votingDuration)} vote and a ${dayAdj(g.delay)} wait`;

const deployedText = (name: string, d: DeployFact | null) =>
  d?.checked && d.at != null ? `${name}, deployed on ${when(d.at)}` : `${name}, deployment date not read`;

const ZERO = "0x0000000000000000000000000000000000000000";

const UNTRACED = "Rails could not trace who can replace its code.";

/** Governance owns this proxy's admin. */
export const governedBy = (p: ProxyFact, g: AaveGovFact) => p.impl != null && same(p.adminOwner, g.executor);

/** The Maple wait every listed manager shares, or null where they differ. */
export function mapleWait(f: Extract<ProtectsFact, { kind: "maple" }>): { delay: number; window: number } | null {
  // A zero window falls back to the default (MapleGlobals.isValidScheduledCall).
  const waits = f.waits.map((w) => (w.window === 0 ? f.defaults : { delay: w.delay, window: w.window }));
  const first = waits[0] ?? f.defaults;
  return waits.every((w) => w.delay === first.delay && w.window === first.window) ? first : null;
}

export function protectsLine(f: ProtectsFact): ProtectsLine {
  switch (f.kind) {
    case "metamorpho": {
      const pending = [
        f.pendingTimelock
          ? `A timelock of ${days(f.pendingTimelock.value)} is waiting, from ${when(f.pendingTimelock.validAt)}.`
          : null,
        f.pendingGuardian
          ? `A new guardian, ${shortHex(f.pendingGuardian.value)}, is waiting, from ${when(f.pendingGuardian.validAt)}.`
          : null,
      ].filter((s): s is string => s != null);
      if (f.timelock === 0)
        return {
          label: "Timelock",
          headline: "Adding a market, raising a cap and removing a market take effect at once",
          sentence: pending.join(" "),
          gap: null,
        };
      return {
        label: "Timelock",
        headline: `Adding a market, raising a cap, removing a market that still holds deposits, shortening the timelock and replacing the guardian each wait ${days(f.timelock)}`,
        sentence: [
          f.guardian
            ? `The guardian, ${shortHex(f.guardian)}, or the owner, ${shortHex(f.owner)}, can cancel any of them during the wait.`
            : `No guardian is set; the owner, ${shortHex(f.owner)}, can cancel any of them during the wait.`,
          "Lowering a cap and moving money between markets take effect at once.",
          ...pending,
        ].join(" "),
        gap: null,
      };
    }
    case "yearn-v3":
      return {
        label: "Profit release",
        headline:
          f.unlock === 0
            ? "Profit reaches the share price at once"
            : `Profit reaches the share price over ${days(f.unlock)}`,
        sentence:
          (f.roleManager === ZERO
            ? "No role manager is set."
            : `The role manager, ${shortHex(f.roleManager)}, assigns every role.`) +
          " Yearn's documentation lists no delay on a role holder's change; the vault's code may add one.",
        gap: "Whether a role holder works behind a timelock of its own is not read.",
      };
    case "aave-gov": {
      const guardian = `Aave's guardian, ${shortHex(f.gov.guardian)}, can cancel a change during the wait.`;
      return {
        label: "Governance",
        headline: `Changes need a ${dayAdj(f.gov.votingDuration)} Aave vote, then wait ${days(f.gov.delay)}`,
        sentence:
          f.subject === "stata"
            ? `Aave governance can change this wrapper and the pool it lends into. ${guardian}`
            : f.govAdmin
              ? `Aave governance holds sGHO's admin role. ${guardian}`
              : `Rails could not trace who holds sGHO's admin role. ${guardian}`,
        gap:
          f.subject === "sgho"
            ? "Which addresses hold its yield manager role is not read."
            : "Roles that act without a vote, such as the emergency admin's pause, are not read.",
      };
    }
    case "umbrella":
      return {
        label: "Cooldown",
        headline: `Withdrawing takes a ${dayAdj(f.cooldown)} cooldown, then a ${dayAdj(f.window)} window to unstake`,
        sentence:
          `Umbrella, ${shortHex(f.umbrella)}, can slash the stake: take part of it to cover a shortfall in the Aave reserve it backs.` +
          (f.govAdmin
            ? `Aave governance can change Umbrella ${govWait(f.gov)}.`
            : "Who can change Umbrella was not read."),
        gap: null,
      };
    case "maple": {
      const w = mapleWait(f);
      return {
        label: "Upgrades",
        headline: w
          ? `The pool delegate's upgrades wait ${days(w.delay)}, then must run within ${days(w.window)}`
          : "The pool delegate's upgrades wait on Maple's timelock",
        sentence:
          (f.delegate
            ? `The pool delegate, ${shortHex(f.delegate)}, runs the pool's lending; `
            : "The pool delegate runs the pool's lending; ") +
          `Maple's security admin, ${shortHex(f.securityAdmin)}, can upgrade without the wait.`,
        gap: "Rails has not matched the deployed managers' versions to Maple's published source.",
      };
    }
  }
}

export function underneathLine(f: UnderneathFact): ProtectsLine {
  switch (f.kind) {
    case "morpho-blue": {
      const fixed = f.proxy.impl == null && f.proxy.admin == null && f.code.hooks.length === 0;
      return {
        label: "Morpho Blue",
        headline: deployedText("Morpho Blue", f.deploy),
        sentence: fixed
          ? `Its code cannot be changed, and neither can a market's rules once it exists. Its owner, ${shortHex(f.owner)}, can allow new rate models and liquidation loan-to-value levels for new markets, and set a market's fee, at once.`
          : "Rails found a proxy slot or a delegate call in its code.",
        gap: null,
      };
    }
    case "yearn-v3": {
      const fixed = f.code != null && f.code.hooks.length === 0;
      return {
        label: "Yearn V3",
        headline: deployedText(`Yearn V3 vault ${f.cloneOf ? "code " : ""}${f.version}`, f.deploy),
        sentence: !f.code
          ? "Rails did not find the code this vault runs."
          : !fixed
            ? "Rails found a delegate call in the code this vault runs."
            : f.cloneOf
              ? "This vault runs a copy of that code, which cannot be changed."
              : "Its code cannot be changed.",
        gap: null,
      };
    }
    case "aave-pool":
      return {
        label: "Aave V3 Pool",
        headline: deployedText("Aave V3 Pool", f.deploy),
        sentence:
          f.poolImpl != null && f.adminInCode && same(f.providerOwner, f.gov.executor) && governedBy(f.wrapper, f.gov)
            ? `Aave governance can replace its code, and the wrapper's, ${govWait(f.gov)}.`
            : UNTRACED,
        gap: null,
      };
    case "sgho":
      return {
        label: "sGHO",
        headline: deployedText("sGHO", f.deploy),
        sentence: governedBy(f.proxy, f.gov) ? `Aave governance can replace its code ${govWait(f.gov)}.` : UNTRACED,
        gap: null,
      };
    case "umbrella":
      return {
        label: "Umbrella",
        headline: deployedText("Umbrella", f.deploy),
        sentence:
          governedBy(f.core, f.gov) && governedBy(f.stake, f.gov)
            ? `Aave governance can replace its code, and the stake token's, ${govWait(f.gov)}.`
            : UNTRACED,
        gap: null,
      };
    case "maple":
      return {
        label: "Pool manager",
        headline: deployedText("Maple pool manager", f.deploy),
        sentence: `Maple's security admin, ${shortHex(f.securityAdmin)}, can upgrade its code at once to a version Maple's governor, ${shortHex(f.governor)}, has enabled.`,
        gap: null,
      };
  }
}

/** Both sections as Markdown, for the ⋮'s Copy. */
export function protectsMarkdown(title: string, name: string, line: ProtectsLine): string {
  return [
    `## ${title}: ${name}`,
    "",
    `- **${line.label}**: ${[`${line.headline}.`, line.sentence, line.gap].filter(Boolean).join(" ")}`,
    "",
    PROTECTS_DISCLAIMER,
  ].join("\n");
}

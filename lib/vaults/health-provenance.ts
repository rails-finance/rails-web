// The receipts of "How the vault is doing" (rails-ops ui-jobs 553; the lines
// are lib/vaults/health.ts): each line's sentence traces to the reads behind
// it, each with its day and block, the daily store's key or the call at the
// page's block. The surface names no function or block (decision 0059 point 1).

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { formatUnitsExact } from "@/lib/utils/format";
import type { HealthLine, Span, StewardRole } from "@/lib/vaults/health";
import { yearlyOf } from "@/lib/vaults/health";
import type { VaultYieldRead } from "@/lib/vaults/yield";

const n = (v: number) => v.toLocaleString("en-US");
const dayText = (day: number) => formatDate(new Date(day * 86_400_000));

/** The vault a receipt is about, and the store keys its series sit under. */
export interface HealthReceiptVault {
  address: string;
  name: string;
  assetSymbol: string;
  decimals: number;
  priceKey: string;
  assetsKey: string;
}

const ROLE_CALL: Record<StewardRole, string> = {
  curator: "curator()",
  owner: "owner()",
  roleManager: "role_manager()",
  umbrellaOwner: "owner()",
};

const amountOf = (v: HealthReceiptVault, r: VaultYieldRead) =>
  `${formatUnitsExact(r.raw, v.decimals)} ${v.assetSymbol}`;

const readInput = (label: string, v: HealthReceiptVault, r: VaultYieldRead): ProvInput => ({
  label: `${label} · block ${n(r.block)} (${dayText(r.day)})`,
  value: amountOf(v, r),
  kind: "chain",
  pclass: "state",
});

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

const spanInputs = (v: HealthReceiptVault, label: string, s: Span): ProvInput[] => [
  readInput(`${label} from`, v, s.from),
  readInput(`${label} to`, v, s.to),
];

/** The receipt of one line; null where the line states no read. */
export function healthLineProv(line: HealthLine, v: HealthReceiptVault, chainBlock: number): Provenance | null {
  const contract = { name: v.name, address: v.address };
  const b = line.basis;
  switch (b.kind) {
    case "none":
      return null;
    case "size":
      return {
        kind: "derived",
        pclass: "state",
        source: { block: b.span.to.block },
        summary: `Growing or shrinking — total assets went from ${amountOf(v, b.span.from)} on ${dayText(b.span.from.day)} to ${amountOf(v, b.span.to)} on ${dayText(b.span.to.day)}, each the vault's \`totalAssets()\` stored once a day in Rails's daily store as \`${v.assetsKey}\`. Within 1% either way reads as Steady.`,
        contract,
        via: "daily store · totalAssets() once per UTC day @ the day's last block",
        formula: b.change == null ? "from → to" : "to / from − 1",
        inputs: [
          ...spanInputs(v, "total assets", b.span),
          ...(b.change == null ? [] : [{ label: "change", value: pct(b.change), kind: "derived" as const }]),
        ],
      };
    case "young":
      return {
        kind: "derived",
        pclass: "state",
        summary: `Series start — Rails's daily store holds \`${b.series === "price" ? v.priceKey : v.assetsKey}\` from ${dayText(b.firstDay)}, under the 30 days a change needs.`,
        contract,
        via: "daily store · one read per UTC day",
      };
    case "too-small":
      return {
        kind: "derived",
        pclass: "state",
        source: { block: chainBlock },
        summary:
          "Too small to measure — the vault's `totalAssets()` is under 10,000 raw units, where one unit of rounding moves the share price by more than 0.01% (decision 0047 point 4).",
        contract,
        via: `eth_call @ block ${n(chainBlock)}`,
      };
    case "earning": {
      const windows = b.windows.map((w, k) => ({
        label: `30 days to ${dayText(w.to.day)}`,
        value: `${pct(yearlyOf(w))} a year`,
        kind: "derived" as const,
        note: `${amountOf(v, w.from)} at block ${n(w.from.block)} to ${amountOf(v, w.to)} at block ${n(w.to.block)}${k === 0 ? ", the 30-day figure" : ""}`,
      }));
      return {
        kind: "derived",
        pclass: "state",
        source: { block: b.y30.to.block },
        summary: `Earning steadily — one share's \`convertToAssets\`, stored once a day as \`${v.priceKey}\`, gives ${pct(b.yearly30)} a year over the ${b.y30.to.day - b.y30.from.day} days to ${dayText(b.y30.to.day)}${b.yearly90 != null && b.y90 ? ` and ${pct(b.yearly90)} over the ${b.y90.to.day - b.y90.from.day} days` : ""}. Steady when the highest 30-day window less the lowest is under a quarter of the 30-day figure, and never under one point; Flat when the share price does not move.`,
        contract,
        via: "daily store · convertToAssets(10 ** decimals) once per UTC day",
        formula: "(p1 / p0 − 1) × 365 / days",
        inputs: [
          ...spanInputs(v, "share price, 30 days,", b.y30),
          ...(b.y90 ? [readInput("share price, 90 days, from", v, b.y90.from)] : []),
          ...windows,
        ],
      };
    }
    case "falls":
      return {
        kind: "derived",
        pclass: "state",
        source: { block: b.last.block },
        summary: `Has it lost money — ${n(b.reads)} daily share-price reads from ${dayText(b.first.day)} to ${dayText(b.last.day)}, stored as \`${v.priceKey}\`, fell from one day to the next ${n(b.falls)} times.${b.worst ? ` The largest fall was ${pct(b.worst.change)}, from ${amountOf(v, b.worst.from)} to ${amountOf(v, b.worst.to)}.` : ""} A fall past 0.1% in a day reads as Yes.${b.lostAssets ? ` The vault's \`lostAssets()\` at block ${n(b.lostAssets.block)} is ${formatUnitsExact(b.lostAssets.raw, v.decimals)} ${v.assetSymbol}.` : ""}`,
        contract,
        via: "daily store · convertToAssets(10 ** decimals) once per UTC day",
        inputs: [
          readInput("first read", v, b.first),
          readInput("last read", v, b.last),
          ...(b.worst ? spanInputs(v, "largest fall", b.worst) : []),
          ...(b.lostAssets
            ? [
                {
                  label: `lostAssets() · block ${n(b.lostAssets.block)}`,
                  value: `${formatUnitsExact(b.lostAssets.raw, v.decimals)} ${v.assetSymbol}`,
                  kind: "chain" as const,
                  pclass: "state" as const,
                },
              ]
            : []),
        ],
      };
    case "lost-only":
      return {
        kind: "chain",
        pclass: "state",
        source: { block: b.lostAssets?.block ?? chainBlock },
        summary: b.lostAssets
          ? `Lost assets — the vault's \`lostAssets()\` at block ${n(b.lostAssets.block)} is ${formatUnitsExact(b.lostAssets.raw, v.decimals)} ${v.assetSymbol}.`
          : `Lost assets — the vault reverts on \`lostAssets()\` at block ${n(chainBlock)}: a MetaMorpho V1.0 vault keeps no such ledger.`,
        contract,
        via: `eth_call @ block ${n(b.lostAssets?.block ?? chainBlock)}`,
      };
    case "exit": {
      const e = b.exit;
      if (e.kind === "cooldown")
        return {
          kind: "chain",
          pclass: "state",
          source: { block: e.block },
          summary: `Cooldown — the stake token's cooldown is ${n(e.cooldownSeconds)} seconds and its unstake window ${n(e.windowSeconds)} seconds at block ${n(e.block)}.`,
          contract,
          via: `eth_call @ block ${n(e.block)}`,
          inputs: [
            { label: "getCooldown()", value: `${n(e.cooldownSeconds)} s`, kind: "chain", pclass: "state" },
            { label: "getUnstakeWindow()", value: `${n(e.windowSeconds)} s`, kind: "chain", pclass: "state" },
          ],
        };
      const raw = (r: string) => `${formatUnitsExact(r, v.decimals)} ${v.assetSymbol}`;
      if (e.kind === "idle")
        return {
          kind: "derived",
          pclass: "state",
          source: { block: e.block },
          summary: `Idle share — the vault's \`totalIdle()\` is ${raw(e.idle)} of its \`totalAssets()\` ${raw(e.total)} at block ${n(e.block)}: the asset in the vault, ready for a withdrawal.`,
          contract,
          via: `eth_call @ block ${n(e.block)}`,
          formula: "totalIdle / totalAssets",
          inputs: [
            { label: "totalIdle()", value: raw(e.idle), kind: "chain", pclass: "state" },
            { label: "totalAssets()", value: raw(e.total), kind: "chain", pclass: "state" },
          ],
        };
      return {
        kind: "derived",
        pclass: "state",
        source: { block: e.block },
        summary: `Can leave today — Rails's sum over the vault's withdraw queue at block ${n(e.block)}: in each market, the lesser of the vault's assets there and the market's supply less its borrow, from Morpho Blue's \`position\` and \`market\`, each market accrued to the block. ${raw(e.withdrawable)} of the queue's ${raw(e.queueAssets)}.`,
        contract,
        via: `eth_call @ block ${n(e.block)}`,
        formula: "Σ min(vault's assets, supply − borrow) / Σ vault's assets",
        inputs: [
          { label: "can be withdrawn", value: raw(e.withdrawable), kind: "derived" },
          { label: "the queue's sum", value: raw(e.queueAssets), kind: "derived" },
        ],
      };
    }
    case "steward":
      return {
        kind: "chain",
        pclass: "state",
        source: { block: b.block },
        summary: `Who runs it — the vault's \`${ROLE_CALL[b.role]}\` at block ${n(b.block)} is ${b.address}. No name is attested for it.`,
        contract,
        via: `eth_call @ block ${n(b.block)}`,
        inputs: [{ label: ROLE_CALL[b.role], value: b.address, kind: "chain", pclass: "state" }],
      };
  }
}

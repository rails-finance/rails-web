// The receipts of "How the vault is doing" (rails-ops ui-jobs 553; the lines
// are lib/vaults/health.ts): each line's sentence traces to the reads behind
// it, each with its day and block, the daily store's key or the call at the
// page's block. The surface names no function or block (decision 0059 point 1).

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { formatUnitsExact } from "@/lib/utils/format";
import type { Health, HealthKey, Span, StewardRole } from "@/lib/vaults/health";
import { yearlyOf } from "@/lib/vaults/health";
import { withScaleNote } from "@/lib/vaults/asset-scale-words";
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
  /** Where the asset's decimals disagree (ui-jobs 664): the sentence a receipt
   *  adds after an amount it prints in the asset at the stated scale. */
  scaleNote?: string;
}

const ROLE_CALL: Record<StewardRole, string> = {
  curator: "curator()",
  owner: "owner()",
  roleManager: "role_manager()",
  umbrellaOwner: "owner()",
  poolDelegate: "poolDelegate() on the PoolManager",
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

/** The lines whose receipt prints an amount in the asset. A yield or a fall is
 *  a ratio of two reads at one scale, so its percentage stands either way. */
const PRINTS_AMOUNTS: ReadonlySet<Health[HealthKey]["kind"]> = new Set([
  "size",
  "yield",
  "falls",
  "lost-only",
  "withdrawals",
]);

/** The receipt of one line; null where the line states no read. */
export function healthLineProv(
  key: HealthKey,
  health: Health,
  v: HealthReceiptVault,
  chainBlock: number,
): Provenance | null {
  const p = lineProv(key, health, v, chainBlock);
  return p && v.scaleNote && PRINTS_AMOUNTS.has(health[key].kind) ? withScaleNote(p, v.scaleNote) : p;
}

function lineProv(key: HealthKey, health: Health, v: HealthReceiptVault, chainBlock: number): Provenance | null {
  const contract = { name: v.name, address: v.address };
  const b = health[key];
  switch (b.kind) {
    case "none":
      return null;
    case "size":
      return {
        kind: "derived",
        pclass: "state",
        source: { block: b.span.to.block },
        summary: `Size — total assets went from ${amountOf(v, b.span.from)} on ${dayText(b.span.from.day)} to ${amountOf(v, b.span.to)} on ${dayText(b.span.to.day)}, each the vault's \`totalAssets()\` stored once a day in Rails's daily store as \`${v.assetsKey}\`.`,
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
        summary: `Series start — Rails's daily store holds \`${key === "yield" ? v.priceKey : v.assetsKey}\` from ${dayText(b.firstDay)}, under the 30 days a change needs.`,
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
    case "yield": {
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
        summary: `Yield — one share's \`convertToAssets\`, stored once a day as \`${v.priceKey}\`, gives ${pct(b.yearly30)} a year over the ${b.y30.to.day - b.y30.from.day} days to ${dayText(b.y30.to.day)}${b.yearly90 != null && b.y90 ? ` and ${pct(b.yearly90)} over the ${b.y90.to.day - b.y90.from.day} days` : ""}.`,
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
        summary: `Losses — ${n(b.reads)} daily share-price reads from ${dayText(b.first.day)} to ${dayText(b.last.day)}, stored as \`${v.priceKey}\`, fell from one day to the next ${n(b.falls)} times.${b.worst ? ` The largest fall was ${pct(b.worst.change)}, from ${amountOf(v, b.worst.from)} to ${amountOf(v, b.worst.to)}.` : ""}${b.lostAssets ? ` The vault's \`lostAssets()\` at block ${n(b.lostAssets.block)} is ${formatUnitsExact(b.lostAssets.raw, v.decimals)} ${v.assetSymbol}.` : ""}`,
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
    case "withdrawals": {
      const raw = (r: string) => `${formatUnitsExact(r, v.decimals)} ${v.assetSymbol}`;
      const e = b.exit;
      const inputs: ProvInput[] = [];
      if (b.holder)
        inputs.push(
          {
            label: `maxWithdraw(holder) · block ${n(b.holder.block)}`,
            value: raw(b.holder.maxWithdraw),
            kind: "chain",
            pclass: "state",
          },
          {
            label: `the holder's claim · block ${n(b.holder.block)}`,
            value: raw(b.holder.claim),
            kind: "chain",
            pclass: "state",
          },
        );
      if (e?.kind === "cooldown")
        inputs.push(
          { label: "getCooldown()", value: `${n(e.cooldownSeconds)} s`, kind: "chain", pclass: "state" },
          { label: "getUnstakeWindow()", value: `${n(e.windowSeconds)} s`, kind: "chain", pclass: "state" },
        );
      if (e?.kind === "idle")
        inputs.push(
          { label: "totalIdle()", value: raw(e.idle), kind: "chain", pclass: "state" },
          { label: "totalAssets()", value: raw(e.total), kind: "chain", pclass: "state" },
        );
      if (e?.kind === "queue")
        inputs.push(
          { label: "can be withdrawn", value: raw(e.withdrawable), kind: "derived" },
          { label: "the queue's sum", value: raw(e.queueAssets), kind: "derived" },
        );
      const block = b.holder?.block ?? e?.block ?? chainBlock;
      const parts = [
        b.paused ? "The vault's `paused()` answers true." : "",
        b.shutdown ? "The vault's `isShutdown()` answers true." : "",
        b.holder
          ? `The vault's \`maxWithdraw\` for this holder is ${raw(b.holder.maxWithdraw)} against a claim of ${raw(b.holder.claim)}.`
          : "",
        e?.kind === "queue"
          ? `Rails's sum over the withdraw queue: in each market, the lesser of the vault's assets there and the market's supply less its borrow, from Morpho Blue's \`position\` and \`market\` accrued to the block, ${raw(e.withdrawable)} of the queue's ${raw(e.queueAssets)}.`
          : e?.kind === "idle"
            ? `The vault's \`totalIdle()\` is ${raw(e.idle)} of its \`totalAssets()\` ${raw(e.total)}.`
            : e?.kind === "cooldown"
              ? `The stake token's cooldown is ${n(e.cooldownSeconds)} seconds and its unstake window ${n(e.windowSeconds)} seconds.`
              : "",
      ];
      return {
        kind: "derived",
        pclass: "state",
        source: { block },
        summary: `Withdrawals — read at block ${n(block)}. ${parts.filter(Boolean).join(" ")}`,
        contract,
        via: `eth_call @ block ${n(block)}`,
        inputs,
      };
    }
    case "steward":
      return {
        kind: "chain",
        pclass: "state",
        source: { block: b.block },
        summary: `Steward — the vault's \`${ROLE_CALL[b.role]}\` at block ${n(b.block)} is ${b.address}. No name is attested for it.`,
        contract,
        via: `eth_call @ block ${n(b.block)}`,
        inputs: [{ label: ROLE_CALL[b.role], value: b.address, kind: "chain", pclass: "state" }],
      };
  }
}

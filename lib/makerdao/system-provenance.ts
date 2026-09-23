// MakerDAO SYSTEM-lane provenance vocabulary — the /makerdao/system view.
// ----------------------------------------------------------------------------
// The vault lane lives in event-provenance.ts and traces a single urn through
// captured Vat LogNotes. This lane traces the OTHER direction: the Vat's own
// balance sheet, read live at head, decomposed by ilk. Different route,
// different reads, so it gets its own file and its own `via` prefix — a receipt
// on this page must say which request delivered the figure, and every builder
// here names SYSTEM_VIA.
//
// The kinds follow the house rule. A value the Vat stores is `chain`. A value we
// multiply or divide out of Vat slots is `chain-derived`, carrying its formula
// and inputs — including `art × rate`, which is Maker's own §2 multiply but is
// still arithmetic we do here. The ilk GROUPING is `chain-derived` too, and
// deliberately so: the registry class and the ilk name are both chain values,
// but reading "PSM-USDC-A is not a vault type" out of them is our inference, and
// a receipt should say that out loud rather than pass it off as a slot.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { MAKER_ADDRESSES } from "./asset-catalog";

const VAT = { name: "Vat", address: MAKER_ADDRESSES.VAT };
const SPOTTER = { name: "Spotter", address: MAKER_ADDRESSES.SPOTTER };
const JUG = { name: "Jug", address: MAKER_ADDRESSES.JUG };
const DOG = { name: "Dog", address: MAKER_ADDRESSES.DOG };
const REGISTRY = { name: "IlkRegistry", address: MAKER_ADDRESSES.ILK_REGISTRY };
const AUTO_LINE = { name: "DssAutoLine", address: MAKER_ADDRESSES.DSS_AUTO_LINE };

/** The route every figure on this page arrives through. */
const SYSTEM_VIA = "GET /api/chain/makerdao/system";

/** Every value here is a head-block eth_call: re-running it IS the check. No
 *  deep link — explorers read head only, which is exactly what this reads. */
const STATE_VERIFY: ProvVerify = { kind: "recompute", text: "Re-run the eth_call against any node" };

// ── The Vat's balance sheet ──────────────────────────────────────────────────

/** Vat.debt — every DAI in existence. */
export const systemDebtProv = (): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary:
    "Every DAI in existence, as the Vat itself counts it — one slot, updated on every draw, repayment and fee accrual. This is not a token balance: DAI's ERC-20 supply is only the portion that has been withdrawn through a Join. The Vat's `debt` is the internal ledger's total, and it is the number the rest of this page decomposes.",
  contract: VAT,
  via: `${SYSTEM_VIA} · Vat.debt() @ head · rad ÷10^45`,
  verify: STATE_VERIFY,
});

/** Vat.Line — the global ceiling. */
export const globalLineProv = (): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary:
    "The most DAI the whole system may owe — the Vat's global ceiling, set by governance. Unlike a per-ilk `line`, no autoline touches this one: it is a fixed number a spell must change, so measuring debt against it means something.",
  contract: VAT,
  via: `${SYSTEM_VIA} · Vat.Line() @ head · rad ÷10^45`,
  verify: STATE_VERIFY,
});

export const globalFillProv = (debtDai: string, lineDai: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary:
    "How much of the system's global ceiling is drawn. Both operands are single Vat slots and the global Line is a governance constant rather than an autoline artifact, so this ratio states a real limit — which is precisely why the per-ilk table opposite shows no such figure.",
  contract: VAT,
  via: `${SYSTEM_VIA} · derived ratio`,
  formula: "Vat.debt ÷ Vat.Line",
  inputs: [
    { label: "Vat.debt", value: debtDai, kind: "chain", pclass: "state", note: "every DAI in existence" },
    { label: "Vat.Line", value: lineDai, kind: "chain", pclass: "state", note: "the global ceiling" },
  ],
  verify: STATE_VERIFY,
});

/** Vat.vice — unbacked DAI. */
export const viceProv = (): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary:
    "DAI that exists with no collateral behind it — the Vat's `vice` slot. It is created by `suck`, which mints DAI and charges an equal `sin` to the Vow in the same call, so it is never unaccounted: it is a debt the protocol owes itself. Liquidation shortfalls and the savings rate's accrual both land here, and the Vow's surplus buffer heals it. It is part of `debt`, which is why the reconcile above has to add it back.",
  contract: VAT,
  via: `${SYSTEM_VIA} · Vat.vice() @ head · rad ÷10^45`,
  verify: STATE_VERIFY,
});

export const vowSurplusProv = (): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary:
    "The surplus buffer — DAI the Vow holds, accrued from stability fees and liquidation penalties. It is what heals `sin` before the protocol ever has to auction MKR for it.",
  contract: VAT,
  via: `${SYSTEM_VIA} · Vat.dai(Vow) @ head · rad ÷10^45`,
  verify: STATE_VERIFY,
});

export const vowSinProv = (): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary:
    "The `sin` charged to the Vow — the matching entry for every DAI of `vice`. The Vow is the system's only sin holder, so this equals `vice`: reading both is the check, not a repetition.",
  contract: VAT,
  via: `${SYSTEM_VIA} · Vat.sin(Vow) @ head · rad ÷10^45`,
  verify: STATE_VERIFY,
});

/** Vat.live — the Emergency Shutdown flag. */
export const vatLiveProv = (): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary:
    "Whether the Vat still accepts changes. Emergency Shutdown sets this to 0 and freezes the system — collateral prices are fixed and vault owners redeem against them. A live Vat means normal operation; it is the one flag under which every other figure on this page is meaningful.",
  contract: VAT,
  via: `${SYSTEM_VIA} · Vat.live() @ head`,
  verify: STATE_VERIFY,
});

// ── The reconcile — the page's spine ─────────────────────────────────────────

/**
 * The Vat's own identity, asserted live. This is the one builder whose summary
 * has to be exactly true whether the check passes or fails, so it takes the
 * verdict rather than assuming it.
 */
export const reconcileProv = (reconciles: boolean, ilkCount: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: reconciles
    ? `The Vat's own identity, checked at this block: sum every ilk's debt, add the DAI that has no collateral behind it, and you have every DAI in existence — exactly, to the last rad (10^-45 DAI). Nothing is rounded to make it close. That the ${ilkCount} rows below account for all of it is what makes the decomposition trustworthy rather than merely plausible.`
    : `The Vat's own identity does NOT close at this block: summing every ilk's debt and adding the uncollateralized DAI leaves a gap against Vat.debt. That means this read is not accounting for every DAI in existence — most likely an ilk carrying debt that IlkRegistry.list() no longer returns. The decomposition below is incomplete by the residual shown, and should be read as such.`,
  contract: VAT,
  via: `${SYSTEM_VIA} · exact BigInt check in rad, before any rounding`,
  // Every identifier here must be carried by a traced input below — the
  // receipt's own self-audit checks it, and an `ilk.Art` qualifier names an
  // operand ("ilk") that no input carries.
  formula: "Vat.debt − (Σ Art × rate + Vat.vice)",
  inputs: [
    {
      label: "Σ Art × rate",
      value: `${ilkCount} ilks`,
      kind: "chain-derived",
      pclass: "state",
      note: "each ilk's debt, summed in rad",
    },
    {
      label: "Vat.vice",
      value: "uncollateralized DAI",
      kind: "chain",
      pclass: "state",
      note: "matched by sin at the Vow",
    },
    { label: "Vat.debt", value: "every DAI in existence", kind: "chain", pclass: "state", note: "the Vat's own total" },
  ],
  verify: STATE_VERIFY,
});

/** Σ (Art × rate) — the sum the table's rows add up to. */
export const ilkDebtTotalProv = (ilkCount: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Every ilk's DAI debt, summed across all ${ilkCount} of them. Each term is that ilk's own \`Art × rate\` out of the Vat; the sum is taken in rad (10^-45 DAI) so the reconcile against Vat.debt is exact rather than approximate.`,
  contract: VAT,
  via: `${SYSTEM_VIA} · Σ over the roster · rad ÷10^45`,
  formula: "Σ (Vat.ilks(ilk).Art × Vat.ilks(ilk).rate)",
  verify: STATE_VERIFY,
});

// ── The roster ───────────────────────────────────────────────────────────────

/**
 * How the roster was enumerated. Worth its own receipt because the honest answer
 * is "the protocol's list, plus the ilks it forgot" — and a reader has no way to
 * know that from the numbers.
 */
export const rosterProv = (listedCount: number, unlistedCount: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `The ilks this page reads. The Vat keeps no iterable list — \`ilks\` is a bare mapping you can only reach with a key you already have — so the IlkRegistry is the protocol's only enumerator, and it returns ${listedCount}. It is a curated list, not the Vat's truth: governance drops an ilk from it on wind-down while the Vat keeps the slot forever. ${unlistedCount} such ilk${unlistedCount === 1 ? "" : "s"} still hold${unlistedCount === 1 ? "s" : ""} a wei of debt each, so ${unlistedCount === 1 ? "it is" : "they are"} read by name alongside the registry's list. The reconcile above is what proves the roster complete.`,
  contract: REGISTRY,
  via: `${SYSTEM_VIA} · IlkRegistry.list() @ head + named delisted ilks`,
  verify: STATE_VERIFY,
});

/** An ilk's debt — the Vat's §2 multiply. */
export const ilkDebtProv = (ilk: string, artHuman: string, rateRay: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `The DAI ${ilk} owes. The Vat stores normalized debt (\`Art\`) and a fee accumulator (\`rate\`) separately; the debt is their product, which is how the Vat itself computes it. Both operands are live slots.`,
  contract: VAT,
  via: `${SYSTEM_VIA} · Vat.ilks(ilk) @ head · Art × rate · rad ÷10^45`,
  formula: "Art × rate",
  inputs: [
    { label: "Art", value: artHuman, kind: "chain", pclass: "state", note: "normalized debt, wad" },
    { label: "rate", value: rateRay, kind: "chain", pclass: "state", note: "fee accumulator, ray" },
  ],
  verify: STATE_VERIFY,
});

export const ilkShareProv = (ilk: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `${ilk}'s share of all the DAI minted against collateral — its own \`Art × rate\` over the sum across every ilk.`,
  contract: VAT,
  via: `${SYSTEM_VIA} · derived ratio`,
  formula: "ilk debt ÷ Σ ilk debt",
  verify: STATE_VERIFY,
});

/**
 * The ilk's group. Chain-derived rather than chain: both operands are chain
 * values but the reading is ours, and the receipt says so.
 */
export const ilkGroupProv = (ilk: string, cls: number | null): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary:
    cls == null
      ? `What ${ilk} is. The IlkRegistry doesn't list it, which is the tell: an ilk is dropped from the registry when it is wound down, and the Vat keeps its slot forever. So it is grouped as delisted.`
      : `What ${ilk} is — read from the registry's own class (${cls}) and the ilk's own name. The class alone won't answer it: the legacy PSMs are class 1 (\`CLASS_GEM\`) exactly like ETH-A, because a PSM really is a GemJoin — just one no user borrows through. Where the name and the class disagree about that, the name wins, because putting module inventory in the "user borrowing" bucket would misstate the split this page is about. Both inputs are chain values; the grouping is a reading of them.`,
  contract: REGISTRY,
  via: `${SYSTEM_VIA} · IlkRegistry.info(ilk).class @ head + ilk name`,
  verify: STATE_VERIFY,
});

/** The group's Σ debt. */
export const groupTotalProv = (label: string, ilkCount: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `The DAI minted by ${label} — the ${ilkCount} ilk${ilkCount === 1 ? "" : "s"} in this group, each one's \`Art × rate\` summed.`,
  contract: VAT,
  via: `${SYSTEM_VIA} · Σ Art × rate over the group`,
  formula: "Σ (Art × rate) for the group's ilks",
  verify: STATE_VERIFY,
});

/** The group's share of all the DAI minted against collateral. */
export const groupShareProv = (label: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `How much of the DAI minted against collateral comes from ${label} — the group's summed debt over the sum across every ilk.`,
  contract: VAT,
  via: `${SYSTEM_VIA} · derived ratio`,
  formula: "Σ group ilk debt ÷ Σ ilk debt",
  verify: STATE_VERIFY,
});

/**
 * The headline: what fraction of Maker the vault explorer actually covers.
 */
export const userVaultShareProv = (vaultIlkCount: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `How much of Maker's debt is a user's vault. The ${vaultIlkCount} ilks a wallet can actually open a vault in, summed, over every ilk's debt. The rest is minted by modules — the PSM swapping DAI for stablecoins it holds, the Allocators funding protocol-owned strategies — which are Maker positions but nobody's position. That is why this explorer's roster is thousands of vaults against a system of billions.`,
  contract: VAT,
  via: `${SYSTEM_VIA} · Σ Art × rate over the vault-type ilks ÷ Σ over all`,
  formula: "Σ vault-type ilk debt ÷ Σ ilk debt",
  verify: STATE_VERIFY,
});

// ── Per-ilk parameters ───────────────────────────────────────────────────────

/**
 * The ceiling. Takes the state because "what limits this ilk" has a genuinely
 * different answer per state — and the autoline case is the one where the naive
 * reading (debt ÷ line) is worst.
 */
export const ceilingProv = (ilk: string, state: "auto" | "fixed" | "closed" | "dormant"): Provenance => {
  const summary = {
    auto: `What still can be drawn against ${ilk}. Governance doesn't set this ceiling directly — the DssAutoLine does, lifting \`line\` to stay a fixed \`gap\` above current debt, no more than once every \`ttl\` seconds, up to a hard \`maxLine\`. So \`line\` chases debt, and debt ÷ line would mostly restate the gap rather than tell you anything: the real limit is maxLine, which is why that is the figure shown.`,
    fixed: `What still can be drawn against ${ilk} — its \`line\`, a constant only a governance spell moves. Debt against it is a genuine measure here, unlike the autoline-managed ilks.`,
    closed: `${ilk} is closed. Its \`line\` is 0 while debt is still outstanding, which is governance winding the ilk down: nothing new can be drawn, and the vaults that exist carry on and keep accruing the fee. This is not "fully utilised" — there is no ceiling left to be under.`,
    dormant: `${ilk} is dormant — no ceiling and no debt. The Vat keeps the slot; the ilk does nothing.`,
  }[state];
  return {
    kind: "chain",
    pclass: "state",
    summary,
    contract: state === "auto" ? AUTO_LINE : VAT,
    via:
      state === "auto"
        ? `${SYSTEM_VIA} · DssAutoLine.ilks(ilk) @ head · line/gap/ttl · rad ÷10^45`
        : `${SYSTEM_VIA} · Vat.ilks(ilk).line @ head · rad ÷10^45`,
    verify: STATE_VERIFY,
  };
};

export const availableProv = (ilk: string, lineDai: string, debtDai: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `What can be drawn against ${ilk} right now — its current \`line\` less its current debt, floored at zero (a ceiling cut below outstanding debt leaves nothing to draw, not a negative allowance).`,
  contract: VAT,
  via: `${SYSTEM_VIA} · derived`,
  // Names only what the inputs carry (the receipt self-audits this): the debt
  // leg's own Art × rate derivation is stated on that input, not here.
  formula: "max(0, line − debt)",
  inputs: [
    { label: "line", value: lineDai, kind: "chain", pclass: "state", note: "Vat.ilks(ilk).line, the ceiling now" },
    { label: "debt", value: debtDai, kind: "chain-derived", pclass: "state", note: "Art × rate" },
  ],
  verify: STATE_VERIFY,
});

export const systemMatProv = (ilk: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `The minimum collateralization ${ilk} vaults must keep — the Spotter's \`mat\` for the ilk. Below it, the vault can be liquidated.`,
  contract: SPOTTER,
  via: `${SYSTEM_VIA} · Spotter.ilks(ilk).mat @ head · ray ÷10^27`,
  verify: STATE_VERIFY,
});

export const systemFeeProv = (ilk: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `The stability fee ${ilk} debt accrues — Maker's own per-second rate (Jug.base + the ilk's \`duty\`, ray) compounded over a year's seconds. Governance sets the duty; nothing about it responds to how much is drawn, so it is not a curve and there is no utilisation behind it. It is the current rate, not a promise: a spell can change it at any block.`,
  contract: JUG,
  via: `${SYSTEM_VIA} · Jug.base() + Jug.ilks(ilk).duty @ head · compounded`,
  formula: "((base + duty) ÷ RAY) ^ 31,536,000 − 1",
  verify: STATE_VERIFY,
});

export const systemDustProv = (ilk: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `The least debt a ${ilk} vault may carry — the Vat's \`dust\` floor. A vault must be above it or hold nothing at all, which is what stops positions too small to be worth liquidating from existing.`,
  contract: VAT,
  via: `${SYSTEM_VIA} · Vat.ilks(ilk).dust @ head · rad ÷10^45`,
  verify: STATE_VERIFY,
});

export const systemChopProv = (ilk: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `The liquidation penalty on ${ilk} — the Dog's \`chop\`, applied to the debt when a vault is barked. It is carried into the auction as a cushion; the surplus settles at the Vow, not with the liquidator.`,
  contract: DOG,
  via: `${SYSTEM_VIA} · Dog.ilks(ilk).chop @ head · wad ÷10^18`,
  verify: STATE_VERIFY,
});

export const systemOsmPriceProv = (ilk: string, collSym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `The ${collSym} price Maker itself acts on for ${ilk} — the OSM (Oracle Security Module) price, recovered by inverting Spotter.poke: price = spot × par × mat ÷ RAY². The OSM delays feeds by an hour by design, so this is the protocol's operative price, not the spot market's.`,
  contract: SPOTTER,
  via: `${SYSTEM_VIA} · Vat.ilks(ilk).spot × Spotter.par × Spotter.ilks(ilk).mat ÷ RAY² @ head`,
  formula: "spot × par × mat ÷ RAY²",
  verify: STATE_VERIFY,
});

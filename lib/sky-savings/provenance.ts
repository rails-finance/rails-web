// Receipts for every Sky Savings figure. Each names what the figure is read
// from: a sUSDS log (Deposit, Withdraw, Transfer, Referral, Drip, File), the
// sealed ledger rails-server replays from them, or the LitePSM fee that prices
// USDS in USDC. The rules are rails-ops reference/sky-savings-pipeline.md.

import type { Provenance } from "@/components/shared/provenance";
import type { SkySavingsEventType } from "@/lib/shared/types/event-shape";
import { explorerUrl } from "@/lib/shared/chains";
import { LITE_PSM, SKY_CHAIN_ID, SUSDS, USDS_PSM_WRAPPER } from "@/lib/sky-savings/constants";

const SUSDS_CONTRACT = { name: "sUSDS (Savings USDS)", address: SUSDS.address };
const LEDGER = "Rails index · sky-savings ledger, sealed at the page's block";
const n = (v: number) => v.toLocaleString("en-US");

const holdingsLink = (holder: string) => ({
  kind: "etherscan" as const,
  href: `${explorerUrl(SKY_CHAIN_ID, "token", SUSDS.address)}?a=${holder}`,
  text: "This address's sUSDS balance on Etherscan",
});

const scaling18 = (raw: string, from: "log" | "call" = "call") => ({
  raw,
  from,
  places: 18,
  why: "sUSDS and USDS both carry 18 decimals",
});

// ── the position, at the sealed block ───────────────────────────────────────

export const sharesHeldProv = (holder: string, block: number, raw: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `sUSDS held — the address's share balance at block ${n(block)}: every Deposit, Withdraw and Transfer that names it, replayed in order. The latest check compared it with balanceOf for every holder.`,
  contract: SUSDS_CONTRACT,
  via: `${LEDGER} · Σ shares in − shares out`,
  source: { block },
  scaling: scaling18(raw),
  verify: holdingsLink(holder),
});

export const valueProv = (block: number, raw: string, chi: string | null): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Worth in USDS — the sUSDS held times the share price at block ${n(block)}, rounded down as the contract's convertToAssets rounds.`,
  contract: SUSDS_CONTRACT,
  formula: "shares × chi ÷ 10^27",
  inputs: chi ? [{ label: "chi (USDS per sUSDS, 27 decimals)", value: chi, kind: "chain-derived" }] : undefined,
  source: { block },
  scaling: scaling18(raw),
});

export const earnedProv = (block: number, raw: string, inRaw: string, outRaw: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Interest earned — what the position is worth at block ${n(block)}, plus every USDS amount that left it, less every USDS amount that came in. Shares received by transfer count at their value on arrival.`,
  contract: SUSDS_CONTRACT,
  formula: "value + USDS out − USDS in",
  inputs: [
    { label: "USDS in (deposits, and transfers in at the share price then)", value: inRaw, kind: "chain-derived" },
    {
      label: "USDS out (withdrawals, and transfers out at the share price then)",
      value: outRaw,
      kind: "chain-derived",
    },
  ],
  source: { block },
  scaling: scaling18(raw),
});

export const chiProv = (block: number, chi: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Share price — the USDS one sUSDS redeems for at block ${n(block)}: the last Drip's chi grown at the Savings Rate to that block, with the contract's rounding.`,
  contract: SUSDS_CONTRACT,
  formula: "rpow(ssr, t − rho) × chi ÷ 10^27",
  inputs: [{ label: "chi (27 decimals)", value: chi, kind: "chain-derived" }],
  source: { block },
});

export const rateProv = (block: number, ssr: string, annual: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `Savings Rate — the ssr the last File('ssr') log set, in force at block ${n(block)}, as a yearly figure (${annual}).`,
  contract: SUSDS_CONTRACT,
  formula: "ssr ^ 31,536,000 − 1",
  inputs: [{ label: "ssr (per second, 27 decimals)", value: ssr, kind: "chain" }],
  source: { block },
});

export const psmPriceProv = (block: number, usdcPerUsds: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `USDS in USDC — the PSM exit rate at block ${n(block)}: 1 USDS buys 1 ÷ (1 + tout) USDC. The LitePSM's fee logs set tout, and it has been 0 since the PSM was deployed.`,
  contract: { name: "LitePSM MCD_LITE_PSM_USDC_A", address: LITE_PSM },
  via: `UsdsPsmWrapper ${USDS_PSM_WRAPPER} → LitePSM File('tout') logs`,
  formula: "1 ÷ (1 + tout)",
  inputs: [{ label: "USDC per USDS", value: usdcPerUsds, kind: "chain" }],
  source: { block },
});

export const gateProv = (block: number, holders: number, supply: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `The check — at block ${n(block)} the replayed supply matched totalSupply three ways, and balanceOf matched the ledger for ${n(holders)} addresses.`,
  contract: SUSDS_CONTRACT,
  via: "Rails verifier · sky_savings_verify_run, every six hours",
  inputs: [{ label: "totalSupply (raw)", value: supply, kind: "chain" }],
  source: { block },
});

// ── one event ───────────────────────────────────────────────────────────────

export interface SkyEventCoords {
  block: number;
  txHash: string;
  holder: string;
}

const src = (c: SkyEventCoords) => ({ block: c.block, txHash: c.txHash });

export const eventSharesProv = (c: SkyEventCoords, kind: SkySavingsEventType, raw: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary:
    kind === "deposit"
      ? "sUSDS minted — the shares word of this transaction's Deposit log, minted to this address."
      : kind === "withdrawal"
        ? "sUSDS burned — the shares word of this transaction's Withdraw log, burned from this address."
        : kind === "received"
          ? "sUSDS received — the value word of this transaction's Transfer log to this address."
          : kind === "sent"
            ? "sUSDS sent — the value word of this transaction's Transfer log from this address."
            : "Transfer to self — a Transfer log whose sender and receiver are both this address.",
  contract: SUSDS_CONTRACT,
  source: src(c),
  scaling: scaling18(raw, "log"),
});

export const eventUsdsProv = (
  c: SkyEventCoords,
  kind: SkySavingsEventType,
  raw: string,
  source: "log" | "chi",
  chi: string,
): Provenance =>
  source === "log"
    ? {
        kind: "chain",
        pclass: "emitted",
        summary:
          kind === "deposit"
            ? "USDS deposited — the assets word of this transaction's Deposit log."
            : "USDS withdrawn — the assets word of this transaction's Withdraw log.",
        contract: SUSDS_CONTRACT,
        source: src(c),
        scaling: scaling18(raw, "log"),
      }
    : {
        kind: "chain-derived",
        pclass: "indexed",
        summary: `Value in USDS — the shares this transfer moved at the share price of its block, rounded down as convertToAssets rounds.`,
        contract: SUSDS_CONTRACT,
        formula: "shares × chi ÷ 10^27",
        inputs: [{ label: "chi at this block (27 decimals)", value: chi, kind: "chain-derived" }],
        source: src(c),
        scaling: scaling18(raw),
      };

export const eventSharesAfterProv = (c: SkyEventCoords, raw: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary:
    "sUSDS held after — this address's balance after this log, replayed from every log that names it up to here.",
  contract: SUSDS_CONTRACT,
  via: LEDGER,
  source: src(c),
  scaling: scaling18(raw),
});

export const eventSharesBeforeProv = (c: SkyEventCoords, raw: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: "sUSDS held before — the balance after this log less the shares it moved.",
  contract: SUSDS_CONTRACT,
  formula: "held after − shares moved",
  source: src(c),
  scaling: scaling18(raw),
});

export const eventValueProv = (c: SkyEventCoords, which: "before" | "after", raw: string, chi: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary:
    which === "after"
      ? "Worth after — the sUSDS held after this log times the share price of its block."
      : "Worth before — the sUSDS held before this log times the share price of its block.",
  contract: SUSDS_CONTRACT,
  formula: "shares × chi ÷ 10^27",
  inputs: [{ label: "chi at this block (27 decimals)", value: chi, kind: "chain-derived" }],
  source: src(c),
  scaling: scaling18(raw),
});

export const eventEarnedProv = (c: SkyEventCoords, which: "before" | "after", raw: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary:
    which === "after"
      ? "Interest earned to date — the worth after this log, plus the USDS that had left, less the USDS that had come in."
      : "Interest earned before — the same sum with this log's USDS leg taken back out.",
  contract: SUSDS_CONTRACT,
  formula: "value + USDS out − USDS in",
  source: src(c),
  scaling: scaling18(raw),
});

export const eventChiProv = (c: SkyEventCoords, chi: string, fromLog: boolean): Provenance => ({
  kind: "chain-derived",
  pclass: fromLog ? "emitted" : "indexed",
  summary: fromLog
    ? "Share price at this block — the chi of the Drip every deposit and withdrawal runs first, in this transaction."
    : "Share price at this block — the last Drip's chi grown at the Savings Rate to this block, with the contract's rounding.",
  contract: SUSDS_CONTRACT,
  inputs: [{ label: "chi (27 decimals)", value: chi, kind: fromLog ? "chain" : "chain-derived" }],
  source: src(c),
});

export const eventRateProv = (c: SkyEventCoords, ssr: string, annual: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `Savings Rate in force — the ssr the last File('ssr') log before this block set, as a yearly figure (${annual}).`,
  contract: SUSDS_CONTRACT,
  formula: "ssr ^ 31,536,000 − 1",
  inputs: [{ label: "ssr (per second, 27 decimals)", value: ssr, kind: "chain" }],
  source: src(c),
});

export const eventReferralProv = (c: SkyEventCoords, code: number): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `Referral code ${code} — the referral topic of this transaction's Referral log, emitted beside the Deposit. The code changes no figure and pays the depositor nothing on chain. No registry names the front end behind a code.`,
  contract: SUSDS_CONTRACT,
  source: src(c),
});

export const eventCounterpartyProv = (c: SkyEventCoords, kind: SkySavingsEventType): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary:
    kind === "deposit"
      ? "Sender — the sender topic of the Deposit log: the address the USDS came from."
      : kind === "withdrawal"
        ? "Receiver — the receiver topic of the Withdraw log: the address the USDS went to."
        : "Other address — the other side of this transaction's Transfer log.",
  contract: SUSDS_CONTRACT,
  source: src(c),
});

// ── the rate history ────────────────────────────────────────────────────────

export const rateChangeProv = (block: number, txHash: string, ssr: string, annual: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `Savings Rate set to ${annual} — the File('ssr', data) log of this transaction; data is the per-second rate.`,
  contract: SUSDS_CONTRACT,
  formula: "ssr ^ 31,536,000 − 1",
  inputs: [{ label: "ssr (per second, 27 decimals)", value: ssr, kind: "chain" }],
  source: { block, txHash },
});

// ── the ledger under Lifetime flows ─────────────────────────────────────────

export const ledgerLineProv = (
  line: "held" | "deposited" | "received" | "withdrawn" | "sent" | "earned",
  block: number,
): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: {
    held: `Worth now — the sUSDS held at block ${n(block)} times the share price there.`,
    deposited: `Deposited — every Deposit log's assets word for this address, added up to block ${n(block)}.`,
    received: `Received — every transfer in, each at the share price of its block, added up to block ${n(block)}.`,
    withdrawn: `Withdrawn — every Withdraw log's assets word for this address, added up to block ${n(block)}.`,
    sent: `Sent — every transfer out, each at the share price of its block, added up to block ${n(block)}.`,
    earned: `Interest earned — worth now, plus withdrawn and sent, less deposited and received, at block ${n(block)}.`,
  }[line],
  contract: SUSDS_CONTRACT,
  via: LEDGER,
  source: { block },
});

export const eventInterestSinceProv = (
  c: SkyEventCoords,
  raw: string,
  prevBlock: number,
  prevValueAfter: string,
  valueBefore: string,
): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Interest since the previous event — the sUSDS held since block ${n(prevBlock)} at this block's share price, less their worth just after that event. No log moved it: it is the share price's growth on a balance that stood still.`,
  contract: SUSDS_CONTRACT,
  formula: "worth just before this event − worth just after the previous one",
  inputs: [
    { label: "Worth after the previous event (raw)", value: prevValueAfter, kind: "chain-derived" },
    { label: "Worth just before this event (raw)", value: valueBefore, kind: "chain-derived" },
  ],
  source: src(c),
  scaling: scaling18(raw),
});

export const yearlyProv = (block: number, valueRaw: string, annual: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `A year's interest at today's rate — the worth at block ${n(block)} times the Savings Rate in force there (${annual} a year, already compounded). Governance can change the rate at any block.`,
  contract: SUSDS_CONTRACT,
  formula: "worth × (ssr ^ 31,536,000 − 1)",
  inputs: [{ label: "Worth in USDS (raw)", value: valueRaw, kind: "chain-derived" }],
  source: { block },
});

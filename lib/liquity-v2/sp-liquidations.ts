// A Liquity V2 (or fork) stability-pool deposit's liquidations between its touches, as
// the timeline places them (rails-ops decision 0022 §3–§4; the read is
// rails-server's /stability-pool/liquidations). Each closed stretch with a
// liquidation is one market note anchored on the touch that closed it, so it
// draws between its two touches, as Polaris's PSM gap does
// (lib/polaris/psm-gap.ts). The open stretch since the last touch belongs to
// the "Since its last touch" row. Pure, type imports only, so
// scripts/test/liquity-v2-sp-liquidations.test.mjs loads it directly.

import type { MarketNotePoint, SpLiquidationsNote } from "@/lib/shared/market-note";
import type { LiquityV2DepositLiquidationsResponse, LiquityV2DepositStretch } from "@/lib/sources/api/liquity-v2-sp";
import type { SpDeployment } from "./sp-deployment";

const end = (e: {
  event_key: string;
  block_number: string;
  block_timestamp: string;
  tx_hash: string;
}): MarketNotePoint => ({
  block: Number(e.block_number),
  timestamp: Number(e.block_timestamp),
  value: 0,
  eventId: e.event_key,
  txHash: e.tx_hash,
  logIndex: 0,
  wallet: "",
  kind: "sp_op",
});

/** The branch's replay check, as counts; null where the route states none. */
export function spBranchCheck(read: LiquityV2DepositLiquidationsResponse<string>): SpLiquidationsNote["branchCheck"] {
  const c = read.branch_check;
  if (!c) return null;
  return { unreconciled: Number(c.unreconciled), closedStretches: Number(c.closed_stretches) };
}

/** One note per closed stretch that holds a liquidation, or whose touch
 *  reported a loss or a gain the liquidations do not account for; `pool` the
 *  branch's StabilityPool (LIQUITY_V2_SP_POOLS). Each note anchors on its
 *  closing touch by event key (`anchorTo`). */
export function spLiquidationNotes(
  branch: string,
  pool: string,
  read: LiquityV2DepositLiquidationsResponse<string>,
  /** The deployment, where it is not Liquity V2: its id and stablecoin. */
  dep?: Pick<SpDeployment, "id" | "stable">,
): SpLiquidationsNote[] {
  const branchCheck = spBranchCheck(read);
  const withdrawnAt = read.coll_withdrawn_at_block != null ? Number(read.coll_withdrawn_at_block) : undefined;
  return read.stretches
    .filter(
      (s): s is LiquityV2DepositStretch & { to: NonNullable<LiquityV2DepositStretch["to"]> } =>
        s.to != null && (s.liquidations.length > 0 || s.reconciles === false),
    )
    .map((s) => ({
      kind: "sp-liquidations",
      id: `sp-liquidations:${branch}:${s.from.block_number}-${s.to.block_number}`,
      marketSymbol: branch,
      marketAddress: pool,
      unitLabel: dep?.stable.symbol ?? "BOLD",
      protocol: "liquity-v2",
      ...(dep && dep.id !== "liquity-v2" ? { deployment: dep.id } : {}),
      ...(withdrawnAt != null ? { collWithdrawnAtBlock: withdrawnAt } : {}),
      from: end(s.from),
      to: end(s.to),
      anchorTo: s.to.event_key,
      branch,
      stretch: s,
      branchCheck,
    }));
}

/** The notes whose two touches are both among the rows the page holds: a
 *  note whose closing touch is not loaded has no row to sit under, and one
 *  whose opening touch is not loaded would sit against the boundary card. */
export function spNotesOnRows(notes: readonly SpLiquidationsNote[], has: (eventKey: string) => boolean) {
  return notes.filter(
    (n) => n.from.eventId != null && n.to.eventId != null && has(n.from.eventId) && has(n.to.eventId),
  );
}

/** How a closed period's liquidations meet what its closing touch wrote,
 *  from the residuals (the touch's figure less the liquidations' sum): above
 *  zero they fall short, below zero they exceed it. Where the BOLD and the
 *  collateral go opposite ways, each clause names its subject. Null where
 *  both residuals are zero. */
export function spResidualClause(
  residual: { bold_lost: string; coll_gained: string },
  coll: string,
  fmt: { bold: (v: bigint) => string; coll: (v: bigint) => string },
  /** The pool's stablecoin. */
  stable = "BOLD",
): string | null {
  const zero = BigInt(0);
  const rb = BigInt(residual.bold_lost);
  const rc = BigInt(residual.coll_gained);
  const mag = (v: bigint) => (v < zero ? -v : v);
  const bold = `${fmt.bold(mag(rb))} ${stable}`;
  const col = `${fmt.coll(mag(rc))} ${coll}`;
  if (rb === zero && rc === zero) return null;
  if (rb > zero && rc < zero)
    return `account for all but ${bold} of the burn, and exceed the ${coll} paid in by ${fmt.coll(mag(rc))}`;
  if (rb < zero && rc > zero)
    return `account for all but ${col} of the ${coll} paid in, and exceed the burn by ${fmt.bold(mag(rb))} ${stable}`;
  const items = [...(rb !== zero ? [bold] : []), ...(rc !== zero ? [col] : [])].join(" and ");
  return rb > zero || rc > zero ? `account for all but ${items}` : `exceed it by ${items}`;
}

export const isSpLiquidationsNote = (x: unknown): x is SpLiquidationsNote =>
  (x as SpLiquidationsNote | null)?.kind === "sp-liquidations";

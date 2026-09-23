"use client";

// A holder's vault life, as the shared timeline reads it — the adapter, and the
// run spec for a stretch of consecutive deposits or withdrawals.
// ----------------------------------------------------------------------------
// The rows on this page are `VaultHolderEvent`s: one log the vault emitted about
// one address. The toolbar, the windowing, the sort flip, the date range and the
// run collapse all live in `ChainTruthTimeline`, which reads `BaseActivityEvent`
// — so the two shapes meet here, once, rather than either being rewritten to fit
// the other.
//
// WHAT THE ADAPTER CARRIES, AND WHAT IT DELIBERATELY DOES NOT.
// It carries the coordinates the shared machinery actually reads: the id, the
// transaction, the block, the timestamp, the wallet, and the action key that the
// type filter buckets by. It carries NO `flows` and NO `context`.
//
//   • `flows` is the house's priced-movement shape (it has a `valueUsd` field
//     and a counterparty). This section prices nothing, and a flow list would
//     be a second statement of the amounts the row already draws from the
//     vault's own log — one of them would eventually be wrong. The heatmap and
//     the filter menus read timestamps and action keys, not flows, so nothing
//     on the toolbar loses a control by its absence.
//   • `context` is the discriminated per-protocol envelope in
//     `lib/shared/types/event-shape.ts`. Adding an arm for this roster would be
//     a SECOND declaration of `VaultHolderEvent`, which already lives in
//     `lib/shared/vault-holder-timeline.ts` and is shared with Base. The page
//     keeps its own id → event map instead and narrows there; the adapted event
//     is a coordinate record, not a copy of the row.
//
// The action key is the vault event's own `kind`, so the type filter's buckets
// are the words the rows themselves use. `lib/shared/event-filter-helpers.ts`
// carries the label table under the key `aave-vaults`.
//
// ── THE RUN ─────────────────────────────────────────────────────────────────
// A holder that deposits every day collects long stretches of one kind of row;
// the fixture this was built against (168 transfers) has runs of 33, 31 and 17
// consecutive deposits. Those collapse into one folder each, exactly as a
// keeper's liquidation burst does on the lending explorers, and expand in place.
//
// ⚠️ A RUN'S ASSET Σ IS STATED ONLY WHERE EVERY MEMBER HAS AN ASSET LEG. The
// `assets` word is the contract's own, emitted in the ERC-4626 `Deposit` /
// `Withdraw` beside the transfer; a mint with no matching event carries none
// (`VaultHolderEvent.assets` is null there, and the row says so). Summing the
// ones that have it and printing that as the run's total would state a figure
// no reading supports — so the asset pair is omitted entirely for such a run
// and the share pair, which is exact on every row, stands alone.
//
// The shares Σ accumulates in BigInt and is scaled once, at the end. A vault run
// is one share token and one asset — there is nothing to bucket by symbol — and
// summing 18-decimal magnitudes as floats would drift where the rows themselves
// are wei-exact.
//
// NO OPINIONATED COLOUR AND NO TONE. A deposit run and a withdrawal run are the
// same KIND of fact — what the holder did, several times — so both draw in the
// folder register: neutral ink, a dot on the line, no warning mark. The verbs
// beside each summed pair say which.
//
// ── PLAIN SHARE TRANSFERS COLLAPSE TOO (2026-09-10) ─────────────────────────
// The vault layer's plumbing — a stake token holding its own stata backing, a
// router, a Safe treasury — has NEITHER a deposit nor a withdrawal in its whole
// life: every row is a plain share transfer. Measured over the 2026-09-10
// census, the stata family's median position carries 5 events and its 95th
// percentile 428, with one life at 63,207; before this the whole drawn window of
// such a page was individual cards while a retail position with three deposits
// collapsed. The machinery was already here and simply did not cover the one
// kind these positions have.
//
// ⚠️ A RUN NEVER MIXES DIRECTIONS. `transfer-in` and `transfer-out` are separate
// `kind`s on the row, and `sameRun` joins only neighbours of the SAME kind — so
// the direction split is the same rule that keeps a deposit out of a withdrawal
// run. It is load-bearing here rather than incidental: the share Σ is a single
// pair in one token, so a folder holding both directions could only state a
// figure that NETS them, which is not what any member row says. Send and receive
// are two facts and they get two folders.
//
// A transfer carries no asset leg (the vault emits no ERC-4626 `Deposit` /
// `Withdraw` beside a holder-to-holder `Transfer`), so the asset-Σ rule above
// omits the pair on its own — no special case was needed for it.

import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders, TRANSFER_FOLDER_BADGE } from "@/lib/shared/run-folders";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { KIND_LABEL, type VaultHolderEvent } from "@/lib/shared/vault-holder-timeline";

/** The protocol key the filter menus and the persisted view state are keyed by.
 *  It is the label table's key in `lib/shared/event-filter-helpers.ts` too, so
 *  the menu reads the vault's own words rather than another roster's. */
export const AAVE_VAULT_TIMELINE_KEY = "aave-vaults";

/** Runs shorter than this stay as individual cards: collapsing two rows hides a
 *  real event behind a click for no density win. */
export const MIN_VAULT_RUN = 3;

/** One vault event, as the shared timeline's coordinate record. */
export function vaultEventToActivity(event: VaultHolderEvent, chainId: ChainId, holder: string): BaseActivityEvent {
  return {
    id: event.id,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    timestamp: event.timestamp,
    wallet: holder,
    actionType: event.kind,
    actionLabel: KIND_LABEL[event.kind],
    flows: [],
    etherscanUrl: explorerUrl(chainId, "tx", event.txHash),
  };
}

const RUN_KINDS = new Set(["deposit", "withdrawal", "transfer-in", "transfer-out"]);

/** Σ of a run's own share deltas, wei-exact, then scaled once. */
const scaledAbsSum = (raws: string[], decimals: number): number =>
  Number(raws.reduce((acc, raw) => acc + (BigInt(raw) < BigInt(0) ? -BigInt(raw) : BigInt(raw)), BigInt(0))) /
  Math.pow(10, decimals);

/** The verbs a run's two summed pairs wear — the share leg first, because it is
 *  the leg every member has. Both are the contract's own words for what
 *  happened: a deposit MINTS shares, a withdrawal BURNS them, a transfer moves
 *  them between two holders. A transfer run carries NO asset verb because the
 *  vault emits no asset figure beside a holder-to-holder `Transfer` — the null
 *  is the absence itself, not a missing label. */
const VERBS = {
  deposit: { shares: "Minted", assets: "Deposited" },
  withdrawal: { shares: "Burned", assets: "Withdrawn" },
  "transfer-in": { shares: "Received", assets: null },
  "transfer-out": { shares: "Sent", assets: null },
} as const;

type VaultRunKind = keyof typeof VERBS;

const isRunKind = (kind: string): kind is VaultRunKind => kind in VERBS;

/** The singular noun the folder's count and aria label read in. Both directions
 *  are "transfer": the direction is already stated by the Σ's own verb, and a
 *  folder that said "transfer-outs" would be naming a field rather than a
 *  fact. */
const MEMBER_NOUN: Record<VaultRunKind, string> = {
  deposit: "deposit",
  withdrawal: "withdrawal",
  "transfer-in": "transfer",
  "transfer-out": "transfer",
};

export interface VaultRunOptions {
  /** The share token's symbol as the page states it. */
  shareUnit: string;
  assetSymbol: string;
  shareDecimals: number;
  assetDecimals: number;
}

/**
 * The run specs for one page. A FACTORY rather than a module constant, because
 * the units belong to the vault this page is about — but memoise the result on
 * the page: `ChainTruthTimeline` settles its rows on this array's identity, so
 * a fresh one per render recomputes every row.
 *
 * `byId` is the page's own id → event map. The adapted events the shared
 * machinery hands back carry coordinates only, so the figures a run sums are
 * read from the real rows here.
 */
export function aaveVaultTimelineRuns(
  byId: ReadonlyMap<string, VaultHolderEvent>,
  { shareUnit, assetSymbol, shareDecimals, assetDecimals }: VaultRunOptions,
): TimelineRunSpec[] {
  return [
    {
      match: (e: BaseActivityEvent) => RUN_KINDS.has(e.actionType),
      // A deposit run never absorbs a withdrawal, and an inbound transfer run
      // never absorbs an outbound one: each pair is two different actions, and
      // one folder standing for both would have to state a Σ that nets them,
      // which is not what either row says. `actionType` IS the row's own kind,
      // direction included, so this one equality carries both splits.
      sameRun: (prev: BaseActivityEvent, next: BaseActivityEvent) => prev.actionType === next.actionType,
      min: MIN_VAULT_RUN,
      render: (run, meta) =>
        renderRunFolders(run, meta, MIN_VAULT_RUN, (events, folder) => {
          const members = events.map((e) => byId.get(e.id)).filter((e): e is VaultHolderEvent => e != null);
          const first = members[0]?.kind;
          // Every member shares one kind (`sameRun`), so the first member's own
          // kind names the folder. The fallback is unreachable by that rule and
          // is here so a kind this file does not know about cannot render as
          // another kind's verb.
          const kind: VaultRunKind = first && isRunKind(first) ? first : "deposit";
          const verbs = VERBS[kind];
          const aggregates: RunAggregate[] = [
            {
              verb: verbs.shares,
              value: scaledAbsSum(
                members.map((m) => m.sharesDelta),
                shareDecimals,
              ),
              symbol: shareUnit,
              provWhat: `Shares ${verbs.shares.toLowerCase()}`,
            },
          ];
          // The asset side, only where the contract emitted it on EVERY member
          // — see the file header. `every` over an empty member list is true,
          // and so is the Σ it guards: an empty run has nothing omitted.
          const legs = members.map((m) => m.assets).filter((a): a is string => a != null);
          if (verbs.assets && legs.length === members.length && legs.length > 0)
            aggregates.push({
              verb: verbs.assets,
              value: scaledAbsSum(legs, assetDecimals),
              symbol: assetSymbol,
              provWhat: `${assetSymbol} ${verbs.assets.toLowerCase()}`,
            });
          return (
            <TimelineRunCard
              key={folder.key}
              count={events.length}
              memberNoun={MEMBER_NOUN[kind]}
              aggregates={aggregates}
              tone="neutral"
              muted
              folder
              // A custody folder wears the paper plane the single transfer row
              // wears on its token — the same mark the lending explorers' own
              // transfer folders carry. A deposit or withdrawal folder wears
              // none: it is the holder's own move into or out of the vault.
              folderBadge={kind === "transfer-in" || kind === "transfer-out" ? TRANSFER_FOLDER_BADGE : undefined}
              firstTimestamp={events[0].timestamp}
              lastTimestamp={events[events.length - 1].timestamp}
              isFirst={folder.isFirst}
              isLast={folder.isLast}
            >
              {folder.children}
            </TimelineRunCard>
          );
        }),
    },
  ];
}

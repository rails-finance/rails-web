"use client";

// Frankencoin challenge forensics — the auction lifecycle, grouped the way the
// chain groups it: by (hub, challenge number). One challenge can settle in
// SEVERAL ChallengeSucceeded slices (a multi-bid Dutch auction emits one per
// bid), so the card renders each challenge as a group with its slices inside,
// every figure traced to its own log field.
//
// The copy says WHO paid WHAT in WHICH token — the sharp edge of this
// mechanic: the CHALLENGER posts collateral (not ZCHF); an averted phase 1
// means someone bought the challenger's tokens at the declared price and the
// position survived; a succeeded phase-2 slice means a bidder paid ZCHF and
// took the POSITION's collateral.
//
// TWO-AXIS OUTCOME: the group verdict (averted / succeeded / ongoing) is the
// challenge's own axis; whether the position survived is the lifecycle's —
// stated separately, because a partially-sold position can stand.

import type { BaseActivityEvent, FrankencoinContext } from "@/lib/shared/types/event-shape";
import { isFrankencoinEvent } from "@/lib/shared/types/event-shape";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { Prov } from "@/components/shared/provenance";
import { EventTime } from "@/components/shared/event-time";
import { challengeFigureProv, type FrankencoinCoords } from "@/lib/frankencoin/event-provenance";
import { fmtFcColl, fmtFcPct, fmtZchf, dateTimeText } from "@/lib/frankencoin/figures";
import { useFrankencoinEventRead } from "@/lib/frankencoin/use-event-read";
import { shortAddress } from "@/lib/frankencoin/asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

type FrankEvent = BaseActivityEvent & { context: { protocol: "frankencoin"; data: FrankencoinContext } };

interface ChallengeGroup {
  key: string;
  hub: "v1" | "v2";
  number: string;
  challenger: string | null;
  collateralSymbol: string;
  started: FrankEvent | null;
  averted: FrankEvent[];
  succeeded: FrankEvent[];
}

/** Group a position's challenge events by (hub, challenge number). */
export function groupChallenges(events: BaseActivityEvent[]): ChallengeGroup[] {
  const groups = new Map<string, ChallengeGroup>();
  for (const e of events) {
    if (!isFrankencoinEvent(e)) continue;
    const ctx = e.context.data;
    if (
      ctx.eventType !== "challenge_started" &&
      ctx.eventType !== "challenge_averted" &&
      ctx.eventType !== "challenge_succeeded"
    )
      continue;
    // The chain's own auction key. A row without a number cannot join a
    // group — keyed by tx as a last resort so it still renders.
    const number = ctx.challengeNumber ?? `tx:${e.txHash}`;
    const key = `${ctx.hub}|${number}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        hub: ctx.hub,
        number,
        challenger: null,
        collateralSymbol: ctx.collateralSymbol,
        started: null,
        averted: [],
        succeeded: [],
      };
      groups.set(key, g);
    }
    if (ctx.eventType === "challenge_started") {
      g.started = e as FrankEvent;
      g.challenger = ctx.challenger ?? g.challenger;
    } else if (ctx.eventType === "challenge_averted") g.averted.push(e as FrankEvent);
    else g.succeeded.push(e as FrankEvent);
  }
  return [...groups.values()].sort(
    (a, b) =>
      (a.started?.timestamp ?? a.succeeded[0]?.timestamp ?? 0) -
      (b.started?.timestamp ?? b.succeeded[0]?.timestamp ?? 0),
  );
}

const coll = (s?: string): string => (s == null ? "—" : fmtFcColl(Number(s)));

/** A phase-1 purchase: who bought, for how much, and the pause it set. */
function AvertedLine({ e, symbol }: { e: FrankEvent; symbol: string }) {
  const ctx = e.context.data;
  const { read } = useFrankencoinEventRead(ctx, e.txHash, e.id);
  const a = read?.challenge?.kind === "averted" ? read.challenge : null;
  const paid = a ? Number(a.paid) : 0;
  const sizeFig = (
    <Prov info={challengeFigureProv("size", "averted", symbol, coordsOf(e), ctx.raw?.size)}>
      <strong className="font-semibold text-foreground">
        {coll(ctx.challengeSize)} {symbol}
      </strong>
    </Prov>
  );
  if (!a)
    return (
      <div className="text-sm text-rb-500 leading-relaxed">
        Averted: someone bought the challenger&rsquo;s {sizeFig} at the declared price, and the position&rsquo;s
        collateral and debt did not move.
      </div>
    );
  const withdrawn = a.buyer != null && a.buyer === a.challenger;
  return (
    <div className="text-sm text-rb-500 leading-relaxed">
      {withdrawn ? (
        <>Averted: the challenger withdrew its challenge and took back its {sizeFig}.</>
      ) : (
        <>
          Averted: {a.buyer ? <AddrLink address={a.buyer} /> : "a buyer"}
          {a.buyer && a.owner && a.buyer === a.owner ? " (the owner)" : " (not the owner)"} paid{" "}
          <strong className="font-semibold text-foreground">{fmtZchf(paid)} ZCHF</strong> for the challenger&rsquo;s{" "}
          {sizeFig}, the declared price. The position&rsquo;s collateral and debt did not move
          {a.cooldownUntil != null && a.cooldownUntil > e.timestamp ? (
            <>; its minting paused until {dateTimeText(a.cooldownUntil)}</>
          ) : null}
          .
        </>
      )}
    </div>
  );
}

/** A phase-2 slice: who bought what for how much, and where the ZCHF went. */
function SaleLine({ e, symbol }: { e: FrankEvent; symbol: string }) {
  const ctx = e.context.data;
  const c = coordsOf(e);
  const { read } = useFrankencoinEventRead(ctx, e.txHash, e.id);
  const s = read?.challenge?.kind === "succeeded" ? read.challenge : null;
  const bid = Number(ctx.bid ?? 0);
  const reward = s ? Number(s.reward) : null;
  const shortfall = s ? Number(s.shortfall) : 0;
  const ownerGot = s ? Number(s.ownerReceived) : 0;
  const bidder = s?.bidder ?? null;
  return (
    <div className="text-sm text-rb-500 leading-relaxed">
      {bidder ? (
        <>
          <AddrLink address={bidder} /> paid
        </>
      ) : ctx.txFrom ? (
        <>
          A bid sent by <AddrLink address={ctx.txFrom} /> paid
        </>
      ) : (
        <>A bidder paid</>
      )}{" "}
      <Prov info={challengeFigureProv("bid", "succeeded", symbol, c, ctx.raw?.bid)}>
        <strong className="font-semibold text-foreground">{fmtZchf(bid)} ZCHF</strong>
      </Prov>{" "}
      for{" "}
      <Prov info={challengeFigureProv("acquiredCollateral", "succeeded", symbol, c, ctx.raw?.acquiredCollateral)}>
        <strong className="font-semibold text-foreground">
          {coll(ctx.acquiredCollateral)} {symbol}
        </strong>
      </Prov>{" "}
      of the position&rsquo;s collateral.
      {s && reward != null ? (
        <>
          {" "}
          The challenger got {fmtZchf(reward)} ZCHF ({bid > 0 ? fmtFcPct(reward / bid) : "—"}) and its collateral back;{" "}
          {shortfall > 0 ? (
            <>
              the reserve covered a {fmtZchf(shortfall)} ZCHF shortfall on the {fmtZchf(Number(s.debtCleared))} ZCHF
              debt cleared
            </>
          ) : Number(s.debtCleared) > 0 ? (
            <>the rest cleared {fmtZchf(Number(s.debtCleared))} ZCHF of debt</>
          ) : (
            <>the position had no debt</>
          )}
          ; the owner received {fmtZchf(ownerGot)} ZCHF.
        </>
      ) : null}{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "tx-logs", e.txHash)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline"
        onClick={(ev) => ev.stopPropagation()}
      >
        tx ↗
      </a>
    </div>
  );
}

function AddrLink({ address }: { address: string }) {
  return (
    <a
      href={explorerUrl(MAINNET_CHAIN_ID, "address", address)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:underline tabular-nums"
      onClick={(e) => e.stopPropagation()}
    >
      {shortAddress(address)}
    </a>
  );
}

function coordsOf(e: FrankEvent): FrankencoinCoords {
  return {
    txHash: e.txHash,
    blockNumber: e.blockNumber,
    position: e.context.data.position,
    hub: e.context.data.hub,
  };
}

function GroupVerdict({ g }: { g: ChallengeGroup }) {
  const verdict =
    g.succeeded.length > 0
      ? // Names whose bet succeeded: the challenge's (rails-ops lexicon, Frankencoin).
        { label: "CHALLENGE SUCCEEDED", cls: "bg-red-500/20 text-red-500" }
      : g.averted.length > 0
        ? { label: "AVERTED", cls: "bg-positive/20 text-positive" }
        : { label: "ONGOING", cls: "bg-caution-400/20 text-caution-400" };
  return (
    <span className={`whitespace-nowrap font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${verdict.cls}`}>
      {verdict.label}
    </span>
  );
}

function Group({ g, positionOpen }: { g: ChallengeGroup; positionOpen: boolean | null }) {
  const sctx = g.started?.context.data;
  return (
    <div className="rounded-lg border border-rb-300/40 dark:border-rb-700/40 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <GroupVerdict g={g} />
          <span className="whitespace-nowrap font-semibold">
            Challenge #{g.number.startsWith("tx:") ? "—" : g.number}
          </span>
          <span className="whitespace-nowrap text-xs text-rb-500">{g.hub === "v1" ? "Hub V1" : "Hub V2"}</span>
        </span>
        {g.started && <EventTime ts={g.started.timestamp} />}
      </div>

      {g.started && sctx && (
        <div className="text-sm text-rb-500 leading-relaxed">
          {g.challenger ? <AddrLink address={g.challenger} /> : "A challenger"} posted{" "}
          <Prov info={challengeFigureProv("size", "started", g.collateralSymbol, coordsOf(g.started), sctx.raw?.size)}>
            <strong className="font-semibold text-foreground">
              {coll(sctx.challengeSize)} {g.collateralSymbol}
            </strong>
          </Prov>{" "}
          of its own, a bet that the owner-declared liquidation price was too high.
        </div>
      )}

      {g.averted.map((e) => (
        <AvertedLine key={e.id} e={e} symbol={g.collateralSymbol} />
      ))}

      {g.started && g.succeeded.length > 0 && g.averted.length === 0 && (
        <div className="text-sm text-rb-500 leading-relaxed">
          Nobody bought the challenger&rsquo;s collateral in phase 1, so phase 2 sold the position&rsquo;s.
        </div>
      )}

      {g.succeeded.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-rb-500">
            Phase 2, the challenge sale: {g.succeeded.length} slice{g.succeeded.length === 1 ? "" : "s"}
            {g.succeeded.length > 1 ? " (one settlement per bid, same challenge number)" : ""}
          </div>
          {g.succeeded.map((e) => (
            <SaleLine key={e.id} e={e} symbol={g.collateralSymbol} />
          ))}
        </div>
      )}

      {/* The two-axis line: the challenge's outcome above, the position's
          lifecycle here — a challenged position can survive. */}
      {g.succeeded.length > 0 && positionOpen != null && (
        <div className="text-xs text-rb-500">
          {positionOpen
            ? "The position survived this challenge: the sale took part of its collateral, and it remains open."
            : "The position is closed."}
        </div>
      )}
    </div>
  );
}

export function FrankencoinChallengeCard({
  events,
  positionOpen,
}: {
  /** The position's full frankencoin timeline (the card groups the challenge
   *  rows itself). */
  events: BaseActivityEvent[];
  /** Whether the position is open at head (the lifecycle axis) — null when
   *  unknown (chain read pending). */
  positionOpen: boolean | null;
}) {
  const groups = groupChallenges(events);
  if (groups.length === 0) return null;

  return (
    <PositionCardShell>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Challenge history</h3>
          <span className="text-xs text-rb-500">
            {groups.length} challenge{groups.length === 1 ? "" : "s"} — Frankencoin&rsquo;s oracle-free enforcement:
            auctions test the owner-declared price
          </span>
        </div>
        {groups.map((g) => (
          <Group key={g.key} g={g} positionOpen={positionOpen} />
        ))}
      </div>
    </PositionCardShell>
  );
}

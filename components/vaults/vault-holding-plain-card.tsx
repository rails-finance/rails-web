"use client";

// The holder pages' position card (V8; rails-ops ui-jobs 553, door 1): what
// the holder put in, took out, holds now and made or lost, in the vault's
// asset, with its worth over time beneath. Built on the shared card's detail
// surface (its ⋮, read stamp C5.1 and (i)); the figures are plain and the
// chain stays in each figure's receipt (decision 0059 point 1). The listing
// keeps components/vaults/vault-position-card.tsx.
//
// Put in and Taken out are the two sides of decision 0048's sum, Profit or
// loss is the sum itself, each only where its legs allow; Worth now is the
// claim at the page's block. The history arrives as a promise over the
// Lifetime flows replay, so Worth now paints first.

import Link from "next/link";
import { Suspense, use, useState, type ReactNode } from "react";
import { Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { PositionCard, type PositionCardHead, type PositionCardSlots } from "@/components/shared/position-card";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { NotLoaded } from "@/components/shared/not-loaded";
import { AssetAmount } from "@/components/shared/asset-amount";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { VaultVenueMark } from "@/components/vaults/vault-venue-mark";
import { formatCompact } from "@/lib/shared/format-compact";
import { formatUnitsExact } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { VAULT_FAMILIES, familyOfCensus } from "@/lib/vaults/families";
import type { ChainId } from "@/lib/shared/chains";
import type { VaultPositionFamily } from "@/lib/aave-vaults/vault-position";
import {
  holdingClaimProv,
  holdingEarnedProv,
  holdingFirstSeenProv,
  holdingFlowSideProv,
  holdingFractionProv,
  holdingNoSumProv,
  holdingProfitPctProv,
  holdingWorthLineProv,
  type HoldingCoords,
} from "@/lib/vaults/holding-provenance";
import type { VaultEarned } from "@/lib/vaults/earned";
import type { HoldingWorthLine, HoldingWorthPoint, PlainHoldingHistory } from "@/lib/vaults/holding-worth";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";

const ZERO = BigInt(0);
const units = (raw: string, decimals: number) => Number(raw) / 10 ** decimals;
const dayText = (day: number) => formatDate(new Date(day * 86_400_000));
const capital = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;
/** A percentage at reading precision: one decimal from 1%, two figures under
 *  it, a true minus. The receipt keeps the exact sum. */
const pctPlain = (fraction: number) => {
  const p = fraction * 100;
  const a = Math.abs(p);
  if (p === 0) return "0%";
  // exponent-safe: toPrecision runs on 0.0001 ≤ a < 1 only
  const text = a >= 1 ? a.toFixed(1) : a < 0.0001 ? "0.0001" : a.toPrecision(2);
  return `${p < 0 ? "−" : ""}${a < 0.0001 ? "under " : ""}${text}%`;
};

type EarnedOk = Extract<VaultEarned, { status: "ok" }>;

export interface VaultHoldingPlainCardProps {
  coords: HoldingCoords & { chainId: ChainId };
  /** The holding's family: a census family, or Yearn. */
  family: VaultPositionFamily | "yearn";
  /** Draw the venue mark beside the family word (Yearn: only where endorsed). */
  venueMark: boolean;
  vaultHref: string;
  /** This page's path, for "Link to this holding". */
  holdingHref: string;
  assetAddress?: string;
  shares: RawAmount;
  claim: RawAmount | null;
  totalSupply: RawAmount | null;
  /** Under 0.0001% of the vault. */
  dust: boolean;
  /** No balance and no row ever: the page has awaited the history to know. */
  never: boolean;
  history: Promise<PlainHoldingHistory>;
  /** The rewards paid outside the share, in the family's words (HOLDING_REWARDS). */
  rewards: string;
  /** Umbrella: the holder's cooldown in a few words, its state and receipt. */
  cooldown?: { state: string; text: string; prov: Provenance };
  /** The family's own bullets for the (i). */
  extra?: ReactNode;
  learnMore: LearnMoreContent;
}

/** The words a card prints where nothing is stated. */
const Unread = ({ what }: { what: string }) => <span className="text-base font-normal text-rb-500">{what}</span>;

const Pending = () => <div className="mt-2 h-9 w-20 animate-pulse rounded-md bg-rb-200 dark:bg-rb-700" />;

function MenuRows({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ToolsMenuItem
      icon={copied ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
      title="Link to this holding"
      subtitle={copied ? "Copied" : "Copy the page's address"}
      onClick={() =>
        void navigator.clipboard.writeText(`${window.location.origin}${href}`).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    />
  );
}

// ── why a sum has no figure, in plain words ──────────────────────────────────

const NO_SUM: Record<Exclude<VaultEarned["status"], "ok">, string> = {
  carried: "The vault's share price on the day of one of this address's transfers could not be read.",
  unreplayed: "This address's history does not add up to its balance at this read.",
  unread: "The vault did not answer what this balance is worth.",
};

// ── the figures over the history ─────────────────────────────────────────────

function SideValue({
  history,
  coords,
  assetAddress,
  dir,
}: {
  history: Promise<PlainHoldingHistory>;
  coords: HoldingCoords;
  assetAddress?: string;
  dir: "in" | "out";
}) {
  const { earned } = use(history);
  const name = dir === "in" ? "holder-put-in" : "holder-taken-out";
  if (earned.status !== "ok")
    return (
      <span data-figure={name}>
        <Prov info={holdingNoSumProv(coords, earned)}>
          <Unread what="not stated" />
        </Prov>
      </span>
    );
  const raw = dir === "in" ? earned.inRaw : earned.outRaw;
  return (
    <span data-figure={name} data-raw={raw}>
      <Prov info={holdingFlowSideProv(coords, earned, dir)}>
        <AssetAmount
          value={units(raw, coords.assetDecimals)}
          symbol={coords.assetSymbol}
          address={assetAddress}
          exact={formatUnitsExact(raw, coords.assetDecimals)}
          display={BigInt(raw) === ZERO ? "0" : undefined}
        />
      </Prov>
    </span>
  );
}

function ProfitValue({
  history,
  coords,
  assetAddress,
}: {
  history: Promise<PlainHoldingHistory>;
  coords: HoldingCoords;
  assetAddress?: string;
}) {
  const { earned } = use(history);
  if (earned.status !== "ok")
    return (
      <span data-figure="holder-earned" data-earned-status={earned.status} data-earned-block={earned.block}>
        <Prov info={holdingNoSumProv(coords, earned)}>
          <Unread what="not stated" />
        </Prov>
      </span>
    );
  const value = units(earned.earnedRaw, coords.assetDecimals);
  return (
    <span data-figure="holder-earned" data-earned-status="ok" data-earned-raw={earned.earnedRaw}>
      <Prov info={holdingEarnedProv(coords, earned, "Profit or loss")}>
        <AssetAmount
          value={value}
          symbol={coords.assetSymbol}
          address={assetAddress}
          exact={formatUnitsExact(earned.earnedRaw, coords.assetDecimals)}
          display={value === 0 ? "0" : `${value > 0 ? "+" : ""}${formatCompact(value)}`}
          signed
        />
      </Prov>
    </span>
  );
}

/** "2.1% since 26 Mar 2026", the percentage of what was put in. */
function profitPct(e: EarnedOk): number | null {
  const into = BigInt(e.inRaw);
  return into > ZERO ? Number(e.earnedRaw) / Number(into) : null;
}

function SinceDate({ history, coords }: { history: Promise<PlainHoldingHistory>; coords: HoldingCoords }) {
  const { firstSeen } = use(history);
  if (!firstSeen?.at) return null;
  return (
    <>
      {" since "}
      <Prov info={holdingFirstSeenProv(coords, firstSeen.block)}>
        <span data-figure="holder-first-seen">{formatDate(firstSeen.at)}</span>
      </Prov>
    </>
  );
}

function ProfitSub({ history, coords }: { history: Promise<PlainHoldingHistory>; coords: HoldingCoords }) {
  const { earned } = use(history);
  if (earned.status !== "ok") return <span data-earned-why="">{NO_SUM[earned.status]}</span>;
  const pct = profitPct(earned);
  return (
    <span data-figure="holder-earned-pct">
      {pct != null && (
        <Prov info={holdingProfitPctProv(coords, earned)}>
          <span className="tabular-nums">{pctPlain(pct)}</span>
        </Prov>
      )}
      <SinceDate history={history} coords={coords} />
    </span>
  );
}

// ── the worth line ───────────────────────────────────────────────────────────

/** The price chart's line (components/shared/lifetime-flows-combined.tsx). */
const LINE_HUE = "var(--color-blue-500)";
const VIEW_W = 300;
const VIEW_H = 48;
const PAD = 4;

/** The points as runs of consecutive days: a day the store has no row for ends a run. */
function runsOf(points: readonly HoldingWorthPoint[]): HoldingWorthPoint[][] {
  const runs: HoldingWorthPoint[][] = [];
  for (const p of points) {
    const run = runs[runs.length - 1];
    if (run && p.day === run[run.length - 1].day + 1) run.push(p);
    else runs.push([p]);
  }
  return runs;
}

function WorthLine({
  line,
  coords,
  startsLate,
}: {
  line: HoldingWorthLine;
  coords: HoldingCoords;
  /** The holding is older than the vault's stored series. */
  startsLate: boolean;
}) {
  const points = line.points;
  const first = points[0].day;
  const last = points[points.length - 1].day;
  const span = Math.max(1, last - first);
  const values = points.map((p) => Number(p.raw));
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values);
  const x = (day: number) => ((day - first) / span) * VIEW_W;
  const y = (v: number) => (hi === lo ? VIEW_H / 2 : PAD + (1 - (v - lo) / (hi - lo)) * (VIEW_H - 2 * PAD));
  const runs = runsOf(points);
  return (
    <div className="mt-4" data-anatomy="V8.1" data-holder-worth-line="" data-worth-days={points.length}>
      <div className="mb-1 text-xs text-rb-500">
        <Prov info={holdingWorthLineProv(coords, line)}>
          <span>Its worth, one read a day</span>
        </Prov>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="block h-12 w-full overflow-visible"
        role="img"
        aria-label={`This holding's worth in ${coords.assetSymbol}, one read a day, ${dayText(first)} to ${dayText(last)}`}
      >
        {runs.map((run) => (
          <path
            key={run[0].day}
            d={
              run.length === 1
                ? `M${x(run[0].day)},${y(Number(run[0].raw))}h0`
                : run.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day)},${y(Number(p.raw))}`).join("")
            }
            fill="none"
            stroke={LINE_HUE}
            strokeWidth={run.length === 1 ? 3 : 1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-rb-500 tabular-nums">
        <span>{dayText(first)}</span>
        <span>{dayText(last)}</span>
      </div>
      {startsLate && <p className="mt-1 text-xs text-rb-500">The line starts on the vault&rsquo;s first stored day.</p>}
    </div>
  );
}

function WorthBand({ history, coords }: { history: Promise<PlainHoldingHistory>; coords: HoldingCoords }) {
  const { worth, firstSeen } = use(history);
  if (!worth || worth.points.length < 2) return null;
  const firstDay = firstSeen?.at ? Math.floor(firstSeen.at / 86_400) : null;
  const startsLate =
    firstDay != null &&
    worth.storeDay != null &&
    worth.storeDay > firstDay &&
    worth.points[0].day <= worth.storeDay + 1;
  return <WorthLine line={worth} coords={coords} startsLate={startsLate} />;
}

// ── the (i) ──────────────────────────────────────────────────────────────────

function Explanation({ p, fraction }: { p: VaultHoldingPlainCardProps; fraction: number | null }) {
  const { earned, worth, firstSeen } = use(p.history);
  const c = p.coords;
  const sym = c.assetSymbol;
  const amt = (raw: string, signed = false) => {
    const v = units(raw, c.assetDecimals);
    if (v === 0) return `0 ${sym}`;
    return `${signed && v > 0 ? "+" : ""}${formatCompact(v).replace("-", "−")} ${sym}`;
  };
  const open = BigInt(p.shares.raw) > ZERO;
  const pct = earned.status === "ok" ? profitPct(earned) : null;
  return (
    <div data-holding-explanation="">
      <ExplainGroup title="This holding">
        {earned.status === "ok" ? (
          <ExplainBullet>
            This address put in <Fig bold>{amt(earned.inRaw)}</Fig> and took out <Fig bold>{amt(earned.outRaw)}</Fig>.
          </ExplainBullet>
        ) : null}
        {p.claim && (
          <ExplainBullet>
            {open ? (
              <>
                Its shares are worth <Fig bold>{amt(p.claim.raw)}</Fig> now
                {fraction != null && !p.dust ? (
                  <>
                    , <Fig bold>{pctPlain(fraction)}</Fig> of the vault
                  </>
                ) : null}
                .
              </>
            ) : (
              <>It holds none of the vault&rsquo;s shares now.</>
            )}
          </ExplainBullet>
        )}
        {earned.status === "ok" ? (
          <ExplainBullet>
            The profit or loss is <Fig bold>{amt(earned.earnedRaw, true)}</Fig>
            {pct != null && (
              <>
                , <Fig bold>{pctPlain(pct)}</Fig> of what was put in
              </>
            )}
            {firstSeen?.at ? <>, since {formatDate(firstSeen.at)}</> : null}.
          </ExplainBullet>
        ) : (
          <ExplainBullet>
            {NO_SUM[earned.status]} The profit or loss and the amounts in and out are left unstated.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="How it counts">
        <ExplainBullet>Every figure is in {sym}, the vault&rsquo;s asset.</ExplainBullet>
        <ExplainBullet>Shares received from another address count as put in, at their worth that day.</ExplainBullet>
        <ExplainBullet>{capital(p.rewards)} are left out.</ExplainBullet>
        {worth && worth.points.length >= 2 && (
          <ExplainBullet>The line is the holding&rsquo;s worth at each day&rsquo;s read.</ExplainBullet>
        )}
      </ExplainGroup>
      {p.extra && <ExplainGroup title="This address">{p.extra}</ExplainGroup>}
    </div>
  );
}

// ── the slots ────────────────────────────────────────────────────────────────

function plainSlots(p: VaultHoldingPlainCardProps): PositionCardSlots {
  const c = p.coords;
  const familyWord = VAULT_FAMILIES[p.family === "yearn" ? "yearn-v3" : familyOfCensus(p.family)].singular;
  const open = BigInt(p.shares.raw) > ZERO;

  const identity = (
    <span className="text-sm font-semibold text-foreground" data-card-vault-symbol={c.shareSymbol}>
      <Link href={p.vaultHref} className="hover:underline" prefetch={false}>
        {c.shareSymbol}
      </Link>
      <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-normal text-rb-500">
        <span>·</span>
        {p.venueMark && <VaultVenueMark family={p.family} />}
        <span>{familyWord}</span>
      </span>
    </span>
  );

  const fraction =
    p.totalSupply && BigInt(p.totalSupply.raw) > ZERO ? Number(p.shares.raw) / Number(p.totalSupply.raw) : null;

  const worthNow: PositionCardHead = {
    id: "worth-now",
    label: "Worth now",
    labelTip: `What this address's shares are worth in ${c.assetSymbol} at this read, by the vault's own conversion.`,
    value: (
      <span data-figure="holder-claim">
        {p.claim ? (
          <Prov info={holdingClaimProv(c, "Worth now")}>
            <AssetAmount
              value={p.claim.value}
              symbol={c.assetSymbol}
              address={p.assetAddress}
              exact={formatUnitsExact(p.claim.raw, c.assetDecimals)}
              display={BigInt(p.claim.raw) === ZERO ? "0" : undefined}
            />
          </Prov>
        ) : (
          <NotLoaded className="text-base font-normal text-rb-500" />
        )}
      </span>
    ),
    sub: !open ? (
      <span data-holder-empty={p.never ? "never" : "closed"}>
        {p.never ? "This address has never held this vault's shares." : "It holds none of this vault's shares now."}
      </span>
    ) : p.dust ? (
      <span data-figure="holder-fraction">under 0.0001% of the vault</span>
    ) : fraction != null ? (
      <span data-figure="holder-fraction">
        <Prov info={holdingFractionProv(c)}>{pctPlain(fraction)}</Prov> of the vault
      </span>
    ) : undefined,
  };

  const side = (dir: "in" | "out"): PositionCardHead => ({
    id: dir === "in" ? "put-in" : "taken-out",
    label: dir === "in" ? "Put in" : "Taken out",
    labelTip:
      dir === "in"
        ? `Every amount of ${c.assetSymbol} this address put into the vault. Shares received from another address count at their worth the day they arrived.`
        : `Every amount of ${c.assetSymbol} this address took out of the vault. Shares sent to another address count at their worth the day they left.`,
    value: (
      <Suspense fallback={<Pending />}>
        <SideValue history={p.history} coords={c} assetAddress={p.assetAddress} dir={dir} />
      </Suspense>
    ),
  });

  const profit: PositionCardHead = {
    id: "profit",
    label: "Profit or loss",
    labelTip: `Worth now plus what was taken out, minus what was put in, in ${c.assetSymbol}. The percentage is of what was put in. ${capital(p.rewards)} are left out.`,
    value: (
      <Suspense fallback={<Pending />}>
        <ProfitValue history={p.history} coords={c} assetAddress={p.assetAddress} />
      </Suspense>
    ),
    sub: (
      <Suspense fallback={null}>
        <ProfitSub history={p.history} coords={c} />
      </Suspense>
    ),
  };

  return {
    surface: "detail",
    heading: "Holding summary",
    status: null,
    identity,
    heads: p.never ? [worthNow] : [side("in"), side("out"), worthNow, profit],
    counters: null,
    menu: { leading: () => <MenuRows href={p.holdingHref} />, exports: null },
    explainer: {
      // A holding that never was has nothing to explain past its one sentence.
      body: p.never ? null : (
        <Suspense fallback={null}>
          <Explanation p={p} fraction={fraction} />
        </Suspense>
      ),
    },
    learnMore: p.learnMore,
    band: p.never ? undefined : (
      <Suspense fallback={null}>
        <WorthBand history={p.history} coords={c} />
      </Suspense>
    ),
    // A stake token's own cooldown, plain: when this holder's shares can leave.
    foot:
      open && p.cooldown ? (
        <p className="mt-3 text-sm text-rb-500">
          Cooldown{" "}
          <span className="text-foreground" data-figure="holder-cooldown">
            <Prov info={p.cooldown.prov}>{p.cooldown.text}</Prov>
          </span>
        </p>
      ) : undefined,
    panel: [[], []],
  };
}

/** The plain card inside the wrapper the verifiers read. */
export function VaultHoldingPlainCard(props: VaultHoldingPlainCardProps) {
  const { coords: c } = props;
  const open = BigInt(props.shares.raw) > ZERO;
  return (
    <div
      className="mb-6"
      data-anatomy="V8"
      data-position-card={`${c.vault}:${c.holder}`}
      data-vault={c.vault}
      data-holder={c.holder}
      data-vault-family={props.family}
      data-status={open ? "live" : props.never ? "never" : "closed"}
      data-shares-raw={props.shares.raw}
      data-claim-raw={props.claim?.raw ?? ""}
      data-live-block={c.blockNumber}
      data-holder-cooldown-state={props.cooldown?.state ?? ""}
    >
      <PositionCard slots={plainSlots(props)} />
    </div>
  );
}

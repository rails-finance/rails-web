"use client";

// The MakerDAO PROTOCOL view (/makerdao/system) — the Vat's balance sheet,
// decomposed by ilk.
//
// The shipped exemplars are Aave's market roster and the Liquity family's branch
// rates + redemption queue. Neither shape survives contact with Maker, and this
// view is what's left once you ask what it could honestly assert:
//
//   • The Aave roster's spine is "utilisation drives the rate". Maker has no
//     depositors to draw from and no curve — `duty` is governance-set, Jug.base
//     is 0 — and `debt ÷ line` is a tautology wherever the DssAutoLine runs,
//     since it holds line at debt + gap. So there is no utilisation column here.
//     The ceiling gets a STATE instead, because "can more be drawn" is the real
//     question and its answer is a governance posture, not a market reading.
//   • The Liquity forks' spine is "borrowers set their rate, and the queue
//     orders by it". Maker has no redemptions and one duty per ilk that every
//     vault pays. No choice, nothing to order, no queue.
//   • Both molds also assume the rows are PEERS competing for one borrower.
//     Maker's aren't: ~94% of the debt is minted by modules no wallet can open a
//     vault in. Saying so IS the view — it's the reason /makerdao's roster is
//     thousands of vaults against a system of billions.
//
// So the three sections are the ones Maker does have: the Vat's own identity
// (checked live, exact), what mints the DAI, and every ilk on the terms
// governance set for it.
//
// Framing follows the house: present, don't rank. No score, no risk valence. The
// one red is the reconcile FAILING — a fact about this read not accounting for
// every DAI in existence, not a judgement about anyone's position.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { RatioBar } from "@/components/shared/ratio-bar";
import {
  systemDebtProv,
  globalLineProv,
  globalFillProv,
  viceProv,
  vowSurplusProv,
  vowSinProv,
  vatLiveProv,
  reconcileProv,
  ilkDebtTotalProv,
  rosterProv,
  ilkDebtProv,
  ilkShareProv,
  ilkGroupProv,
  groupTotalProv,
  groupShareProv,
  userVaultShareProv,
  ceilingProv,
  availableProv,
  systemMatProv,
  systemFeeProv,
  systemDustProv,
  systemChopProv,
  systemOsmPriceProv,
} from "@/lib/makerdao/system-provenance";
import { Stat } from "@/components/shared/stat";
import type { MakerIlkGroup } from "@/lib/makerdao/asset-catalog";
import { formatCompact, formatExact, formatNumber, formatTinyNonZero, formatUsdValue } from "@/lib/utils/format";
import type { MakerIlkRow, MakerSystemChainResponse, MakerCeilingState } from "@/lib/sources/chain/makerdao-system";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const DEBT_SYMBOL = "DAI";

// A percentage with the codebase's false-zero guard applied — a non-zero
// magnitude must never render as "0". `formatNumber` self-
// applies this, but a hand-rolled toFixed bypasses it, and this page has two
// places where it bites for real:
//   • the delisted ilks hold a wei of debt each, so their share of the system is
//     ~1e-26 — "0.0%" would say they hold nothing, when holding something is the
//     entire reason they are on the page.
//   • several wound-down ilks carry a duty a hair above 1 ray; "0.00%" would say
//     that debt is free.
const pctOf = (x: number, dp: number) => {
  const p = x * 100;
  const s = p.toFixed(dp);
  if (p !== 0 && parseFloat(s) === 0) return `${formatTinyNonZero(p)}%`;
  return `${s}%`;
};
const ratio = (x: number) => pctOf(x, 1);
const feePct = (x: number) => pctOf(x, 2);

// The same guard for a price. `formatUsdValue` is a flat two-decimal locale
// format with no guard of its own — right for a $1,928 ETH, wrong for a
// sub-cent collateral, where "$0.00" would say the collateral is worthless on a
// page whose subject is the ratio it has to hold. LSEV2-SKY-A already prices at
// $0.025 and nothing stops an ilk's OSM going lower.
const priceUsd = (x: number) => {
  const s = formatUsdValue(x);
  if (x !== 0 && parseFloat(s.replace(/[$,]/g, "")) === 0) return `$${formatTinyNonZero(x)}`;
  return s;
};

/** How the groups are titled and, more importantly, what they MEAN — the reason
 *  a 100% mat and a 0% fee on a $5bn row are not risk settings. */
const GROUP_META: Record<MakerIlkGroup, { label: string; blurb: string }> = {
  vault: {
    label: "Vault types",
    blurb:
      "The ilks a wallet can actually open a vault in: lock collateral, draw DAI, pay the fee, get liquidated if the ratio slips. These are the only rows where the liquidation ratio, the fee and the dust floor are risk settings someone chose — and they are what this explorer indexes.",
  },
  psm: {
    label: "Peg Stability Modules",
    blurb:
      "Swap DAI for a stablecoin at par, 1:1, out of inventory the module itself holds — the DAI is minted the moment someone swaps in. Nobody borrows here, so the 100% ratio and 0% fee below are not lenient settings; they are the absence of a loan to price.",
  },
  allocator: {
    label: "Allocators",
    blurb:
      "Protocol-owned credit lines. Governance grants each allocator a ceiling and it mints DAI to fund strategies it operates. The same absence of risk settings as the PSM, for the same reason: no user is on the other side.",
  },
  rwa: {
    label: "Real-world assets",
    blurb:
      "A single token stands in for an off-chain credit agreement. The price is a nominal valuation governance posts, not a market quote — which is why these figures run to eight digits against one unit of collateral.",
  },
  d3m: {
    label: "Direct deposit",
    blurb:
      "D3M modules mint DAI straight into another lending protocol to target a rate there, unwinding as that rate moves. Teleport is the cross-domain fast-withdrawal ilk.",
  },
  delisted: {
    label: "Delisted",
    blurb:
      "Wound down and dropped from the IlkRegistry — but the Vat keeps an ilk's slot forever, and each of these still carries a wei of debt nobody will ever repay, since clearing it costs more gas than it settles. They are on this page because the Vat's identity does not close without them.",
  },
};

const CEILING_LABEL: Record<MakerCeilingState, string> = {
  auto: "Auto",
  fixed: "Fixed",
  closed: "Closed",
  dormant: "Dormant",
};

/** Neutral chip — informational, never a valence. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-rb-200 px-1 py-px text-[10px] font-medium text-rb-500 dark:border-rb-700">
      {children}
    </span>
  );
}

// ── Section 1 — the Vat ──────────────────────────────────────────────────────

/** Every DAI in existence, against the one ceiling that isn't an artifact. */
function VatCard({ data }: { data: MakerSystemChainResponse }) {
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">The Vat</span>
        <span className="text-[11px] text-rb-500">
          <Prov info={vatLiveProv()}>{data.live ? "live" : "shut down"}</Prov>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {/* The unit rides in the children throughout this view, so no `symbol`
            prop — the receipts row renders display + symbol and would double
            it. `value` still carries the exact figure behind the compact one. */}
        <Stat label="DAI in existence">
          <Prov info={systemDebtProv()} value={formatExact(data.debtDai)}>
            {formatCompact(data.debtDai)} {DEBT_SYMBOL}
          </Prov>
        </Stat>
        <Stat label="Global ceiling">
          <Prov info={globalLineProv()} value={formatExact(data.lineDai)}>
            {formatCompact(data.lineDai)} {DEBT_SYMBOL}
          </Prov>
        </Stat>
      </div>

      {data.globalFill != null && (
        <div className="mt-3">
          <RatioBar fill={Math.min(1, data.globalFill)} ticks={[]} />
          <div className="mt-1.5 text-[11px] text-rb-500">
            <Prov info={globalFillProv(formatExact(data.debtDai), formatExact(data.lineDai))}>
              {ratio(data.globalFill)}
            </Prov>{" "}
            of the global ceiling drawn
          </div>
        </div>
      )}

      <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
        The Vat&apos;s internal ledger, not DAI&apos;s token supply — the ERC-20 figure is only the portion withdrawn
        through a Join. Governance sets the global ceiling directly, so unlike a per-ilk line it measures something.
      </p>
    </div>
  );
}

/** The spine: the Vat's own identity, checked live and in full. */
function ReconcileCard({ data }: { data: MakerSystemChainResponse }) {
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Every DAI accounted for</span>
        <span className="text-[11px] text-rb-500">
          <Prov
            info={rosterProv(
              data.ilks.filter((i) => i.cls != null).length,
              data.ilks.filter((i) => i.cls == null).length,
            )}
          >
            {data.ilks.length} ilks
          </Prov>
        </span>
      </div>

      <div className="mt-3 space-y-1.5 text-xs tabular-nums">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-rb-500">every ilk&apos;s debt, added up</span>
          <Prov info={ilkDebtTotalProv(data.ilks.length)} value={formatExact(data.ilkDebtTotalDai)}>
            {formatCompact(data.ilkDebtTotalDai)}
          </Prov>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-rb-500">+ uncollateralized</span>
          <Prov info={viceProv()} value={formatExact(data.viceDai)}>
            {formatCompact(data.viceDai)}
          </Prov>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-rb-200 pt-1.5 dark:border-rb-700">
          <span className="text-foreground">= DAI in existence</span>
          <Prov info={systemDebtProv()} value={formatExact(data.debtDai)} echo>
            {formatCompact(data.debtDai)}
          </Prov>
        </div>
      </div>

      <div className="mt-2.5 text-[11px] leading-relaxed">
        <Prov info={reconcileProv(data.reconciles, data.ilks.length)}>
          {data.reconciles ? (
            <span className="text-rb-500">
              Reconciles exactly — residual <span className="tabular-nums text-foreground">0</span>, checked in rad (10
              <sup>−45</sup> DAI) before anything is rounded.
            </span>
          ) : (
            <span className="text-red-500">
              Does not reconcile — {formatNumber(Math.abs(data.residualDai))} {DEBT_SYMBOL} of the Vat&apos;s total is
              unaccounted for below. An ilk carrying debt is missing from this read.
            </span>
          )}
        </Prov>
      </div>
    </div>
  );
}

/** Where the uncollateralized DAI is charged. */
function VowCard({ data }: { data: MakerSystemChainResponse }) {
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <span className="text-xs font-semibold text-foreground">The Vow</span>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat label="Surplus buffer">
          <Prov info={vowSurplusProv()} value={formatExact(data.vowSurplusDai)}>
            {formatCompact(data.vowSurplusDai)} {DEBT_SYMBOL}
          </Prov>
        </Stat>
        <Stat label="Sin charged">
          <Prov info={vowSinProv()} value={formatExact(data.vowSinDai)}>
            {formatCompact(data.vowSinDai)} {DEBT_SYMBOL}
          </Prov>
        </Stat>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
        Every DAI of the uncollateralized total is charged here as <code>sin</code> in the same call that mints it — a
        debt the protocol owes itself, from liquidation shortfalls and the savings rate&apos;s accrual. The surplus
        buffer, built from stability fees and penalties, is what heals it.
      </p>
    </div>
  );
}

// ── Section 2 — what mints the DAI ───────────────────────────────────────────

function CompositionBar({ data }: { data: MakerSystemChainResponse }) {
  // Neutral throughout: this is a composition, not a ranking. The vault segment
  // reads as the app's interaction blue only because it's the one that links.
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-rb-100 dark:bg-rb-800">
      {data.groups
        .filter((g) => (g.share ?? 0) > 0)
        .map((g) => (
          <div
            key={g.group}
            className={g.group === "vault" ? "bg-blue-500" : "bg-rb-300 dark:bg-rb-600"}
            style={{ width: `${(g.share ?? 0) * 100}%` }}
            title={`${GROUP_META[g.group].label} — ${ratio(g.share ?? 0)}`}
          />
        ))}
    </div>
  );
}

// ── Section 3 — the ilk roster ───────────────────────────────────────────────

function IlkRow({ row }: { row: MakerIlkRow }) {
  const showPrice = row.priceUsd != null && (row.group === "vault" || row.group === "rwa");

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-4 py-2.5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem_5rem] sm:items-baseline">
      {/* Ilk */}
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <div className="flex items-baseline gap-1.5">
          {row.userVaultType ? (
            // `ilk`, singular — the listing dimension's URL param (its `id` is
            // "ilks" and the API client's param is "ilks", but neither is what
            // decodeListFilters reads). A wrong param doesn't error: the filter
            // is simply ignored and the reader lands on the unfiltered roster
            // believing it's this ilk's.
            <Link
              href={`/ethereum/makerdao?ilk=${encodeURIComponent(row.ilk)}`}
              className="truncate text-xs text-blue-500 hover:underline"
            >
              {row.ilk}
            </Link>
          ) : (
            <Prov info={ilkGroupProv(row.ilk, row.cls)}>
              <span className="truncate text-xs text-foreground">{row.ilk}</span>
            </Prov>
          )}
          <span className="shrink-0 text-[11px] text-rb-500">{row.collateralSymbol}</span>
        </div>
        {showPrice && (
          <div className="mt-0.5 text-[11px] tabular-nums text-rb-500">
            <Prov info={systemOsmPriceProv(row.ilk, row.collateralSymbol)} value={formatExact(row.priceUsd as number)}>
              {priceUsd(row.priceUsd as number)}
            </Prov>
          </div>
        )}
      </div>

      {/* Debt */}
      <div>
        <div className="text-xs tabular-nums text-foreground">
          <Prov info={ilkDebtProv(row.ilk, formatExact(row.art), row.rate)} value={formatExact(row.debtDai)}>
            {formatCompact(row.debtDai)}
          </Prov>
        </div>
        {row.debtShare != null && row.debtShare > 0 && (
          <div className="mt-0.5 text-[11px] tabular-nums text-rb-500">
            <Prov info={ilkShareProv(row.ilk)}>{ratio(row.debtShare)}</Prov>
          </div>
        )}
      </div>

      {/* Ceiling */}
      <div>
        <Prov info={ceilingProv(row.ilk, row.ceilingState)}>
          <Chip>{CEILING_LABEL[row.ceilingState]}</Chip>
        </Prov>
        {row.ceilingState !== "dormant" && row.ceilingState !== "closed" && (
          <div className="mt-0.5 text-[11px] tabular-nums text-rb-500">
            <Prov info={availableProv(row.ilk, formatExact(row.lineDai), formatExact(row.debtDai))}>
              {formatCompact(row.availableDai)}
            </Prov>{" "}
            drawable
            {row.maxLineDai != null && (
              <>
                {" · "}
                <Prov info={ceilingProv(row.ilk, "auto")} echo>
                  <span>up to {formatCompact(row.maxLineDai)}</span>
                </Prov>
              </>
            )}
          </div>
        )}
      </div>

      {/* Fee */}
      <div className="text-xs tabular-nums text-foreground">
        {row.stabilityFeeApr != null ? (
          <Prov info={systemFeeProv(row.ilk)} value={formatExact(row.stabilityFeeApr * 100)}>
            {feePct(row.stabilityFeeApr)}
          </Prov>
        ) : (
          <span className="text-rb-400">—</span>
        )}
      </div>

      {/* Liquidation — mat over chop */}
      <div>
        <div className="text-xs tabular-nums text-foreground">
          {row.matRatio != null ? (
            <Prov info={systemMatProv(row.ilk)} value={formatExact(row.matRatio * 100)}>
              {ratio(row.matRatio)}
            </Prov>
          ) : (
            <span className="text-rb-400">—</span>
          )}
        </div>
        {row.chop != null && (
          <div className="mt-0.5 text-[11px] tabular-nums text-rb-500">
            <Prov info={systemChopProv(row.ilk)} value={formatExact((row.chop - 1) * 100)}>
              +{feePct(row.chop - 1)}
            </Prov>{" "}
            penalty
          </div>
        )}
        {row.dustDai > 0 && (
          <div className="mt-0.5 text-[11px] tabular-nums text-rb-500">
            <Prov info={systemDustProv(row.ilk)} value={formatExact(row.dustDai)}>
              {formatCompact(row.dustDai)}
            </Prov>{" "}
            floor
          </div>
        )}
      </div>
    </div>
  );
}

function GroupSection({ data, group }: { data: MakerSystemChainResponse; group: MakerIlkGroup }) {
  const meta = GROUP_META[group];
  const total = data.groups.find((g) => g.group === group);
  const rows = useMemo(() => data.ilks.filter((r) => r.group === group), [data.ilks, group]);
  if (!total || rows.length === 0) return null;

  return (
    <div className="rounded-xl bg-raised">
      <div className="border-b border-rb-200 px-4 py-3 dark:border-rb-700">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold text-foreground">{meta.label}</span>
          <span className="text-[11px] tabular-nums text-rb-500">
            <Prov info={groupTotalProv(meta.label.toLowerCase(), total.ilkCount)} value={formatExact(total.debtDai)}>
              {formatCompact(total.debtDai)} {DEBT_SYMBOL}
            </Prov>
            {total.share != null && (
              <span className="ml-1.5 text-rb-400">
                {/* Echo — the composition legend above owns this receipt. */}
                <Prov info={groupShareProv(meta.label.toLowerCase())} value={formatExact(total.share * 100)} echo>
                  {ratio(total.share)}
                </Prov>
              </span>
            )}
          </span>
        </div>
        <p className="mt-1.5 max-w-3xl text-[11px] leading-relaxed text-rb-500">{meta.blurb}</p>
      </div>

      {/* Column headers — desktop only; the mobile rows carry their own shape. */}
      <div className="hidden border-b border-rb-200 px-4 py-1.5 text-[10px] uppercase tracking-wider text-rb-400 sm:grid sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem_5rem] dark:border-rb-700">
        <span>Ilk</span>
        <span>Debt</span>
        <span>Ceiling</span>
        <span>Fee</span>
        <span>Liquidation</span>
      </div>

      <div className="divide-y divide-rb-200 dark:divide-rb-700">
        {rows.map((r) => (
          <IlkRow key={r.ilk} row={r} />
        ))}
      </div>
    </div>
  );
}

// ── The view ─────────────────────────────────────────────────────────────────

const GROUPS: MakerIlkGroup[] = ["vault", "psm", "allocator", "rwa", "d3m", "delisted"];

export function MakerSystemView({ data }: { data: MakerSystemChainResponse }) {
  const registry = useReceiptRegistry();
  const [showAll, setShowAll] = useState(false);

  if (data.chainStale) {
    return (
      <div className="py-12 text-center text-rb-500">
        <p className="mb-1">Couldn&apos;t read MakerDAO&apos;s system state from chain.</p>
        <p className="text-sm">
          This view is a live contract read with no cached fallback — rather than show stale figures, it shows nothing.
          Try again shortly.
        </p>
      </div>
    );
  }

  const vaultIlkCount = data.ilks.filter((r) => r.userVaultType).length;
  // The vault types are the point; the rest is the context that makes them
  // small. Show the first group and let the reader ask for the plumbing.
  const visible = showAll ? GROUPS : (["vault"] as MakerIlkGroup[]);

  return (
    <ProvReceiptsScope registry={registry}>
      <section>
        <h2 className="text-sm font-semibold text-foreground">The system</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <VatCard data={data} />
          <ReconcileCard data={data} />
          <VowCard data={data} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">What mints it</h2>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-rb-500">
          Maker is not one market — it is a set of isolated ilks that mint one currency against a shared ceiling. Most
          of them are not a place a wallet can borrow.
        </p>

        <div className="mt-3 rounded-xl bg-raised px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-semibold text-foreground">
              {data.userVaultShare != null && (
                <Prov info={userVaultShareProv(vaultIlkCount)} value={formatExact((data.userVaultShare ?? 0) * 100)}>
                  {ratio(data.userVaultShare)}
                </Prov>
              )}{" "}
              of Maker&apos;s debt is a user&apos;s vault
            </span>
            <span className="text-[11px] tabular-nums text-rb-500">
              <Prov info={groupTotalProv("vault types", vaultIlkCount)} value={formatExact(data.userVaultDebtDai)} echo>
                {formatCompact(data.userVaultDebtDai)} {DEBT_SYMBOL}
              </Prov>
            </span>
          </div>

          <div className="mt-3">
            <CompositionBar data={data} />
          </div>

          {/* The legend is where each group's share is FIRST stated, so these are
              the primary receipts; the group headers below echo them. */}
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
            {data.groups.map((g) => (
              <span key={g.group} className="inline-flex items-baseline gap-1.5 text-[11px] text-rb-500">
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 translate-y-px rounded-full ${
                    g.group === "vault" ? "bg-blue-500" : "bg-rb-300 dark:bg-rb-600"
                  }`}
                />
                {GROUP_META[g.group].label}
                <span className="tabular-nums text-rb-400">
                  {g.share != null ? (
                    <Prov
                      info={groupShareProv(GROUP_META[g.group].label.toLowerCase())}
                      value={formatExact(g.share * 100)}
                    >
                      {ratio(g.share)}
                    </Prov>
                  ) : (
                    "—"
                  )}
                </span>
              </span>
            ))}
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-rb-500">
            The rest is minted by modules — the Peg Stability Module swapping DAI for stablecoins it holds, the
            Allocators funding protocol-owned strategies. Those are Maker positions, but they are nobody&apos;s
            position: there is no owner, no health, nothing to explore. So{" "}
            <Link href="/ethereum/makerdao" className="text-blue-500 hover:underline">
              the vault roster
            </Link>{" "}
            covers the {vaultIlkCount} ilks above the line and states the rest here.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">The ilks</h2>
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="text-[11px] text-blue-500 hover:underline"
          >
            {showAll ? "Show vault types only" : `Show all ${data.ilks.length} ilks`}
          </button>
        </div>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-rb-500">
          Every ilk on the terms governance set for it. There is no utilisation column: Maker mints DAI rather than
          lending it out, so nothing here responds to how much is drawn — and where the DssAutoLine manages the ceiling
          it holds <code>line</code> just above current debt, which would make <code>debt ÷ line</code> a restatement of
          the gap rather than a fact about the ilk.
        </p>

        <div className="mt-3 space-y-3">
          {visible.map((g) => (
            <GroupSection key={g} data={data} group={g} />
          ))}
        </div>
      </section>

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}

/** The header's block stamp — rendered by the page, beside the title. */
export function MakerSystemStamp({ data }: { data: MakerSystemChainResponse }) {
  if (data.chainStale || data.blockNumber === 0) return null;
  return (
    <a
      href={explorerUrl(MAINNET_CHAIN_ID, "block", data.blockNumber)}
      target="_blank"
      rel="noopener noreferrer"
      className="link-external mt-2 inline-block text-[11px] text-rb-500"
    >
      Chain snapshot · block {data.blockNumber.toLocaleString("en-US")}
    </a>
  );
}

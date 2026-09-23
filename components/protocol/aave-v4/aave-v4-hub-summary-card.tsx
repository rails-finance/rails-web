"use client";

// One hub's summary card — the top "band" of the /aave-v4/hubs surface. Hub-
// grain only: identity, size, supply composition and spoke membership. The
// per-asset (asset × hub) detail lives in the cross-hub table below, so this
// card deliberately has NO asset list (the table does that job better — filter
// Hub → Core to see one hub's lines). The band is static — filters scope the
// table only.
//
// Layout: the card is a CSS subgrid spanning four parent row tracks (identity ·
// size · supply mix · spokes), so the corresponding section in every hub card
// sits on the same baseline and the band scans across as cleanly as it scans
// down. See the parent grid in aave-v4-hub-views.tsx.
//
// Strictly descriptive — present, don't rank (see aave-v4-hub-
// comparison.md). The hub name links in the app's interaction color (navigation,
// not a verdict). Supply-mix bars carry per-class grouping color (a grouping
// aid, never a risk valence — see ASSET_CLASS_COLOR).

import Link from "next/link";
import { fmtUsd } from "@/lib/aave-v4/format";
import { hubSummaryText, hubSupplyWeightedLt, type HubView } from "@/lib/aave-v4/hub-view";
import { ASSET_CLASS_COLOR } from "@/lib/aave-v4/asset-class";
import { Prov } from "@/components/shared/provenance";
import { hubTotalValueProv, hubWeightedLtProv, type HubProvCoords } from "@/lib/aave-v4/hub-provenance";

const LINK = "text-blue-500 hover:underline";

// Spoke pill — an obvious, tappable link into the listing filtered to that
// spoke. Full set always shown (never truncated): they wrap.
const SPOKE_PILL =
  "inline-flex items-center gap-1 rounded-full border border-background bg-background px-2 py-0.5 text-[12px] " +
  "text-foreground/80 transition-colors hover:border-blue-500/50 hover:text-blue-500";

/** Listing URL filtered to one hub (`/ethereum/aave-v4?hubs=core`). `hub` is already the
 *  lowercase hub slug. */
function listingHref(hub: string): string {
  return `/ethereum/aave-v4?hubs=${hub}`;
}

// Composition: one row per asset class — label · proportional bar · share. Bar
// fill is the class grouping color; a row chart keeps the small classes (2–3%)
// legible and labelled, where a single stacked bar buried them in slivers.
function CompositionBar({ composition }: { composition: HubView["composition"] }) {
  if (composition.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {composition.map((c) => (
        <div key={c.cls} className="flex items-center gap-2" title={`${c.pct}% ${c.label}`}>
          <span className="w-28 shrink-0 truncate text-[12px] text-rb-500">{c.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/5">
            <div
              className="h-full rounded-full"
              style={{ width: `${c.pct}%`, backgroundColor: ASSET_CLASS_COLOR[c.cls] }}
            />
          </div>
          {/* The share is arithmetic over the per-asset supplied USD already
              traced in the table below (Σ this class ÷ the hub total) — a
              same-surface re-derivation, so it is exempt rather than a receipt
              that only re-states rows already present. */}
          <span data-prov-exempt="" className="w-8 shrink-0 text-right tabular-nums text-[12px] text-rb-500">
            {c.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function AaveV4HubSummaryCard({ hub, block }: { hub: HubView; block?: number }) {
  const supplied = fmtUsd(hub.suppliedUsd);
  const borrowed = fmtUsd(hub.borrowedUsd);
  const summary = hubSummaryText(hub);
  const weightedLt = hubSupplyWeightedLt(hub);
  const coords: HubProvCoords = { blockNumber: block, hubLabel: hub.label };

  return (
    <div className="grid grid-rows-[auto_auto_auto_auto_auto] gap-y-4 rounded-lg bg-raised p-5 lg:row-span-5 lg:grid-rows-subgrid">
      {/* 1 — Identity. The hub name drills into this hub's positions. */}
      <div>
        <Link
          href={listingHref(hub.hub)}
          className="text-base font-semibold text-foreground transition-colors hover:text-blue-500"
          title={`View positions in ${hub.label}`}
        >
          {hub.label}
        </Link>
        <p className="mt-2 text-[13px] leading-relaxed text-rb-500">{hub.purpose}</p>
      </div>

      {/* 2 — Size */}
      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-rb-500">Supplied</dt>
          <dd className="tabular-nums text-base font-semibold text-foreground" title={supplied.title}>
            <Prov info={hubTotalValueProv("supplied", coords)}>{supplied.display}</Prov>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-rb-500">Borrowed</dt>
          <dd className="tabular-nums text-base font-semibold text-foreground" title={borrowed.title}>
            <Prov info={hubTotalValueProv("borrowed", coords)}>{borrowed.display}</Prov>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-rb-500">Positions</dt>
          {/* Active-position count — an indexed tally, not one of the credit-line
              money figures the receipts trace and not arithmetic over them, so
              it is stated (exempt), like the pilots' roster counts. */}
          <dd data-prov-exempt="" className="tabular-nums text-base font-semibold text-foreground">
            {hub.positionCount > 0 ? (
              <Link href={listingHref(hub.hub)} className={LINK} title={`View positions in ${hub.label}`}>
                {hub.positionCount.toLocaleString("en-US")}
              </Link>
            ) : (
              hub.positionCount.toLocaleString("en-US")
            )}
          </dd>
        </div>
      </dl>

      {/* 3 — Supply-mix bars (own grid row so the band aligns even when a hub
          has fewer classes). */}
      <div>
        {hub.composition.length > 0 && (
          <>
            <div className="mb-1.5 text-[11px] uppercase tracking-wider text-rb-500">Supply mix</div>
            <CompositionBar composition={hub.composition} />
          </>
        )}
      </div>

      {/* 4 — Supply-mix summary sentence. Its own row so the three hubs'
          summaries sit on the same baseline regardless of how tall the bars or
          how long the sentence ran above. */}
      <div>
        {(summary || weightedLt) && (
          <p className="text-[12px] leading-relaxed text-rb-500">
            {summary}
            {weightedLt && (
              <>
                {summary ? " " : ""}Supply-weighted LT{" "}
                <Prov info={hubWeightedLtProv(coords)}>{weightedLt.lt.toFixed(2)}</Prov>.
              </>
            )}
          </p>
        )}
      </div>

      {/* 5 — Spokes. Each links into the listing filtered to that spoke
          (?spokes=<slug>); no hub param (a cross-hub spoke would otherwise be
          ANDed out). Full set, wrapping — never truncated. The "Spoke(s)" label
          leads the row inline. */}
      <div className="self-end">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] uppercase tracking-wider text-rb-500">
            {hub.spokes.length === 1 ? "Spoke" : "Spokes"}
          </span>
          {hub.spokes.map((s) => (
            <Link
              key={s.slug}
              href={`/ethereum/aave-v4?spokes=${s.slug}`}
              className={SPOKE_PILL}
              title={`View ${s.name} positions`}
            >
              {s.name}
              {s.halted && <span className="text-[10px] uppercase tracking-wide text-rb-500">halted</span>}
            </Link>
          ))}
        </div>

        {hub.positionCount > 0 && (
          <Link
            href={listingHref(hub.hub)}
            className={`mt-3 inline-flex items-center gap-1 text-[13px] font-medium ${LINK}`}
          >
            View all {hub.positionCount.toLocaleString("en-US")} {hub.label} positions
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

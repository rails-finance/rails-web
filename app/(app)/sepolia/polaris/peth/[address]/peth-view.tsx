"use client";

// A Polaris pETH account's page (ui-jobs 865), on the redeemer page's shell
// (app/(app)/ethereum/liquity-v2/redeemer/[address]/redeemer-view.tsx): the
// card (P1) with the address's figures, the places its pETH sits (C24·polaris)
// in the Lifetime flows slot, then the shared timeline (P3), one row per
// transaction, newest first, with the Type filter by effect and kind. Past the
// first read the timeline closes on a boundary card and the cut notice reads
// the rest on request; the card's sums cover every row. Under `event/<id>` the
// page draws one row on the shared event page (P4): the timeline alone, in its
// pinned mode.
//
// Each row's Explanation links the place its tokens went to or came from, and
// each place in the box links its rows: "N events" narrows the timeline to
// that place on the Place axis (`?hidePlaces=`, every other place hidden), on
// the page without a reload (ui-jobs 872).
//
// The answer can lack either half. While the ledger lane reads the history,
// the ledger's figures and rows are absent and the head reads stand; with no
// chain read the head figures are absent and the stored ledger stands. Each
// absent figure says which.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { CHAIN_TRUTH_DISPLAY_ITEMS, TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { boundaryFromLimit } from "@/lib/shared/timeline-boundary";
import { PETH_HEAVY, PETH_UNREAD, PolarisPethCard } from "@/components/protocol/polaris/polaris-peth-card";
import { PolarisPethPlaces, type PethPlaceEvents } from "@/components/protocol/polaris/polaris-peth-places";
import { PETH_NAMES, PolarisPethEventCard } from "@/components/protocol/polaris/polaris-peth-event-card";
import { PETH, POLARIS_VENUES } from "@/lib/polaris/asset-catalog";
import {
  pethAmountText,
  pethHeadlines,
  pethHeadRead,
  pethLedgerGap,
  pethLedgerUnchecked,
  pethScannedTo,
  pethPlaceKey,
  pethPlaceName,
  pethPlaceView,
  pethPlaces,
  pethRowId,
  pethTimelineEvent,
  units,
  type PethHeadlines,
} from "@/lib/polaris/peth-ledger";
import { pethHeadProv } from "@/lib/polaris/peth-provenance";
import { PETH_PLACE_NAMES } from "@/lib/polaris/peth-place-links";
import { polarisPethAccountHref } from "@/lib/polaris/routes";
import { polarisPethEventPage } from "@/lib/polaris/peth-explorer";
import { pethStoredAsOf } from "@/lib/polaris/peth-as-of";
import { isPethRefusal, PETH_FIRST_READ, PETH_OLDER_READ, type PethRefusal } from "@/lib/polaris/peth-page-data-shared";
import {
  PolarisPethHttpError,
  readPolarisPeth,
  type PethLedgerRow,
  type PolarisPethResponse,
} from "@/lib/sources/api/polaris-peth";

/** The sentence a refused address reads, by what the route said. */
export function pethRefusalText(r: PethRefusal): string {
  const said = `${r.code ?? ""} ${r.reason ?? ""}`.toLowerCase();
  if (/heavy/.test(said)) return PETH_HEAVY;
  if (/protocol|contract/.test(said))
    return "This address is a Polaris contract. Its pETH belongs to the protocol, so it has no account page.";
  return r.reason ? `The index refused this address: ${r.reason}` : "The index refused this address.";
}

const strong = (s: string) => <span className="font-semibold text-foreground">{s}</span>;

function PethExplanation({
  f,
  ledgerGap,
  headRead,
  unchecked,
}: {
  f: PethHeadlines;
  ledgerGap: "reading" | "too_heavy" | null;
  headRead: boolean;
  /** The ledger is served with its freshness unchecked. */
  unchecked: boolean;
}) {
  const eth = (raw: bigint | null) => (raw == null ? null : `${pethAmountText(raw)} ETH`);
  const items: ReactNode[] = [];
  if (f.pethHeld != null) items.push(<>This address holds {strong(`${pethAmountText(f.pethHeld)} pETH`)} now.</>);
  else items.push(<>The pETH this address holds now was not read.</>);
  if (f.atSpot != null && f.atFloor != null)
    items.push(
      <>
        That holding is worth {strong(eth(f.atSpot)!)} at spot and {strong(eth(f.atFloor)!)} at the floor. The gap is
        the downside a holder carries.
      </>,
    );
  if (ledgerGap == null) {
    if (f.ethIn != null) items.push(<>This address paid {strong(eth(f.ethIn)!)} for pETH and fpETH.</>);
    if (f.ethOut != null) items.push(<>This address received {strong(eth(f.ethOut)!)} for pETH and fpETH.</>);
    if (f.curveFees != null)
      items.push(
        <>
          The bonding curve took {strong(`${pethAmountText(f.curveFees)} pETH`)} in fees on this address&rsquo;s trades.
        </>,
      );
    items.push(<>PSM mints and POLAR conversions carry a valuation on their rows, which ETH out does not count.</>);
    items.push(<>pETH received by plain transfer counts in pETH held and in neither ETH figure.</>);
  } else if (ledgerGap === "too_heavy") {
    items.push(<>{PETH_HEAVY}</>);
  } else {
    items.push(
      <>The history of this address is still being read, so ETH in, ETH out and the fees are not stated yet.</>,
    );
  }
  if (ledgerGap == null && unchecked)
    items.push(<>The history may stop short of this address&rsquo;s latest transactions.</>);
  if (!headRead) items.push(<>{PETH_UNREAD.head}</>);
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-rb-500">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export default function PethView({
  address,
  initial,
}: {
  address: string;
  initial: PolarisPethResponse | PethRefusal | null;
}) {
  const [data, setData] = useState<PolarisPethResponse | null>(isPethRefusal(initial) ? null : initial);
  const [refused, setRefused] = useState<PethRefusal | null>(isPethRefusal(initial) ? initial : null);
  const [failed, setFailed] = useState(false);
  // The route answers 404 (no active deployment) or 503 (a deployment column
  // missing) where the deployment is not set up for this page: a reload does
  // not change that.
  const [notSetUp, setNotSetUp] = useState(false);
  const pinnedId = useParams<{ eventId?: string }>()?.eventId;
  const onEventPage = pinnedId != null;

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    readPolarisPeth(address, { limit: String(PETH_FIRST_READ) })
      .then((d) => !cancelled && setData(d))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof PolarisPethHttpError && (err.status === 404 || err.status === 503)) setNotSetUp(true);
        else if (err instanceof PolarisPethHttpError && err.status >= 400 && err.status < 500)
          setRefused({ refused: true, status: err.status, reason: err.reason, code: err.code });
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [initial, address]);

  // The rows past the first read, on the cut notice's "Load the older
  // events": pages of PETH_OLDER_READ (the route's most), newest first, read
  // on while a page comes back full. A row landing meanwhile shifts the pages
  // down, so a page can repeat a row; the list keeps each transaction once.
  const [older, setOlder] = useState<PethLedgerRow[]>([]);
  const [olderRead, setOlderRead] = useState<"idle" | "loading" | "failed">("idle");
  const reading = useRef(false);
  const loadRest = async () => {
    if (!data?.rows || reading.current) return;
    reading.current = true;
    setOlderRead("loading");
    const got: PethLedgerRow[] = [];
    try {
      for (let offset = data.rows.length; ; offset += PETH_OLDER_READ) {
        const page = await readPolarisPeth(address, { limit: String(PETH_OLDER_READ), offset: String(offset) });
        got.push(...(page.rows ?? []));
        if ((page.rows ?? []).length < PETH_OLDER_READ) break;
      }
      setOlder(got);
      setOlderRead("idle");
    } catch {
      setOlderRead("failed");
    } finally {
      reading.current = false;
    }
  };

  // The event page's row where the reads above do not hold it (past the
  // first read, or an address too heavy to list): read alone by `tx`. While
  // it runs the timeline draws a skeleton; a failed read says so; a read
  // with no row leaves the not-found notice.
  const [pinned, setPinned] = useState<PethLedgerRow | null>(null);
  const [pinnedRead, setPinnedRead] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const pinnedTx = pinnedId ? decodeURIComponent(pinnedId).toLowerCase() : null;
  const pinnedLoaded = pinnedTx == null || [...(data?.rows ?? []), ...older].some((r) => pethRowId(r) === pinnedTx);
  useEffect(() => {
    if (!data || pinnedLoaded || !pinnedTx || !/^0x[0-9a-f]{64}$/.test(pinnedTx)) return;
    let cancelled = false;
    setPinnedRead("loading");
    readPolarisPeth(address, { tx: pinnedTx })
      .then((d) => {
        if (cancelled) return;
        setPinned(d.rows?.[0] ?? null);
        setPinnedRead("done");
      })
      .catch(() => !cancelled && setPinnedRead("failed"));
    return () => {
      cancelled = true;
    };
  }, [data, pinnedLoaded, pinnedTx, address]);

  const rows = data?.rows;
  const listed = useMemo(() => {
    const seen = new Set<string>();
    return [...(rows ?? []), ...older, ...(pinned ? [pinned] : [])]
      .filter((r) => {
        const id = pethRowId(r);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .reverse();
  }, [rows, older, pinned]);
  const rowById = useMemo(() => new Map(listed.map((r) => [pethRowId(r), r])), [listed]);
  const events = useMemo(
    () => listed.map((r) => pethTimelineEvent(r, PETH_NAMES, POLARIS_VENUES, PETH_PLACE_NAMES)),
    [listed],
  );
  const total = data?.total_rows ?? listed.length;
  const olderCount = Math.max(0, total - listed.length);

  const tl = useTimelineEvents(events, {
    storageKey: `polaris-peth-${address}`,
    protocolKey: "polaris-peth",
    olderCount,
  });
  const boundary = useMemo(() => {
    const oldest = tl.sortedEvents[0];
    if (olderCount === 0 || !oldest) return null;
    return boundaryFromLimit({
      total,
      listed: listed.length,
      cutBlock: oldest.blockNumber,
      cutAt: oldest.timestamp,
      state: null,
    });
  }, [olderCount, total, listed.length, tl.sortedEvents]);

  // A place's "N events": its rows over the whole ledger, and the timeline
  // narrowed to it by hiding every other place of the whole ledger and the
  // rows with none (pethPlaceView). A place with rows past those loaded
  // reads the older events first; the cut notice shows the read.
  const placeCounts = data?.place_counts;
  const placeOptions = tl.placeOptions;
  const hidePlacesExactly = tl.hidePlacesExactly;
  const loadRestRef = useRef(loadRest);
  loadRestRef.current = loadRest;
  const placeEvents = useMemo<PethPlaceEvents>(
    () => (match) => {
      const hit = placeCounts?.find((c) => match(c.place));
      if (!hit) return null;
      const key = pethPlaceKey(hit.place);
      const loaded = placeOptions.find((o) => o.key === key)?.count ?? 0;
      const view = pethPlaceView(placeCounts ?? [], key, loaded);
      if (!view) return null;
      const q = new URLSearchParams({ hidePlaces: view.hide.join(",") }).toString();
      return {
        rows: view.rows,
        name: pethPlaceName(hit.place, PETH_PLACE_NAMES),
        href: `${polarisPethAccountHref(address)}?${q}#peth-timeline`,
        show: () => {
          hidePlacesExactly(view.hide);
          if (view.needsOlder) void loadRestRef.current();
          document.getElementById("peth-timeline")?.scrollIntoView({ block: "start" });
        },
      };
    },
    [placeCounts, placeOptions, hidePlacesExactly, address],
  );

  const figures = useMemo(() => (data ? pethHeadlines(data) : null), [data]);
  const places = useMemo(() => (data ? pethPlaces(data) : null), [data]);

  if (refused)
    return (
      <div className="py-8 space-y-6">
        <DetailTopRow session="polaris" wallet={address} owner={{ wallet: address, pending: false }} tools={false} />
        <p className="text-sm text-rb-500" data-peth-refused={refused.code ?? refused.status}>
          {pethRefusalText(refused)}
        </p>
      </div>
    );
  if (notSetUp)
    return (
      <div className="py-8 text-sm text-rb-500" data-peth-not-set-up="">
        Polaris on Sepolia is not set up for pETH accounts yet.
      </div>
    );
  if (!data && !failed) return <DetailBodySkeleton />;
  if (!data || !figures || !places)
    return (
      <div className="py-8 text-sm text-rb-500">The index did not answer for this address. Reload to try again.</div>
    );

  const ledgerGap = pethLedgerGap(data);
  const headRead = pethHeadRead(data);
  const headBlock = data.head?.block ?? null;
  const scannedTo = pethScannedTo(data);
  const unchecked = pethLedgerUnchecked(data);
  const newest = listed.length > 0 ? Number(listed[listed.length - 1].block_timestamp ?? 0) : null;
  const firstAt = olderCount === 0 && listed.length > 0 ? Number(listed[0].block_timestamp ?? 0) : null;

  const spot = figures.spot != null ? units(figures.spot) : null;
  const stripAssets: LatestPriceAsset[] =
    spot != null && spot > 0
      ? [
          {
            symbol: PETH.symbol,
            address: PETH.address,
            price: spot,
            unit: "ETH",
            label: `${PETH.symbol} at spot`,
            triggerLabel: PETH.symbol,
            info: pethHeadProv("spot", headBlock),
          },
        ]
      : [];

  return (
    <div className="py-8 space-y-6">
      {/* The wallet heading under Back (H13), as the Trove page draws it: the
          address is the heading, so the card leaves it out. */}
      <DetailTopRow
        session="polaris"
        wallet={address}
        owner={{ wallet: address, pending: false }}
        assets={stripAssets}
        tools={false}
        card
      />
      {!onEventPage && (
        <>
          <PolarisPethCard
            address={address}
            figures={figures}
            ledgerGap={ledgerGap}
            headRead={headRead}
            scannedTo={scannedTo}
            unchecked={unchecked}
            headBlock={headBlock}
            lastAt={newest}
            explanation={
              <PethExplanation f={figures} ledgerGap={ledgerGap} headRead={headRead} unchecked={unchecked} />
            }
          />
          <PolarisPethPlaces
            places={places}
            headRead={headRead}
            headBlock={headBlock}
            storedAsOf={pethStoredAsOf(data)}
            events={placeEvents}
          />
        </>
      )}
      <div id="peth-timeline" className="scroll-mt-4">
        <ChainTruthTimeline
          persistKeyPrefix="polaris-peth"
          pinnedRead={
            pinnedTx && !pinnedLoaded && !pinned && /^0x[0-9a-f]{64}$/.test(pinnedTx)
              ? pinnedRead === "failed"
                ? "failed"
                : pinnedRead === "done"
                  ? undefined
                  : "loading"
              : undefined
          }
          closed={false}
          tl={tl}
          boundary={boundary}
          loadOlder={olderCount > 0 ? { state: olderRead, load: () => void loadRest() } : undefined}
          displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
          emptyLabel={
            ledgerGap === "too_heavy"
              ? PETH_HEAVY
              : ledgerGap === "reading"
                ? "The history of this address is still being read"
                : "No pETH, fpETH or vpETH transactions recorded for this address"
          }
          toolbarLeading={
            <TimelineActivityHeader events={events} closed={false} firstAt={firstAt} tenurePending={firstAt == null} />
          }
          eventPage={(slot) => polarisPethEventPage({ ...slot, address, row: rowById.get(slot.event.id) })}
          renderCard={(event, meta) => {
            const r = rowById.get(event.id);
            return r ? <PolarisPethEventCard row={r} isLast={meta.isLast} eventNumber={meta.eventNumber} /> : null;
          }}
        />
      </div>
      <ProvInspectorLayer />
    </div>
  );
}

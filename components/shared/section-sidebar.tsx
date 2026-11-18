"use client";

// The position card's sidebar carried through a detail page's sections (rails-ops
// TO-DO-position-card 427; anatomy P2.1, P3.1): from md a lozenge the card's
// width (40px), round at both ends, in the protocol's brand hue at the
// section's left, bare (no mark, name or glyph), with the section 8px from it
// as the card's body is (ui-jobs 729); below md the card's 12px lozenge, 6px
// from the section.
// Each section keeps its box (the timeline's is drawn in chain-truth-timeline.tsx)
// and content. Off the explorers (no roster entry for the page) it draws
// nothing and adds no wrapper.
//
// The timeline's bar (`data-card-sidebar="timeline"`) is a positioned element
// spanning the section's height, with the section's rows inside the same
// positioned frame (`data-card-sidebar-frame`), so a row's top measured against
// the bar's places anything hung on the bar beside that row.
//
// ── Whose bar a row stands beside (anatomy P3.1.1, P3.1.2) ──────────────────
// The bar beside a row is the owner of the contract the row's transaction
// entered: its `to`, or where `to` is the position's own account or an account
// kind (a Safe, a DSProxy, the ERC-4337 EntryPoint, an EIP-7702 self-call) the
// first contract that account called (`entry.contract`, read by the server
// from the transaction's input, lib/shared/tx-entry.ts). A card declares it
// with `useTimelineEntry`; where the registry or `bar-owners.ts` names a
// product for that contract (Zerion's router, DeFi Saver's recipe executor),
// the row's stretch of the bar takes the product's hue and, from md, its mark
// at the stretch's top, which carries the receipt (lib/shared/bar-provenance.ts).
// Every other row, and every row whose entry is unknown, stands beside the
// protocol's bar. Adjacent rows with the same subject join into one stretch;
// on each side of a stretch the page's background shows for `BREAK` (8px, a
// row gap), so the bar reads as broken there, and every segment of the bar,
// stretches and the protocol's bar between them, is a lozenge, all four
// corners rounded at half the bar's width (20px from md, 6px below). The protocol's bar is
// one span, so its cut ends are carved by
// inverted-corner strips in the background colour, skipped between two
// adjacent stretches. Each stretch is
// measured against this frame: the row's box (`data-event-id`) from its top to
// its bottom. Below md the stretch carries no mark.
//
// "Not yours" (P3.1.2): a row whose transaction the person did not send takes
// a small pink dot on the bar level with its head, whatever the stretch. The
// person sent it when the sender is the position, one of the account's owners
// (the address-kind read: a Safe's owners, a DSProxy's owner), or the
// transaction came in through the position's own account.
//
// Colour: a product has no roster entry, so its hue is the registry's
// `bar.hue` (read off its mark), drawn through the same `--brand-zone-*`
// tokens as a protocol's, at the same weight; a product whose
// mark is monochrome (`hue: null`) draws grey. A route's subject without its
// glyph yet draws the `route` glyph.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { usePositionCardIdentity } from "@/components/shared/position-card-edge";
import { BarSubjectMark, barSubjectHue } from "@/components/shared/bar-subject-mark";
import { barSubjectOf, type BarSubject } from "@/lib/shared/known-infrastructure";
import { notTheirs, type TxEntry } from "@/lib/shared/tx-entry";
import { fetchAddressKind } from "@/lib/api/fetch-address-kind";
import type { ChainId } from "@/lib/shared/chains";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { barSubjectProv, type BarAccountKind, type CowTradeEvidence } from "@/lib/shared/bar-provenance";

type Declared = TimelineEntryDeclaration & { wallet: string };

/** What a row declares to the bar: the address whose owner names its stretch
 *  (`entry.contract ?? entry.to`, or the receipt's `to`), and the facts the
 *  "not yours" mark reads. */
export interface TimelineEntryDeclaration {
  address?: string;
  entry?: TxEntry;
  wallet?: string;
  txHash?: string;
  /** A swap paired on a CoW Trade log (Aave V3 routes cow_permit and cow_adapter, every Aave V4 swap): the row
   *  declares CoW's settlement as its subject, whatever contract the transaction entered, and the receipt names
   *  the Trade log. */
  cowTrade?: CowTradeEvidence;
}

type DeclareEntry = (eventId: string, d: Declared) => () => void;
const TimelineEntryContext = createContext<DeclareEntry | null>(null);

/** Declares the contract an event row's transaction entered to the timeline's
 *  side bar. A no-op off the timeline (the event page, a page with no
 *  sidebar) and while nothing is known. */
export function useTimelineEntry(eventId: string | undefined, d: TimelineEntryDeclaration): void {
  const declare = useContext(TimelineEntryContext);
  const address = d.address?.toLowerCase();
  const { to, contract, account, from } = d.entry ?? {};
  const wallet = d.wallet?.toLowerCase();
  const txHash = d.txHash;
  const orderUid = d.cowTrade?.orderUid;
  const owner = d.cowTrade?.owner;
  useEffect(() => {
    if (!declare || !eventId || !wallet || (!address && !from && !txHash)) return;
    return declare(eventId, {
      wallet,
      ...(orderUid ? { cowTrade: { orderUid, ...(owner ? { owner } : {}) } } : {}),
      ...(address ? { address } : {}),
      ...(txHash ? { txHash } : {}),
      ...(to
        ? {
            entry: {
              to,
              ...(contract ? { contract } : {}),
              ...(account ? { account } : {}),
              ...(from ? { from } : {}),
            },
          }
        : {}),
    });
  }, [declare, eventId, address, to, contract, account, from, wallet, txHash, orderUid, owner]);
}

/** The bar subject a row's declaration names on a chain, or undefined (the
 *  protocol's bar). */
export function rowBarSubject(address: string | undefined, chainId: ChainId | undefined): BarSubject | undefined {
  return address && chainId != null ? barSubjectOf(address, chainId) : undefined;
}

/** Two rows this close (the timeline's row gap is 8px) are adjacent. */
const JOIN_GAP = 16;

/** The background between a stretch and the bar beside it. */
const BREAK = 8;

/** The shortest run of the protocol's bar drawn at the bar's top or foot. */
const MIN_RUN = 24;

/** Half the bar's width, from md (40px) and below it (12px): round ends. */
const RADIUS = 20;
const RADIUS_NARROW = 6;

/** Strips carving the two rounded corners into the protocol's bar at a cut
 *  end: in each, the quarter circle centred toward the bar's middle keeps the
 *  bar's colour, the rest is background, with a one-pixel ramp at the arc,
 *  matching the stretch's anti-aliased corner. `edge` is the cut end's side. */
function cornerStrips(key: string, top: number, r: number, edge: "top" | "bottom", show: string) {
  const y = edge === "top" ? "100%" : "0";
  return (["left", "right"] as const).map((side) => (
    <span
      key={`${key}:${side}`}
      className={`absolute ${side === "left" ? "left-0" : "right-0"} ${show}`}
      style={{
        top,
        width: r,
        height: r,
        background: `radial-gradient(circle at ${side === "left" ? "100%" : "0"} ${y}, transparent ${r - 0.5}px, var(--background) ${r + 0.5}px)`,
      }}
    />
  ));
}

interface Stretch {
  top: number;
  bottom: number;
  subject: BarSubject;
  /** The row at the stretch's head: its receipt sits on the mark. */
  headId: string;
}

/** The subject stretches over the timeline's bar and the "not yours" marks,
 *  measured against the frame. */
function SubjectStretches({
  frameRef,
  subjects,
  marked,
  entries,
  chainId,
  accountKind,
}: {
  frameRef: RefObject<HTMLDivElement | null>;
  subjects: Map<string, BarSubject>;
  marked: ReadonlySet<string>;
  entries: ReadonlyMap<string, Declared>;
  chainId: ChainId | undefined;
  accountKind: BarAccountKind | undefined;
}) {
  const registry = useReceiptRegistry();
  const [measured, setStretches] = useState<Stretch[]>([]);
  const [marks, setMarks] = useState<number[]>([]);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || (subjects.size === 0 && marked.size === 0)) {
      setStretches((prev) => (prev.length ? [] : prev));
      setMarks((prev) => (prev.length ? [] : prev));
      return;
    }
    const measure = () => {
      const box = frame.getBoundingClientRect();
      const origin = box.top;
      setHeight(box.height);
      const rows: Stretch[] = [];
      const tops: number[] = [];
      for (const el of frame.querySelectorAll<HTMLElement>("[data-event-id]")) {
        const id = el.dataset.eventId ?? "";
        const subject = subjects.get(id);
        if (!subject && !marked.has(id)) continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0) continue;
        if (marked.has(id)) tops.push(r.top - origin);
        if (subject)
          rows.push({
            top: r.top - origin,
            bottom: r.bottom - origin,
            subject,
            headId: id,
          });
      }
      tops.sort((a, b) => a - b);
      setMarks((prev) => (prev.length === tops.length && prev.every((p, i) => p === tops[i]) ? prev : tops));
      rows.sort((a, b) => a.top - b.top);
      const joined: Stretch[] = [];
      for (const row of rows) {
        const last = joined[joined.length - 1];
        if (last && last.subject.name === row.subject.name && row.top - last.bottom <= JOIN_GAP)
          last.bottom = Math.max(last.bottom, row.bottom);
        else joined.push({ ...row });
      }
      setStretches((prev) =>
        prev.length === joined.length &&
        prev.every(
          (p, i) =>
            p.top === joined[i].top &&
            p.bottom === joined[i].bottom &&
            p.subject === joined[i].subject &&
            p.headId === joined[i].headId,
        )
          ? prev
          : joined,
      );
    };
    measure();
    let frameId = 0;
    const soon = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(measure);
    };
    // A row opening or closing resizes the frame; the paging window and a
    // group's members add and remove rows.
    const resize = new ResizeObserver(soon);
    resize.observe(frame);
    const mutate = new MutationObserver(soon);
    mutate.observe(frame, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frameId);
      resize.disconnect();
      mutate.disconnect();
    };
  }, [frameRef, subjects, marked]);
  if (measured.length === 0 && marks.length === 0) return null;
  // The box's padding leaves the protocol's bar a short run past the first and
  // last rows; a run shorter than `MIN_RUN` would draw as a dot, so the stretch
  // beside it reaches the bar's end instead.
  // The mark and its receipt keep the head row's measured top.
  const stretches = measured.map((s, i) => ({
    ...s,
    markTop: s.top + 12,
    top: i === 0 && s.top - BREAK < MIN_RUN ? 0 : s.top,
    bottom: i === measured.length - 1 && height - s.bottom - BREAK < MIN_RUN ? height : s.bottom,
  }));
  // The protocol's bar between and around the stretches: each cut end takes
  // rounded corners, kept inside its segment (at most half a short segment) so a
  // strip never reaches a stretch. The bar's own top and bottom are rounded by
  // the bar; between two adjacent stretches there is no segment.
  const strips: ReactNode[] = [];
  for (let i = 0; i <= stretches.length; i++) {
    const above = stretches[i - 1];
    const below = stretches[i];
    if (above && below && below.top - above.bottom <= JOIN_GAP) continue;
    const top = above ? above.bottom + BREAK : 0;
    const bottom = below ? below.top - BREAK : height;
    const len = bottom - top;
    if (len <= 0) continue;
    for (const [radius, show] of [
      [RADIUS, "hidden md:block"],
      [RADIUS_NARROW, "md:hidden"],
    ] as const) {
      const r = Math.min(radius, above && below ? len / 2 : len);
      if (above) strips.push(...cornerStrips(`a:${top}:${radius}`, top, r, "top", show));
      if (below) strips.push(...cornerStrips(`b:${bottom}:${radius}`, bottom - r, r, "bottom", show));
    }
  }
  return (
    <>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-3 overflow-hidden md:w-10">
        {/* The breaks first, so no cutout paints over a neighbouring stretch. */}
        {stretches.map((s) => (
          <span
            key={`c:${s.top}:${s.subject.name}`}
            className="absolute inset-x-0 bg-background"
            style={{ top: s.top - BREAK, height: s.bottom - s.top + 2 * BREAK }}
          />
        ))}
        {strips}
        {stretches.map((s) => (
          <span key={`${s.top}:${s.subject.name}`}>
            <span
              className="absolute inset-x-0 rounded-[6px] bg-brand-zone md:rounded-[20px]"
              style={{ top: s.top, height: s.bottom - s.top, ...barSubjectHue(s.subject) }}
              data-anatomy="P3.1.1"
              data-bar-subject={s.subject.name}
            >
              <span className="absolute left-3 hidden md:block" style={{ top: s.markTop - s.top }}>
                <BarSubjectMark subject={s.subject} className="block" />
              </span>
            </span>
          </span>
        ))}
        {/* "Not yours": a row whose transaction the person did not send, in the
          external actor's pink, level with the row's head and its "by" chip. */}
        {marks.map((top, i) => (
          <span
            key={i}
            className="absolute left-[3px] h-1.5 w-1.5 rounded-full bg-[var(--color-pink-500)] md:left-[30px]"
            style={{ top: top + 17 }}
            data-anatomy="P3.1.2"
            data-bar-not-yours=""
          />
        ))}
      </span>
      {/* The bar's receipt, on the mark at each stretch's head (from md, where
          the mark is drawn): what the head row's transaction entered. */}
      {stretches.map((s) => {
        const d = entries.get(s.headId);
        const info =
          d?.address && chainId != null
            ? barSubjectProv({
                address: d.address,
                entry: d.entry,
                wallet: d.wallet,
                txHash: d.txHash,
                chainId,
                accountKind,
                cowTrade: d.cowTrade,
              })
            : null;
        if (!info) return null;
        return (
          <ProvReceiptsScope key={`r:${s.headId}`} registry={registry} bounds={false}>
            {/* The mark carries its receipt, picked while the inspector is
                armed. */}
            <span
              className="absolute left-3 hidden h-4 w-4 rounded-sm md:block"
              style={{ top: s.markTop }}
              data-bar-receipt={s.subject.name}
            >
              <Prov info={info} value={s.subject.name} className="block h-4 w-4">
                <span className="sr-only">{s.subject.name}</span>
              </Prov>
            </span>
          </ProvReceiptsScope>
        );
      })}
    </>
  );
}

export type SectionSidebarKind = "flows" | "timeline" | "challenges";

const ANATOMY: Record<SectionSidebarKind, string> = { flows: "P2.1", timeline: "P3.1", challenges: "P2.1" };

export function SectionSidebar({
  section,
  hidden,
  children,
}: {
  /** `flows` wraps Lifetime flows and `challenges` Frankencoin's challenge
   *  history, each a box; `timeline` wraps the timeline, whose bar carries the
   *  subject stretches. */
  section: SectionSidebarKind;
  hidden?: boolean;
  children: ReactNode;
}) {
  const identity = usePositionCardIdentity();
  const frameRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<ReadonlyMap<string, Declared>>(() => new Map());
  const declare = useCallback<DeclareEntry>((eventId, d) => {
    setEntries((prev) => {
      const next = new Map(prev);
      next.set(eventId, d);
      return next;
    });
    return () =>
      setEntries((prev) => {
        if (prev.get(eventId) !== d) return prev;
        const next = new Map(prev);
        next.delete(eventId);
        return next;
      });
  }, []);
  const chainId = identity?.chain.id;
  const { subjects, resolved } = useMemo(() => {
    const subjects = new Map<string, BarSubject>();
    const resolved = new Map<string, Declared>();
    // A row that declares only its transaction (an e-mode switch's log) takes
    // the entry another row of that transaction declares.
    const byTx = new Map<string, Declared>();
    for (const d of entries.values()) if (d.address && d.txHash) byTx.set(d.txHash.toLowerCase(), d);
    for (const [eventId, d] of entries) {
      const r = d.address ? d : d.txHash ? byTx.get(d.txHash.toLowerCase()) : undefined;
      if (!r) continue;
      resolved.set(eventId, r);
      const subject = rowBarSubject(r.address, chainId);
      if (subject) subjects.set(eventId, subject);
    }
    return { subjects, resolved };
  }, [entries, chainId]);
  // The account's owners, read once per page with its kind (the wallet
  // heading's read, cached): on a Safe the sender is never the position, so
  // the "not yours" test reads the owners.
  const wallet = entries.values().next().value?.wallet;
  const [owners, setOwners] = useState<{
    wallet: string;
    list: string[] | null;
    isContract: boolean;
    kind: BarAccountKind;
  } | null>(null);
  useEffect(() => {
    if (!wallet || chainId == null) return;
    let live = true;
    fetchAddressKind(wallet, chainId).then((k) => {
      if (!live || !k) return;
      const isContract = k.kind === "safe" || k.kind === "contract";
      const list = (k.kind === "safe" || k.kind === "contract") && k.owners ? k.owners : null;
      setOwners({ wallet, list, isContract, kind: k.kind === "safe" ? "safe" : "account" });
    });
    return () => {
      live = false;
    };
  }, [wallet, chainId]);
  const marked = useMemo(() => {
    const out = new Set<string>();
    if (!owners) return out;
    for (const [eventId, d] of entries)
      if (d.wallet === owners.wallet && notTheirs(d.entry, d.wallet, owners)) out.add(eventId);
    return out;
  }, [entries, owners]);
  if (!identity) return <>{children}</>;
  const style = {
    "--brand-hue": identity.hue ?? 0,
    ...(identity.hue == null ? { "--brand-strength": 0 } : {}),
  } as CSSProperties;
  const boxed = section !== "timeline";
  return (
    <div
      ref={frameRef}
      className="relative pl-[18px] md:pl-12"
      style={style}
      data-card-sidebar-frame={section}
      hidden={hidden}
    >
      {boxed ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-3 rounded-full bg-brand-zone md:w-10"
            data-anatomy={ANATOMY[section]}
            data-card-sidebar={section}
          />
          {children}
        </>
      ) : (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-3 rounded-[6px] bg-brand-zone md:w-10 md:rounded-[20px]"
            data-anatomy={ANATOMY[section]}
            data-card-sidebar={section}
          />
          <SubjectStretches
            frameRef={frameRef}
            subjects={subjects}
            marked={marked}
            entries={resolved}
            chainId={chainId}
            accountKind={owners?.wallet === wallet ? owners?.kind : undefined}
          />
          <TimelineEntryContext.Provider value={declare}>{children}</TimelineEntryContext.Provider>
        </>
      )}
    </div>
  );
}

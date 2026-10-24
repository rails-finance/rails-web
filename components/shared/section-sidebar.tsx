"use client";

// The position card's sidebar carried through a detail page's sections (rails-ops
// TO-DO-position-card 427; anatomy P2.1, P3.1): from md a bar the card's width
// (40px) in the protocol's brand hue at the section's left, bare (no mark, name
// or glyph); below md the 6px border the card takes. The section keeps its box
// and content; from md it stands beside the bar, and below md the bare
// timeline steps 6px in beside its border as the boxes' content does. Off the explorers (no roster
// entry for the page) it draws nothing and adds no wrapper.
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
// row gap), so the bar reads as broken there, and from md every segment of
// the bar, stretches and the protocol's bar between them, has its left corners
// rounded at the bar's radius (16px). A stretch sets its own; the protocol's
// bar is one span, so its cut ends are carved by inverted-corner strips in the
// background colour, skipped between two adjacent stretches. Each stretch is
// measured against this frame: the row's box (`data-event-id`) from its top to
// its bottom. Below md the stretch is the 6px edge in the product's hue, with
// the same breaks, square corners and no mark.
//
// "Not yours" (P3.1.2): a row whose transaction the person did not send takes
// a small pink dot on the bar level with its head, whatever the stretch. The
// person sent it when the sender is the position, one of the account's owners
// (the address-kind read: a Safe's owners, a DSProxy's owner), or the
// transaction came in through the position's own account.
//
// Colour: a product has no roster entry, so its hue is the registry's
// `bar.hue` (read off its mark), drawn through the same `--brand-zone-*` and
// `--brand-edge-*` tokens as a protocol's, at the same weight; a product whose
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
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { barSubjectOf, type BarSubject } from "@/lib/shared/known-infrastructure";
import { notTheirs, type TxEntry } from "@/lib/shared/tx-entry";
import { fetchAddressKind } from "@/lib/api/fetch-address-kind";
import type { ChainId } from "@/lib/shared/chains";
import { Prov, ProvReceiptsScope, provInspector, useReceiptRegistry } from "@/components/shared/provenance";
import { barSubjectProv, type BarAccountKind } from "@/lib/shared/bar-provenance";

type Declared = TimelineEntryDeclaration & { wallet: string };

/** What a row declares to the bar: the address whose owner names its stretch
 *  (`entry.contract ?? entry.to`, or the receipt's `to`), and the facts the
 *  "not yours" mark reads. */
export interface TimelineEntryDeclaration {
  address?: string;
  entry?: TxEntry;
  wallet?: string;
  txHash?: string;
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
  useEffect(() => {
    if (!declare || !eventId || !wallet || (!address && !from && !txHash)) return;
    return declare(eventId, {
      wallet,
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
  }, [declare, eventId, address, to, contract, account, from, wallet, txHash]);
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

/** The bar's corner radius (`rounded-2xl`). */
const RADIUS = 16;

/** A strip carving one rounded corner into the protocol's bar at a cut end:
 *  the quarter circle at `at` keeps the bar's colour, the rest is background,
 *  with a pixel's ramp at the arc to match the stretch's anti-aliased corner. */
function cornerStrip(key: string, top: number, r: number, at: "100% 0" | "100% 100%") {
  return (
    <span
      key={key}
      className="absolute left-0 hidden md:block"
      style={{
        top,
        width: r,
        height: r,
        background: `radial-gradient(circle at ${at}, transparent ${r - 0.5}px, var(--background) ${r + 0.5}px)`,
      }}
    />
  );
}

interface Stretch {
  top: number;
  bottom: number;
  subject: BarSubject;
  /** The row at the stretch's head: its receipt sits on the mark. */
  headId: string;
  /** The head row's receipts scope (its card's `data-prov-scope`), so arming
   *  that row's inspector reaches the bar's receipt too. */
  headScope?: string;
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
  const [stretches, setStretches] = useState<Stretch[]>([]);
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
            headScope: el.querySelector<HTMLElement>("[data-prov-scope]")?.dataset.provScope,
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
            p.headId === joined[i].headId &&
            p.headScope === joined[i].headScope,
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
  if (stretches.length === 0 && marks.length === 0) return null;
  // The protocol's bar between and around the stretches: each cut end takes a
  // rounded corner, kept inside its segment (at most half a short segment) so a
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
    const r = Math.min(RADIUS, above && below ? len / 2 : len);
    if (above) strips.push(cornerStrip(`a:${top}`, top, r, "100% 100%"));
    if (below) strips.push(cornerStrip(`b:${bottom}`, bottom - r, r, "100% 0"));
  }
  return (
    <>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1.5 overflow-hidden md:w-10">
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
              className="absolute inset-x-0 bg-brand-edge md:rounded-l-2xl md:bg-brand-zone"
              style={
                {
                  top: s.top,
                  height: s.bottom - s.top,
                  "--brand-hue": s.subject.hue ?? 0,
                  "--brand-strength": s.subject.hue == null ? 0 : 1,
                } as CSSProperties
              }
              data-anatomy="P3.1.1"
              data-bar-subject={s.subject.name}
            >
              <ProtocolIcon
                id={s.subject.icon}
                fallback={s.subject.shared ? "route" : undefined}
                className="absolute left-3 top-3 hidden h-4 w-4 text-brand-mark md:block [&:is(img)]:grayscale"
              />
            </span>
          </span>
        ))}
        {/* "Not yours": a row whose transaction the person did not send, in the
          external actor's pink, level with the row's head and its "by" chip. */}
        {marks.map((top, i) => (
          <span
            key={i}
            className="absolute left-0 h-1.5 w-1.5 rounded-full bg-[var(--color-pink-500)] md:left-[30px]"
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
              })
            : null;
        if (!info) return null;
        return (
          <ProvReceiptsScope key={`r:${s.headId}`} registry={registry} scopeId={s.headScope ?? s.headId} bounds={false}>
            {/* The mark opens its receipt as a head chip does: it arms the
                row's scope and pins the receipt at the mark. */}
            <button
              type="button"
              className="absolute left-3 hidden h-4 w-4 cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] md:block"
              style={{ top: s.top + 12 }}
              data-bar-receipt={s.subject.name}
              aria-label={`Where this transaction was sent: ${s.subject.name}`}
              onClick={(e) => {
                const scope = s.headScope ?? s.headId;
                const el = e.currentTarget;
                provInspector.setArmed(true, scope);
                const entry = registry.getEntries().find((x) => !x.echo && x.el && el.contains(x.el));
                if (entry?.el) provInspector.pin(entry, registry, entry.el);
              }}
            >
              <Prov info={info} value={s.subject.name} className="block h-4 w-4">
                <span className="sr-only">{s.subject.name}</span>
              </Prov>
            </button>
          </ProvReceiptsScope>
        );
      })}
    </>
  );
}

export type SectionSidebarKind = "flows" | "timeline";

const ANATOMY: Record<SectionSidebarKind, string> = { flows: "P2.1", timeline: "P3.1" };

/** The 6px border below md: the section's rounded shape clipped to its left edge. */
const EDGE = "rounded-2xl bg-brand-edge [clip-path:inset(0_calc(100%_-_6px)_0_0)]";

export function SectionSidebar({
  section,
  hidden,
  children,
}: {
  /** `flows` wraps a boxed section (its tint runs under the box's corners, as
   *  the card's does); `timeline` wraps the bare timeline (the bar's inner edge
   *  is straight, the edge a later per-row tab stands from). */
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
  const boxed = section === "flows";
  return (
    <div
      ref={frameRef}
      className={`relative md:pl-10 ${boxed ? "" : "max-md:pl-1.5"}`}
      style={style}
      data-card-sidebar-frame={section}
      hidden={hidden}
    >
      {boxed ? (
        <>
          {/* From md the bar meets the box as the card's does: the tint shows
              in the box's rounded corners (`mask-sidebar-corners`). */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 hidden w-14 rounded-2xl bg-brand-zone mask-sidebar-corners md:block"
            data-anatomy={ANATOMY[section]}
            data-card-sidebar={section}
          />
          {children}
          {/* Below md over the box's left edge, as the card's border. */}
          <span aria-hidden="true" className={`pointer-events-none absolute inset-0 md:hidden ${EDGE}`} />
        </>
      ) : (
        <>
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 left-0 w-full ${EDGE} md:w-10 md:rounded-r-none md:bg-brand-zone md:[clip-path:none]`}
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

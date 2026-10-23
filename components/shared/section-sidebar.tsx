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
// ── Whose bar a row stands beside (rails-ops TO-DO-ui-jobs 439) ──────────────
// The bar beside a row is the owner of the contract the row's transaction
// entered (its `to`). A card that knows its transaction's `to` declares it with
// `useTimelineEntry`; where the registry gives that contract a `bar` (a
// product's own entry contract: Zerion's router), the row's stretch of the bar
// takes the product's hue and, from md, its mark at the stretch's top. Every
// other row, and every row whose `to` is unknown, stands beside the protocol's
// bar. Adjacent rows with the same subject join into one stretch; between a
// stretch and the protocol's bar the page's background shows for 2px, so the
// bar reads as broken there. Each stretch is measured against this frame: the
// row's box (`data-event-id`) from its top to its bottom. Below md the stretch
// is the 6px edge in the product's hue, with the same 2px breaks and no mark.
//
// Colour: a product has no roster entry, so its hue is the registry's
// `bar.hue` (read off its mark), drawn through the same `--brand-zone-*` and
// `--brand-edge-*` tokens as a protocol's, at the same weight.

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

type DeclareEntry = (eventId: string, to: string) => () => void;
const TimelineEntryContext = createContext<DeclareEntry | null>(null);

/** Declares the contract an event row's transaction entered (its receipt's
 *  `to`) to the timeline's side bar. A no-op off the timeline (the event page,
 *  a page with no sidebar) and while `to` is unknown. */
export function useTimelineEntry(eventId: string | undefined, to: string | undefined): void {
  const declare = useContext(TimelineEntryContext);
  useEffect(() => {
    if (!declare || !eventId || !to) return;
    return declare(eventId, to.toLowerCase());
  }, [declare, eventId, to]);
}

/** Two rows this close (the timeline's row gap is 8px) are adjacent. */
const JOIN_GAP = 16;

interface Stretch {
  top: number;
  bottom: number;
  subject: BarSubject;
}

/** The subject stretches over the timeline's bar, measured against the frame. */
function SubjectStretches({
  frameRef,
  subjects,
}: {
  frameRef: RefObject<HTMLDivElement | null>;
  subjects: Map<string, BarSubject>;
}) {
  const [stretches, setStretches] = useState<Stretch[]>([]);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || subjects.size === 0) {
      setStretches((prev) => (prev.length ? [] : prev));
      return;
    }
    const measure = () => {
      const origin = frame.getBoundingClientRect().top;
      const rows: Stretch[] = [];
      for (const el of frame.querySelectorAll<HTMLElement>("[data-event-id]")) {
        const subject = subjects.get(el.dataset.eventId ?? "");
        if (!subject) continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0) continue;
        rows.push({ top: r.top - origin, bottom: r.bottom - origin, subject });
      }
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
          (p, i) => p.top === joined[i].top && p.bottom === joined[i].bottom && p.subject === joined[i].subject,
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
  }, [frameRef, subjects]);
  if (stretches.length === 0) return null;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1.5 overflow-hidden md:w-10">
      {stretches.map((s) => (
        <span key={`${s.top}:${s.subject.name}`}>
          <span className="absolute inset-x-0 bg-background" style={{ top: s.top - 2, height: s.bottom - s.top + 4 }} />
          <span
            className="absolute inset-x-0 bg-brand-edge md:bg-brand-zone"
            style={
              {
                top: s.top,
                height: s.bottom - s.top,
                "--brand-hue": s.subject.hue,
                "--brand-strength": 1,
              } as CSSProperties
            }
            data-anatomy="P3.1.1"
            data-bar-subject={s.subject.name}
          >
            <ProtocolIcon
              id={s.subject.icon}
              className="absolute left-3 top-3 hidden h-4 w-4 text-brand-mark md:block [&:is(img)]:grayscale"
            />
          </span>
        </span>
      ))}
    </span>
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
  const [entries, setEntries] = useState<ReadonlyMap<string, string>>(() => new Map());
  const declare = useCallback<DeclareEntry>((eventId, to) => {
    setEntries((prev) => {
      if (prev.get(eventId) === to) return prev;
      const next = new Map(prev);
      next.set(eventId, to);
      return next;
    });
    return () =>
      setEntries((prev) => {
        if (prev.get(eventId) !== to) return prev;
        const next = new Map(prev);
        next.delete(eventId);
        return next;
      });
  }, []);
  const chainId = identity?.chain.id;
  const subjects = useMemo(() => {
    const out = new Map<string, BarSubject>();
    if (chainId == null) return out;
    for (const [eventId, to] of entries) {
      const subject = barSubjectOf(to, chainId);
      if (subject) out.set(eventId, subject);
    }
    return out;
  }, [entries, chainId]);
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
          <SubjectStretches frameRef={frameRef} subjects={subjects} />
          <TimelineEntryContext.Provider value={declare}>{children}</TimelineEntryContext.Provider>
        </>
      )}
    </div>
  );
}

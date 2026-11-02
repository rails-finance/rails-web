"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { MobileSheet } from "@/components/shared/mobile-sheet";
import { formatFlowUsd } from "@/lib/shared/flows-timeline";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { formatValueHeld, spokenValueHeld, type ValueHeld } from "@/lib/home/value-held";

/**
 * The band's small print, opened from the (i) after the last label: what the
 * figures are and how they are counted. One note for the band. Desktop opens a
 * centred dialog (the learn-more modal's shell: portal, backdrop, surface);
 * below `sm` the shared MobileSheet, since a table and a list have nowhere to
 * sit on a phone.
 *
 * In order: the lead (when a value is stated), the caption line moved out of
 * the band (open and closed, wallets), the per-explorer breakdown, what is not
 * counted, the overlaps and the floor sentence, then the long-standing text on
 * how positions are counted.
 *
 * The "how positions are counted" text states the rule the loader applies
 * (covered-positions-data.ts): each explorer's own listing total, all-time,
 * summed hourly; the grain each protocol counts in, and the Arbitrum census
 * grain (census-leg.ts); that "closed" absorbs every protocol's own ending;
 * and that the wallet figure is distinct across explorers (stats.ts counts
 * DISTINCT lower(wallet) over every listing). Nothing about Base backfill
 * completeness on purpose: that gate closes the day Morpho Base's history
 * lands and would then describe nothing.
 */
function CountedText() {
  return (
    <>
      Positions are the sum of each explorer&rsquo;s own listing total, counted all-time and refreshed hourly. A
      position is whatever the protocol&rsquo;s listing counts: a trove for Liquity and its forks, a vault for MakerDAO,
      one entry per wallet and market for Aave V3 and Morpho, one per wallet for Spark, Moonwell, Maple and Compound V2.
      On Arbitrum a position is a wallet that has ever supplied or borrowed on the protocol, read from the chain once a
      day. Closed includes liquidated, repaid and defaulted. Wallets are counted once across every explorer.
    </>
  );
}

const NOTE_LABEL = "How the figures are counted";

const fmtBlock = (b: { from: number; to: number }) =>
  b.from === b.to ? b.to.toLocaleString("en-US") : `${b.from.toLocaleString("en-US")}–${b.to.toLocaleString("en-US")}`;

const fmtShare = (share: number) => (share < 0.001 ? "<0.1%" : `${(share * 100).toFixed(1)}%`);

function Heading({ children }: { children: ReactNode }) {
  return <h3 className={`${OVERLAY_HEADING} mt-5 mb-2`}>{children}</h3>;
}

function NoteBody({ value, caption }: { value: ValueHeld | null; caption: ReactNode }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {value && (
        <p className="text-foreground">
          From the smallest position to the largest, Rails shows each in the same detail. Together, the open positions
          hold{" "}
          <span className="font-semibold tabular-nums" aria-label={spokenValueHeld(value.totalUsd)}>
            {formatValueHeld(value.totalUsd)}
          </span>
          .
        </p>
      )}
      <p className="text-rb-500">{caption}</p>

      {value && (
        <>
          <Heading>Held, by explorer</Heading>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="text-rb-500">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Explorer
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    Share
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Block
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Prices
                  </th>
                </tr>
              </thead>
              <tbody>
                {value.rows.map((r) => (
                  <tr key={r.key} className="border-t border-rb-200 align-top dark:border-rb-700">
                    <td className="py-1 pr-3 text-foreground">
                      {r.label} <span className="text-rb-500">{r.chainName}</span>
                    </td>
                    <td className="py-1 pr-3 text-right">{fmtShare(r.share)}</td>
                    <td className="py-1 pr-3">{r.block ? fmtBlock(r.block) : "—"}</td>
                    <td className="py-1">{r.oracleOf ?? r.prices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {value.notCounted.length > 0 && (
            <>
              <Heading>Not counted</Heading>
              <ul className="space-y-1 text-xs">
                {value.notCounted.map((n) => (
                  <li key={`${n.label}:${n.chainName}:${n.reason}`}>
                    <span className="text-foreground">
                      {n.label} {n.chainName}
                    </span>
                    : {n.reason}
                  </li>
                ))}
              </ul>
            </>
          )}

          {value.leftOut.length > 0 && (
            <>
              <Heading>Left out of counted explorers</Heading>
              <ul className="space-y-1 text-xs">
                {value.leftOut.map((l) => (
                  <li key={`${l.label}:${l.chainName}:${l.reason}`}>
                    <span className="text-foreground">
                      {l.label} {l.chainName}
                    </span>
                    : {l.what}
                    {l.usd !== null && l.usd >= 0.5 && (
                      <span className="tabular-nums"> ({formatFlowUsd(l.usd)})</span>
                    )}: {l.reason}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-4 space-y-1 text-xs">
            {value.overlaps.map((o) => (
              <p key={o}>{o}</p>
            ))}
            <p>The figure is a floor: debt is neither added nor subtracted, and what is not counted is named above.</p>
          </div>
        </>
      )}

      <Heading>How positions are counted</Heading>
      <p className="text-xs">
        <CountedText />
      </p>
    </div>
  );
}

/** The desktop dialog: the learn-more modal's shell, wider for the table. */
function NoteDialog({ id, onClose, children }: { id: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] overflow-y-auto" onClick={onClose}>
      <div
        className="pointer-events-none fixed inset-0 backdrop-blur-sm"
        style={{ background: "var(--backdrop-bg)" }}
      />
      <div className="relative flex min-h-full items-center justify-center p-4">
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-modal="true"
          aria-label={NOTE_LABEL}
          tabIndex={-1}
          data-anatomy="S3.4"
          className="relative my-8 w-full max-w-2xl rounded-2xl p-6 shadow-xl focus:outline-none"
          style={{ background: "var(--surface-overlay)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-ghost absolute right-4 top-4 cursor-pointer"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <h2 className="mb-3 pr-8 text-lg font-bold">{NOTE_LABEL}</h2>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The (i) trigger and the note it opens, as one inline unit. `value` is null
 * while the value block is omitted; the note then holds the caption and the
 * counting text alone. `caption` is the moved caption line, drawn by the server
 * component so its wallet-clause rule (`walletClauseIsInScope`) stays there.
 */
export function CoveredStatsNote({ value, caption }: { value: ValueHeld | null; caption: ReactNode }) {
  const [open, setOpen] = useState(false);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const noteId = useId();
  const dialogOpen = open && !isPhone;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <span className="inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? noteId : undefined}
        aria-haspopup="dialog"
        aria-label={open ? `Hide ${NOTE_LABEL.toLowerCase()}` : `Show ${NOTE_LABEL.toLowerCase()}`}
        data-anatomy="S3.3"
        className={`inline-flex cursor-pointer items-center transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          open ? "text-foreground" : "text-rb-500"
        }`}
      >
        <Info className="size-[1.1em]" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {dialogOpen && (
        <NoteDialog id={noteId} onClose={close}>
          <NoteBody value={value} caption={caption} />
        </NoteDialog>
      )}

      {open && isPhone && (
        <MobileSheet label={NOTE_LABEL} onClose={() => setOpen(false)}>
          <p className="font-semibold text-foreground">{NOTE_LABEL}</p>
          <div className="mt-2" id={noteId}>
            <NoteBody value={value} caption={caption} />
          </div>
        </MobileSheet>
      )}
    </span>
  );
}

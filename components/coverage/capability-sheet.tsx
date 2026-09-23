"use client";

// The mobile-only home for a capability's definition. Desktop reads
// `CAPABILITIES[].detail` from the matrix's own column-header popovers
// (depth-matrix.tsx); the mobile card stack (coverage-page.tsx) never shows
// that text inline, so each included-capability pill IS the trigger — tap it
// and its definition slides up as a bottom sheet.

import { useState } from "react";
import { Check, ChevronUp } from "lucide-react";
import { MobileSheet } from "@/components/shared/mobile-sheet";

interface CapabilityPillProps {
  label: string;
  detail: string;
}

/** An included capability on a mobile card. Quiet at rest — a faint chevron
 *  is the only hint it opens something; a pressed state answers the tap. */
export function CapabilityPill({ label, detail }: CapabilityPillProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-background text-xs font-medium text-foreground transition-colors active:bg-rb-200 dark:active:bg-rb-800"
      >
        <Check className="h-3 w-3 text-green-500" aria-hidden="true" />
        {label}
        <ChevronUp className="h-2.5 w-2.5 text-rb-400" aria-hidden="true" />
      </button>
      {open && (
        <MobileSheet label={label} onClose={() => setOpen(false)}>
          <p className="font-semibold text-foreground">{label}</p>
          <p className="text-sm body-text mt-2">{detail}</p>
        </MobileSheet>
      )}
    </>
  );
}

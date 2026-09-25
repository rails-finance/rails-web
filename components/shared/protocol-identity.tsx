"use client";

// The protocol's identity line — mark + wordmark + chain mark, linking back to
// the explorer's listing. This lived in the header chrome beside the Rails
// wordmark until the chrome was reduced to "Rails · BETA"; the pages own
// their identity now. Detail pages render it above the back row, and the
// listing h1 carries the same mark inline. The link keeps the old header
// affordance: from a deep view it is the fastest jump back to the BARE
// listing (the back button deliberately returns to the filtered one).

import Link from "next/link";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { protocolForSession } from "@/lib/shared/protocols";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";

/** Two scales, set here so every protocol gets the same treatment (rails-ops
 *  TO-DO-ui-jobs 67, retuned by 68).
 *
 *  `title` is the page's largest type, at 20px with a 32px mark beside it
 *  (Miles, 2026-09-25) — one size at every width, since the chain chooser now
 *  shares the row and a name that grew at `md` would push it about. It carries
 *  NO tracking and NO uppercasing: the roster already spells each name the way
 *  it is written ("Liquity V2", "f(x) Protocol"), and at this size the capitals
 *  and the letter-spacing that give 11px small caps their register read as
 *  shouting.
 *
 *  `label` is the original 11px small-caps register, still what a position
 *  view wears: there the subject is one account's position and its own h1
 *  names it, so the protocol above it is a way back, not the headline. */
const SCALE = {
  title: {
    icon: "h-8 w-8",
    text: "text-[20px] leading-none",
    gap: "gap-2.5",
  },
  label: { icon: "h-4 w-4", text: "text-[11px] uppercase tracking-[0.14em]", gap: "gap-1.5" },
} as const;

/** The mark and the protocol's name, linking to its listing. No chain mark —
 *  the chooser sits at the right end of the same row and names the chain on
 *  every app page, so the identity says only who the rail is. Renders nothing
 *  if the session union and the roster ever drift apart, rather than a crash
 *  or a bare label. */
export function ProtocolIdentity({
  session,
  scale = "label",
}: {
  session: SessionProtocol;
  scale?: keyof typeof SCALE;
}) {
  const entry = protocolForSession(session);
  if (!entry) return null;
  const s = SCALE[scale];
  return (
    <Link href={entry.href} data-rail-identity={entry.id} className={`group inline-flex items-center ${s.gap}`}>
      <ProtocolIcon
        id={entry.id}
        className={`${s.icon} shrink-0 text-foreground transition-colors group-hover:text-blue-500`}
      />
      <span className={`${s.text} font-semibold text-foreground transition-colors group-hover:text-blue-500`}>
        {entry.label}
      </span>
    </Link>
  );
}

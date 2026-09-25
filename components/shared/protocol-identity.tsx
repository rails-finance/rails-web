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
 *  TO-DO-ui-jobs 67).
 *
 *  `title` is the page's largest type: it beats the 24px page h1 and the
 *  30px `lg` stat figure, which were the top of the scale before. Tracking
 *  comes down as the size goes up — the 0.14em that gives 11px small caps
 *  their register opens 34px capitals into a gap-toothed line, and FRANKENCOIN,
 *  the longest name on the roster, has to sit on one line at 390px.
 *
 *  `label` is the original 11px small-caps register, still what a position
 *  view wears: there the subject is one account's position and its own h1
 *  names it, so the protocol above it is a way back, not the headline. */
const SCALE = {
  title: {
    icon: "h-6 w-6 md:h-8 md:w-8",
    text: "text-[26px] md:text-[34px] leading-none tracking-[0.03em]",
    gap: "gap-2.5",
  },
  label: { icon: "h-4 w-4", text: "text-[11px] tracking-[0.14em]", gap: "gap-1.5" },
} as const;

/** Small-caps identity treatment, visually the header's old ProtocolLabel:
 *  the mark and the dimmed uppercase name. No chain mark — the switcher
 *  trigger in the chrome names the chain on every app page, so the identity
 *  line says only who the rail is. Renders nothing if the session union and
 *  the roster ever drift apart, rather than a crash or a bare label. */
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
      <span className={`${s.text} font-semibold uppercase text-foreground transition-colors group-hover:text-blue-500`}>
        {entry.label}
      </span>
    </Link>
  );
}

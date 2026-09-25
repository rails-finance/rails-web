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

/** Small-caps identity treatment, visually the header's old ProtocolLabel:
 *  the mark and the dimmed uppercase name. No chain mark — the switcher
 *  trigger in the chrome names the chain on every app page, so the identity
 *  line says only who the rail is. Renders nothing if the session union and
 *  the roster ever drift apart, rather than a crash or a bare label. */
export function ProtocolIdentity({ session }: { session: SessionProtocol }) {
  const entry = protocolForSession(session);
  if (!entry) return null;
  return (
    <Link href={entry.href} data-rail-identity={entry.id} className="group inline-flex items-center gap-1.5">
      <ProtocolIcon
        id={entry.id}
        className="h-4 w-4 shrink-0 text-foreground transition-colors group-hover:text-blue-500"
      />
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground transition-colors group-hover:text-blue-500">
        {entry.label}
      </span>
    </Link>
  );
}

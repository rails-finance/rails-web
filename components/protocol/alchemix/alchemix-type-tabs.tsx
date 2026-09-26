// The position-type switch on an Alchemix listing: Alchemist positions |
// Transmuter positions.
//
// Two routes, so the switch is a pair of links and the URL is the state, the
// house pattern for anything shareable (the chain toggle's link form, whose
// control this wears). The Transmuter is reached here and not from the roster:
// the roster's axis is protocol by chain, and a position type is not a third
// axis (rails-ops TO-DO-alchemix-scoping §8.4). No hooks, so it renders in the
// server HTML with its links live.

import Link from "next/link";
import { SEGMENT_SHELL, segmentClass } from "@/components/shared/chain-toggle";
import { transmuterListingPath, v2LinesForChain, v2ListingPath, type AlchemixDeployment } from "@/lib/alchemix/lines";

// A third tab on an explorer whose chain carried V2 (Ethereum only): the V2
// positions, all closed on 2026-04-02. It is a tab rather than a filter on the
// V3 listing because a V2 position is a different kind of thing, an account
// with a frozen figure, and the two listings share no sort that means the same
// on both.

export function AlchemixTypeTabs({
  deployment,
  active,
}: {
  deployment: AlchemixDeployment;
  active: "alchemist" | "transmuter" | "v2";
}) {
  const tabs: { kind: "alchemist" | "transmuter" | "v2"; href: string; label: string }[] = [
    { kind: "alchemist", href: deployment.basePath, label: "Alchemist positions" },
    { kind: "transmuter", href: transmuterListingPath(deployment), label: "Transmuter positions" },
  ];
  if (v2LinesForChain(deployment.chainId).length > 0) {
    tabs.push({ kind: "v2", href: v2ListingPath(deployment), label: "V2 positions" });
  }
  return (
    <nav aria-label="Position type" className="mb-4">
      <div className={SEGMENT_SHELL}>
        {tabs.map((t) => (
          <Link
            key={t.kind}
            href={t.href}
            aria-current={t.kind === active ? "page" : undefined}
            className={segmentClass(t.kind === active)}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

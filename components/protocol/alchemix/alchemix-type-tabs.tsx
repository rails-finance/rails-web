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
import { transmuterListingPath, type AlchemixDeployment } from "@/lib/alchemix/lines";

export function AlchemixTypeTabs({
  deployment,
  active,
}: {
  deployment: AlchemixDeployment;
  active: "alchemist" | "transmuter";
}) {
  const tabs = [
    { kind: "alchemist" as const, href: deployment.basePath, label: "Alchemist positions" },
    { kind: "transmuter" as const, href: transmuterListingPath(deployment), label: "Transmuter positions" },
  ];
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

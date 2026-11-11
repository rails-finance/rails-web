"use client";

// Uniswap's front door (N5; rails-ops ui-jobs 556): the mark and name, the
// shared search (H15) landing on a wallet's positions, and one line on what
// the pages read. The layout is CoW's (components/protocol/cow/cow-front-door.tsx).
// Aerodrome's door (ui-jobs 566) is the same, through `PoolFrontDoor`.

import Link from "next/link";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { FrontDoorSearch } from "@/components/shared/front-door-search";
import { ReadTierTag, isReadOnVisit } from "@/components/shared/read-tier-tag";
import { READ_TIER } from "@/lib/shared/read-tier";
import { NAV_PILL } from "@/lib/shared/ui-grammar";
import { uniExplorer, type UniChainId, type UniProtocol } from "@/lib/uniswap/deployments";
import type { UniswapVersion } from "@/lib/uniswap/types";
import { FRONT_DOOR, versionLabel } from "@/lib/uniswap/words";

/** A pool explorer's front door: `id` is the roster id (the mark and `data-front-door`), `route` the
 *  explorer's route, under which a wallet's positions live. */
export function PoolFrontDoor({
  id,
  label,
  line,
  route,
  extra,
}: {
  id: string;
  label: string;
  line: string;
  route: string;
  /** A second line under `line`. */
  extra?: string;
}) {
  const tiered = isReadOnVisit(id);
  return (
    <div
      className="flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center py-12"
      data-anatomy="N5"
      data-front-door={id}
    >
      <h1 className={`${tiered ? "mb-4" : "mb-8"} flex items-center gap-3`}>
        <ProtocolIcon id={id} className="h-11 w-11 shrink-0 text-foreground" />
        <span className="text-3xl font-semibold leading-none text-foreground">{label}</span>
      </h1>
      {/* Decision 0061: the tag and its line on a row of their own under the
          name, so the heading stays centred. */}
      {tiered && (
        <p
          className="mb-8 flex max-w-xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-rb-500"
          data-anatomy="H23.2"
          data-read-tier-line=""
        >
          <ReadTierTag tip={false} />
          <span>{READ_TIER.line}</span>
        </p>
      )}
      <div className="w-full max-w-xl">
        <FrontDoorSearch href={(wallet) => `${route}/${wallet}`} />
      </div>
      <p className="mt-6 max-w-xl text-center text-sm text-rb-500">{line}</p>
      {extra && <p className="mt-2 max-w-xl text-center text-sm text-rb-500">{extra}</p>}
      {/* The info page's door, as the shared front door draws it. */}
      <nav aria-label="Explorer sections" className="mt-6 flex justify-center">
        <Link href={`${route}/info`} className={NAV_PILL}>
          About {label} on Rails
        </Link>
      </nav>
    </div>
  );
}

/** A Uniswap-family explorer's door: Uniswap V3 and V4 on each chain, and PancakeSwap V3. */
export function UniswapFrontDoor({
  version,
  protocol = "uniswap",
  chainId = 1,
}: {
  version: UniswapVersion;
  protocol?: UniProtocol;
  chainId?: UniChainId;
}) {
  const x = uniExplorer(protocol, chainId, version);
  return (
    <PoolFrontDoor
      id={x.id}
      label={versionLabel(version, protocol)}
      line={FRONT_DOOR.line(version, protocol, chainId)}
      extra={x.deployment.masterChef ? FRONT_DOOR.stakedLine : undefined}
      route={x.route}
    />
  );
}

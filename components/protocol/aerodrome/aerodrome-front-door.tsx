"use client";

// A Slipstream site's front door (N5; rails-ops ui-jobs 566, 578): Uniswap's
// (`PoolFrontDoor`), landing on a wallet's Slipstream positions: Aerodrome on
// Base, Velodrome on Optimism (lib/aerodrome/sites.ts).

import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { AERODROME, type SlipstreamSite } from "@/lib/aerodrome/sites";
import { frontDoorWords } from "@/lib/aerodrome/words";

export function AerodromeFrontDoor({ site = AERODROME }: { site?: SlipstreamSite }) {
  return <PoolFrontDoor id={site.id} label={site.label} line={frontDoorWords(site).line} route={site.route} />;
}

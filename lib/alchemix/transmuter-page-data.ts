// Transmuter position page loader.
// ----------------------------------------------------------------------------
// SERVER-ONLY, for the reason the Alchemist loader gives: it reads rails-server
// with the bearer token. One read, because the route serves the position and
// its whole event stream together: a Transmuter position's life is a stake,
// its pokes, custody moves and at most one claim.
//
// Only an ANSWERED backend with no such position is `missing` (a 404). A read
// that failed hands back an empty result, and the page says the read did not
// land rather than stating an absence.

import { cache } from "react";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { ALCHEMIX_TOKEN_ID } from "@/lib/sources/api/alchemix-position-backend";
import { readAlchemixTransmuterPosition } from "@/lib/sources/api/alchemix-transmuter-backend";
import { isLineOnChain } from "@/lib/alchemix/lines";
import type { ChainId } from "@/lib/shared/chains";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AlchemixTransmuterPositionData } from "@/types/api/alchemix";

const FETCH_TIMEOUT_MS = 8000;

export interface TransmuterPositionRead {
  position: AlchemixTransmuterPositionData<BaseActivityEvent> | null;
  missing: boolean;
}

export const loadTransmuterPosition = cache(
  async (chainId: ChainId, lineKey: string, nftId: string): Promise<TransmuterPositionRead> => {
    // The chain is asserted, never parsed off the key: a line on the other
    // chain is a 404 here, not another explorer's position.
    if (!isLineOnChain(chainId, lineKey) || !ALCHEMIX_TOKEN_ID.test(nftId)) return { position: null, missing: true };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const readerIp = await readerIpFromHeaders();
      const read = await readAlchemixTransmuterPosition(lineKey, nftId, readerIp, controller.signal);
      if (!read.ok) {
        if (read.status === 404) return { position: null, missing: true };
        console.error(`alchemix transmuter: ${lineKey}/${nftId} -> ${read.status} ${read.statusText}`);
        return { position: null, missing: false };
      }
      return { position: read.result.data, missing: false };
    } catch (err) {
      console.error("alchemix transmuter: the read did not land", err);
      return { position: null, missing: false };
    } finally {
      clearTimeout(timer);
    }
  },
);

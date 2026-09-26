// Alchemix V2 position page loader.
// ----------------------------------------------------------------------------
// SERVER-ONLY, for the reason the Alchemist loader gives: it reads rails-server
// with the bearer token. One read, because the route serves the account and its
// whole event stream together.
//
// Only an ANSWERED backend with no such account is `missing` (a 404). A read
// that failed hands back an empty result, and the page says the read did not
// land rather than stating an absence.

import { cache } from "react";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { ALCHEMIX_V2_ACCOUNT, readAlchemixV2Position } from "@/lib/sources/api/alchemix-v2-backend";
import { isV2LineOnChain } from "@/lib/alchemix/lines";
import type { ChainId } from "@/lib/shared/chains";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AlchemixV2PositionData } from "@/types/api/alchemix";

const FETCH_TIMEOUT_MS = 8000;

export interface AlchemixV2PositionRead {
  position: AlchemixV2PositionData<BaseActivityEvent> | null;
  missing: boolean;
}

export const loadAlchemixV2Position = cache(
  async (chainId: ChainId, lineKey: string, account: string): Promise<AlchemixV2PositionRead> => {
    if (!isV2LineOnChain(chainId, lineKey) || !ALCHEMIX_V2_ACCOUNT.test(account)) {
      return { position: null, missing: true };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const readerIp = await readerIpFromHeaders();
      const read = await readAlchemixV2Position(lineKey, account, readerIp, controller.signal);
      if (!read.ok) {
        if (read.status === 404) return { position: null, missing: true };
        console.error(`alchemix v2: ${lineKey}/${account} -> ${read.status} ${read.statusText}`);
        return { position: null, missing: false };
      }
      return { position: read.result.data, missing: false };
    } catch (err) {
      console.error("alchemix v2: the read did not land", err);
      return { position: null, missing: false };
    } finally {
      clearTimeout(timer);
    }
  },
);

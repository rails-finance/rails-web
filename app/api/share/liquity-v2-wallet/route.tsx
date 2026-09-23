// A Liquity V2 WALLET's live share card — what `/ethereum/liquity-v2?q=<holder>`
// unfurls as. Polaris's twin; the note in
// `app/api/share/polaris-wallet/route.tsx` explains why the wallet view's card
// is a route handler rather than an `opengraph-image.tsx`, and why it reads
// the backend in process rather than through this deployment's own proxies.
//
// It reads the same WIRE the page reads, as the scraper: the wallet's first
// page through the /api/troves proxy's own backend read
// (`readTrovesFromBackend`, the same params `fetchTroves` would have sent it),
// and the one branch-price read the trove page's tail makes — both direct to
// RAILS_API_URL with the requester's IP as the reader the box budgets. A name
// resolves through the in-process ENS cache before anything is read, and a
// name nobody holds reads nothing (the proxy, serving the page, still lets the
// backend try its reverse cache for an unresolved name; a card that can only
// ever draw a wallet has no use for that). A malformed `q` costs zero outbound
// requests (scripts/verify/verify-share-abuse.mjs holds the census).

import { positionImage } from "@/lib/share/position-image";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import { trovesQuery } from "@/lib/api/fetch-troves";
import { readTrovesFromBackend } from "@/lib/sources/api/troves-backend";
import { readLiquityV2OracleFromBackend } from "@/lib/sources/api/liquity-v2-oracle-backend";
import { liquityV2HolderCardModel } from "@/lib/liquity/share-card";
import { parseTroveSearch } from "@/lib/liquity-v2/search";
import {
  liquityV2FiltersToFetchParams,
  LIQUITY_V2_LIST_DEFAULTS,
  LIQUITY_V2_ITEMS_PER_PAGE,
} from "@/lib/liquity-v2/list-filter-dimensions";
import { shortSubject } from "@/lib/shared/page-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const readerIp = readerIpFromRequest(req);
  return positionImage({
    session: "liquity-v2",
    load: async () => {
      const { ownerAddress, ownerEns } = parseTroveSearch(q);
      // A trove id, free text, or nothing at all names no wallet.
      if (!ownerAddress && !ownerEns) return null;
      const wallet = ownerAddress ?? (ownerEns ? await resolveEnsAddress(ownerEns) : null);
      if (!wallet) return null;

      // The listing's own fetch params for this search — every status, the
      // page's own size — so the card reads the set the page reads; the owner
      // goes as the resolved address, never as the name.
      const params = liquityV2FiltersToFetchParams({ ...LIQUITY_V2_LIST_DEFAULTS, q }, 1);
      const query = trovesQuery({ ...params, ownerEns: undefined, ownerAddress: wallet });
      const [troves, prices] = await Promise.all([
        readTrovesFromBackend(query, readerIp),
        readLiquityV2OracleFromBackend(readerIp),
      ]);
      if (!troves.ok) return null;
      const rows = troves.data.data ?? [];

      return liquityV2HolderCardModel(
        rows,
        troves.data.pagination?.total ?? rows.length,
        prices,
        LIQUITY_V2_ITEMS_PER_PAGE,
        ownerEns ?? shortSubject(ownerAddress ?? ""),
      );
    },
  });
}

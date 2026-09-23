// A Polaris WALLET's live share card — what `/sepolia/polaris?q=<holder>`
// unfurls as.
// ---------------------------------------------------------------------------
// WHY A ROUTE HANDLER AND NOT AN `opengraph-image.tsx`. A share image is per
// ROUTE: App Router's image convention is a file beside a page, and it is never
// handed `searchParams`. On Polaris the wallet's page IS the listing at
// `?q=<holder>` (the middle path made the wallet view the listing's own
// search), so a file-convention image beside it could only ever render the
// generic roster card. This route takes the same `?q=` instead, and the listing
// page's `generateMetadata` points `og:image` here whenever the search names a
// holder.
//
// It reads the same WIRE the page reads, in process and as the scraper: the
// wallet's first page through the /api/polaris/positions proxy's own backend
// read (`readPolarisPositionsFromBackend`, called directly rather than over
// HTTP back into this deployment), with the requester's IP as the reader the
// box budgets, and the market board off chain through the one-minute memo the
// CDP share card beside it shares. A name resolves through the in-process ENS
// cache before anything is read, and a name nobody holds reads nothing.
// Nothing here is a second interpretation of either — `polarisHolderCardModel`
// maps the holder strip's own adapter output.
//
// It never 500s and never throws: `positionImage` degrades every failure — a
// query naming no holder, a wallet with no CDPs, an ENS that resolves to
// nothing, a backend blip, a stale board — to the explorer's static roster
// card, at 200, with the same 5-minute edge cache. A malformed `q` costs zero
// outbound requests (scripts/verify/verify-share-abuse.mjs holds the census).

import { positionImage } from "@/lib/share/position-image";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import { readPolarisPositionsFromBackend } from "@/lib/sources/api/polaris-positions-backend";
import { polarisHolderCardModel } from "@/lib/polaris/share-card";
import { parsePolarisSearch } from "@/lib/polaris/search";
import {
  polarisFiltersToFetchParams,
  POLARIS_LIST_DEFAULTS,
  POLARIS_ITEMS_PER_PAGE,
} from "@/lib/polaris/list-filter-dimensions";
import { loadPolarisMarketsFromChain } from "@/lib/sources/chain/polaris-position";
import { shortSubject } from "@/lib/shared/page-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const readerIp = readerIpFromRequest(req);
  return positionImage({
    session: "polaris",
    load: async () => {
      const { ownerAddress, ownerEns } = parsePolarisSearch(q);
      // A CDP number, free text, or nothing at all names no wallet — there is
      // no wallet card to draw, so the static roster card is the right answer.
      if (!ownerAddress && !ownerEns) return null;
      // Mainnet ENS is the right registry for a Sepolia holder (same key). A
      // name that resolves to nothing names no holder, so no CDP is theirs —
      // the static card, and no read.
      const wallet = ownerAddress ?? (ownerEns ? await resolveEnsAddress(ownerEns) : null);
      if (!wallet) return null;

      // The listing's own fetch params for this search — every status, the
      // page's own size — so the card reads the set the page reads.
      const params = { ...polarisFiltersToFetchParams({ ...POLARIS_LIST_DEFAULTS, q }, 1), wallet };
      const [page, markets] = await Promise.all([
        readPolarisPositionsFromBackend(params, readerIp),
        loadPolarisMarketsFromChain().catch(() => null),
      ]);
      if (!page.ok) return null;

      return polarisHolderCardModel(
        page.result.data,
        page.result.pagination.total,
        markets,
        POLARIS_ITEMS_PER_PAGE,
        ownerEns ?? shortSubject(ownerAddress ?? ""),
      );
    },
  });
}

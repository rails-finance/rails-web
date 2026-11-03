// The search's index (rails-ops ui-jobs 482): `GET /api/search/index`, one
// compact JSON the home hero's and the wallet panel's search fetch once on
// first focus and match in the browser. Built from stored data only
// (lib/search/index-build.ts) and cached for an hour.

import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { buildSearchIndex } from "@/lib/search/index-build";

const REVALIDATE_SECONDS = 3600;

const cachedIndex = unstable_cache(buildSearchIndex, ["search-index-v3"], { revalidate: REVALIDATE_SECONDS });

export async function GET() {
  const index = await cachedIndex();
  return NextResponse.json(index, {
    headers: {
      "Cache-Control": `public, max-age=300, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
    },
  });
}

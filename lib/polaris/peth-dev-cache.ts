// DEV ONLY (ui-jobs 873): a saved answer of GET /api/polaris/peth/:address,
// so a localhost render reads the route once per address and every re-render
// after reuses the file. Active only with MAP_FIXTURE_DIR set and outside a
// production build; the directory is gitignored (/.map-fixtures/).
//
// `<dir>/<address>.json` is the answer, written at its first read.
// `<dir>/<address>.places.json`, written by hand in ui-jobs 872's shape, gives
// each row's `place` and `places` by transaction hash, and the answer's
// `place_counts`, for a route without 872. It applies only to an answer with
// no places of its own. The rows it placed come back as `handAddedPlaces`,
// and the page names them in a banner.

import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PethPlace, PolarisPethResponse } from "@/lib/sources/api/polaris-peth";

export interface PethDevCacheHit {
  data: PolarisPethResponse;
  /** The rows whose places were added by hand, by transaction hash. */
  handAddedPlaces: string[];
}

export async function readPethDevCache(address: string, live: () => Promise<unknown>): Promise<PethDevCacheHit | null> {
  const dir = process.env.MAP_FIXTURE_DIR;
  if (process.env.NODE_ENV === "production" || !dir) return null;
  const file = join(dir, `${address}.json`);
  if (!existsSync(file)) {
    const got = await live();
    if (!got || typeof got !== "object" || "refused" in got) return null;
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(got));
  }
  const data = JSON.parse(readFileSync(file, "utf8")) as PolarisPethResponse;
  const placesFile = join(dir, `${address}.places.json`);
  const handAddedPlaces: string[] = [];
  if (existsSync(placesFile) && data.rows && data.rows.every((r) => r.places === undefined)) {
    const side = JSON.parse(readFileSync(placesFile, "utf8")) as {
      rows: Record<string, { place: PethPlace | null; places: PethPlace[] }>;
      place_counts: { place: PethPlace; rows: number }[];
    };
    for (const r of data.rows) {
      const p = side.rows[r.tx_hash.toLowerCase()];
      if (!p) continue;
      r.place = p.place;
      r.places = p.places;
      if (p.places.length > 0) handAddedPlaces.push(r.tx_hash.toLowerCase());
    }
    data.place_counts = side.place_counts;
  }
  return { data, handAddedPlaces };
}

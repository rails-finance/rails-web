// The stored history TAIL for one vault position — read here, written here.
// ----------------------------------------------------------------------------
// A row at or below the lane's own `finalized` block never changes, so it may
// be kept. This route is the web tier's half of keeping it: a thin proxy onto
// rails-server's `/api/vaults/positions/:chain/:vault/:holder/tail`, carrying
// the bearer this deployment already holds, exactly as app/api/troves/route.ts
// carries it for a trove page.
//
// GET answers the stored tail or 404 — and a 404 is a fact, not a failure: it
// says nothing has been stored for this position at this loader version, and
// the caller then sweeps the whole life as it always did.
//
// PUT offers a tail to the store. THE STORE IS THE VALIDATOR, not this route:
// it re-sums `rows[].sharesDelta` and refuses a body whose sum is not
// `cutBalance` (422), and refuses a cut lower than the one it already holds
// (409). Both refusals are forwarded verbatim. This route checks only the
// shape it can check without reading the chain — the addresses, the chain, the
// loader version, that every row sits at or below the cut in ascending order,
// and that no row carries a read that did not answer (a `timestamp: 0` or a
// null share price) — so a malformed body is refused before it costs the box a
// round trip.
//
// NOTHING DERIVED IS EVER STORED (plan §3.5). The body is rows and a signed
// sum, both at blocks it names, plus the env var NAME of the lane they were
// read on. No claim, no share of a vault, no USD, no rate, nothing at the head.
//
// The wire calls the cut `cutBlock`; the web type calls it `cut`. The
// translation lives in lib/api/fetch-vault-tail.ts, which is the only client
// of this route — this file forwards the wire's own words.

import { gunzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { AAVE_VAULT_TAIL_VERSION } from "@/lib/shared/vault-holder-timeline";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** `express.json({ limit: "8mb" })` on the store's route (rails-server-onboarding
 *  `api/src/index.ts`). A gzipped body is inflated to no more than this. */
const STORE_BODY_LIMIT = 8 * 1024 * 1024;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const TAIL_CHAINS: readonly string[] = [String(MAINNET_CHAIN_ID), String(BASE_CHAIN_ID)];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The tail is a value at a named block, but the value it is keyed by moves
 *  (a later cut replaces it), and a reader who is about to sweep a head off it
 *  must not be handed a cached one. */
const NO_STORE = { "Cache-Control": "no-store" } as const;

type Coords = { chain: string; vault: string; holder: string; loaderVersion: number };

function coordsOf(request: NextRequest): { coords: Coords } | { error: NextResponse } {
  const sp = request.nextUrl.searchParams;
  const chain = sp.get("chain") ?? "1";
  const vault = (sp.get("vault") ?? "").toLowerCase();
  const holder = (sp.get("holder") ?? "").toLowerCase();
  const loaderVersion = Number(sp.get("loaderVersion") ?? AAVE_VAULT_TAIL_VERSION);

  // The chains whose vault histories the store keeps. A chain absent here is
  // refused rather than forwarded: a 404 from the store means "nothing stored
  // for this position", and answering that for a chain with no table at all
  // would say the wrong thing.
  if (!TAIL_CHAINS.includes(chain))
    return {
      error: NextResponse.json(
        { error: `No vault history store exists for chain ${chain}. Stored chains: ${TAIL_CHAINS.join(", ")}` },
        { status: 400 },
      ),
    };
  if (!ADDRESS_RE.test(vault))
    return { error: NextResponse.json({ error: "vault must be a 20-byte address" }, { status: 400 }) };
  if (!ADDRESS_RE.test(holder))
    return { error: NextResponse.json({ error: "holder must be a 20-byte address" }, { status: 400 }) };
  if (!Number.isInteger(loaderVersion) || loaderVersion < 1)
    return { error: NextResponse.json({ error: "loaderVersion must be a positive integer" }, { status: 400 }) };

  return { coords: { chain, vault, holder, loaderVersion } };
}

const backendUrl = (c: Coords) => `${RAILS_API_URL}/api/vaults/positions/${c.chain}/${c.vault}/${c.holder}/tail`;

export async function GET(request: NextRequest) {
  const parsed = coordsOf(request);
  if ("error" in parsed) return parsed.error;
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const readerIp = readerIpFromRequest(request);
  try {
    const url = `${backendUrl(parsed.coords)}?loaderVersion=${parsed.coords.loaderVersion}`;
    const response = await fetch(url, createAuthFetchOptions({ cache: "no-store" }, readerIp));
    // 404 is the store saying it holds nothing for this key — forwarded as
    // itself, because "nothing stored" and "the store did not answer" are
    // different facts and the caller treats them the same way only by accident.
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": "application/json", ...NO_STORE },
    });
  } catch (error) {
    console.error("Error reading a vault history tail from backend:", error);
    return NextResponse.json({ error: "Failed to read the stored tail" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const parsed = coordsOf(request);
  if ("error" in parsed) return parsed.error;
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // A gzipped body is how `putVaultTail` sends a tail (lib/api/fetch-vault-tail.ts
  // says why: Vercel's 4.5 MB request limit). It is inflated here, to no more
  // than the store's own 8 MB, and forwarded as plain JSON.
  let body: Record<string, unknown>;
  try {
    const gzip = /gzip/i.test(request.headers.get("content-encoding") ?? "");
    const raw = Buffer.from(await request.arrayBuffer());
    let text: string;
    try {
      text = (gzip ? gunzipSync(raw, { maxOutputLength: STORE_BODY_LIMIT }) : raw).toString("utf8");
    } catch (error) {
      if ((error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE")
        return NextResponse.json({ error: "Body is larger than the store accepts" }, { status: 413 });
      throw error;
    }
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const shapeError = tailShapeError(body, parsed.coords);
  if (shapeError) return NextResponse.json({ error: "Validation error", details: [shapeError] }, { status: 400 });

  const readerIp = readerIpFromRequest(request);
  try {
    const response = await fetch(
      backendUrl(parsed.coords),
      createAuthFetchOptions(
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        },
        readerIp,
      ),
    );
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": "application/json", ...NO_STORE },
    });
  } catch (error) {
    console.error("Error storing a vault history tail:", error);
    return NextResponse.json({ error: "Failed to store the tail" }, { status: 500 });
  }
}

/** What this route can check without a chain read. The SUM is not checked here
 *  — the store re-computes it, which is the check that matters, and repeating
 *  it in the caller's own process would prove nothing about what was stored. */
function tailShapeError(
  body: Record<string, unknown>,
  coords: Coords,
): { field: string; message: string; code: string } | null {
  const bad = (field: string, message: string) => ({ field, message, code: "SHAPE" });

  if (String(body.vault ?? "").toLowerCase() !== coords.vault) return bad("vault", "body vault is not the URL's vault");
  if (String(body.holder ?? "").toLowerCase() !== coords.holder)
    return bad("holder", "body holder is not the URL's holder");
  if (Number(body.chainId) !== Number(coords.chain)) return bad("chainId", "body chainId is not the URL's chain");
  if (Number(body.loaderVersion) !== coords.loaderVersion)
    return bad("loaderVersion", "body loaderVersion is not the URL's loaderVersion");

  const cut = Number(body.cutBlock);
  if (!Number.isInteger(cut) || cut <= 0) return bad("cutBlock", "cutBlock must be a positive block number");
  if (typeof body.cutBalance !== "string" || !/^-?\d+$/.test(body.cutBalance))
    return bad("cutBalance", "cutBalance must be a raw integer in a decimal string");
  if (typeof body.lane !== "string" || !body.lane) return bad("lane", "lane must be the env var NAME of the lane");

  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) return bad("rows", "rows must be a non-empty array");
  // A stored row is never read again, so a read that did not answer must not
  // reach the store. `timestamp: 0` is the placeholder for a block whose time
  // did not answer, and a null share price is a `convertToAssets` that did
  // not; both loaders cut a chunk below either and never offer one.
  let previous = -1;
  let previousIndex = -1;
  for (const row of rows as {
    blockNumber?: unknown;
    logIndex?: unknown;
    timestamp?: unknown;
    sharePriceAtBlock?: unknown;
  }[]) {
    const block = Number(row?.blockNumber);
    const index = Number(row?.logIndex);
    if (!Number.isInteger(block) || block <= 0) return bad("rows", "every row needs a block number");
    if (block > cut) return bad("rows", `a row at block ${block} is above the cut ${cut}`);
    if (!(Number(row.timestamp) > 0)) return bad("rows", `the row at block ${block} has no block timestamp`);
    if (row.sharePriceAtBlock == null) return bad("rows", `the row at block ${block} has no share price`);
    if (block < previous || (block === previous && index < previousIndex))
      return bad("rows", "rows must be ascending by (blockNumber, logIndex)");
    previous = block;
    previousIndex = index;
  }
  return null;
}

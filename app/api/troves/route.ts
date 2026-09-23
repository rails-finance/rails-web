import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { readTrovesFromBackend } from "@/lib/sources/api/troves-backend";

// The Liquity V2 trove listing proxy. This route owns VALIDATION — every 400
// below is a response, and belongs here. The translation onto the backend's
// params, the ENS forward-resolution and the read itself live in
// lib/sources/api/troves-backend.ts, which the wallet share-image route also
// calls — in process, with the scraper's IP as the reader — instead of
// hopping back through here.

// Valid parameter values for validation.
const VALID_SORT_FIELDS = [
  "debt",
  "coll",
  "collUsd",
  "ratio",
  "interestRate",
  "created",
  "lastActivity",
  "redemptions",
  "transactions",
  "peakDebt",
  "peakColl",
  "batchRate",
  "managementFee",
];
const VALID_SORT_ORDERS = ["asc", "desc"];

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  const searchParams = request.nextUrl.searchParams;

  // The parameters validation reads. The rest are read by the backend read.
  const ownerAddress = searchParams.get("ownerAddress");
  const ownerEns = searchParams.get("ownerEns");
  const activeWithin = searchParams.get("activeWithin");
  const createdWithin = searchParams.get("createdWithin");
  const batchOnly = searchParams.get("batchOnly") === "true";
  const individualOnly = searchParams.get("individualOnly") === "true";
  const sortBy = searchParams.get("sortBy");
  const sortOrder = searchParams.get("sortOrder");
  const limit = searchParams.get("limit");
  const offset = searchParams.get("offset");

  // Validate sort parameters
  if (sortBy && !VALID_SORT_FIELDS.includes(sortBy)) {
    return NextResponse.json(
      { error: `Invalid sortBy parameter. Valid values: ${VALID_SORT_FIELDS.join(", ")}` },
      { status: 400 },
    );
  }

  if (sortOrder && !VALID_SORT_ORDERS.includes(sortOrder)) {
    return NextResponse.json({ error: "Invalid sortOrder parameter. Valid values: asc, desc" }, { status: 400 });
  }

  // Validate mutual exclusivity
  if (batchOnly && individualOnly) {
    return NextResponse.json({ error: "batchOnly and individualOnly cannot both be true" }, { status: 400 });
  }

  // Validate numeric parameters
  if (activeWithin && isNaN(Number(activeWithin))) {
    return NextResponse.json({ error: "activeWithin must be a valid number (milliseconds)" }, { status: 400 });
  }

  if (createdWithin && isNaN(Number(createdWithin))) {
    return NextResponse.json({ error: "createdWithin must be a valid number (milliseconds)" }, { status: 400 });
  }

  if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 1000)) {
    return NextResponse.json({ error: "limit must be a number between 1 and 1000" }, { status: 400 });
  }

  if (offset && (isNaN(Number(offset)) || Number(offset) < 0)) {
    return NextResponse.json({ error: "offset must be a non-negative number" }, { status: 400 });
  }

  // Validate Ethereum address format
  if (ownerAddress && !/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) {
    return NextResponse.json({ error: "Invalid Ethereum address format" }, { status: 400 });
  }

  // Validate ENS name format - basic check for .eth suffix and minimum length
  if (ownerEns) {
    const ensLower = ownerEns.toLowerCase();
    if (!ensLower.endsWith(".eth") || ensLower.length < 7) {
      // min 3 chars + .eth
      return NextResponse.json({ error: "Invalid ENS name format" }, { status: 400 });
    }
  }

  try {
    const read = await readTrovesFromBackend(searchParams, readerIp, request.signal);
    if (!read.ok) {
      console.error(`Backend API error: ${read.status} ${read.statusText}`);
      return NextResponse.json({ error: `Backend error: ${read.statusText}` }, { status: read.status });
    }
    return NextResponse.json(read.data, { headers: proxyCacheControl(read.upstream, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching troves from backend:", error);
    return NextResponse.json({ error: "Failed to fetch troves" }, { status: 500 });
  }
}

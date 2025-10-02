import { NextRequest, NextResponse } from "next/server";
import { TrovesResponse } from "@/types/api/trove";
import { mockTroveData } from "@/lib/mockData";

const RAILS_API_URL = process.env.RAILS_API_URL;

// Valid parameter values for validation
const VALID_STATUSES = ["open", "closed", "liquidated"];
const VALID_COLLATERAL_TYPES = ["WETH", "wstETH", "rETH"];
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
  const searchParams = request.nextUrl.searchParams;

  // Extract parameters
  const troveId = searchParams.get("troveId");
  const status = searchParams.get("status");
  const collateralType = searchParams.get("collateralType");
  const ownerAddress = searchParams.get("ownerAddress");
  const ownerEns = searchParams.get("ownerEns");
  const activeWithin = searchParams.get("activeWithin");
  const createdWithin = searchParams.get("createdWithin");
  const batchOnlyParam = searchParams.get("batchOnly");
  const individualOnlyParam = searchParams.get("individualOnly");
  const hasRedemptionsParam = searchParams.get("hasRedemptions");

  // Parse boolean parameters
  const batchOnly = batchOnlyParam === "true";
  const individualOnly = individualOnlyParam === "true";
  let hasRedemptions: boolean | undefined;
  if (hasRedemptionsParam === "true") hasRedemptions = true;
  if (hasRedemptionsParam === "false") hasRedemptions = false;
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

  // Return mock data for specific fake trove ID
  if (troveId === "mock-all-events") {
    const mockCollateral = collateralType || "WETH";
    const customizedMock = {
      ...mockTroveData,
      troveId: troveId,
      collateralType: mockCollateral,
      backedBy: {
        ...mockTroveData.backedBy,
        symbol: mockCollateral,
      },
    };

    return NextResponse.json({
      data: [customizedMock],
      pagination: {
        total: 1,
        limit: 10,
        page: 1,
      },
    });
  }

  // Original API logic
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    // Build clean query params for backend
    const backendParams = new URLSearchParams();

    // Add parameters with inline validation
    if (troveId) backendParams.set("troveId", troveId);
    if (status && VALID_STATUSES.includes(status)) {
      backendParams.set("status", status);
    }
    if (collateralType && VALID_COLLATERAL_TYPES.includes(collateralType)) {
      backendParams.set("collateralType", collateralType);
    }
    if (ownerAddress) backendParams.set("ownerAddress", ownerAddress);
    if (ownerEns) backendParams.set("ownerEns", ownerEns);
    if (activeWithin) backendParams.set("activeWithin", activeWithin);
    if (createdWithin) backendParams.set("createdWithin", createdWithin);
    // Pass boolean parameters with values to backend
    if (batchOnly) backendParams.set("batchOnly", "true");
    if (individualOnly) backendParams.set("individualOnly", "true");
    if (hasRedemptions !== undefined) {
      backendParams.set("hasRedemptions", String(hasRedemptions));
    }
    if (sortBy) backendParams.set("sortBy", sortBy);
    if (sortOrder) backendParams.set("sortOrder", sortOrder);
    if (limit) backendParams.set("limit", limit);
    if (offset) backendParams.set("offset", offset);

    const url = `${RAILS_API_URL}/api/troves${backendParams.toString() ? `?${backendParams.toString()}` : ""}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }

    const data: TrovesResponse = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching troves from backend:", error);
    return NextResponse.json({ error: "Failed to fetch troves" }, { status: 500 });
  }
}

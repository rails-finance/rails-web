import { NextRequest, NextResponse } from "next/server";
import { TrovesResponse } from "@/types/api/trove";
import { mockTroveData } from "@/lib/mockData";

const RAILS_API_URL = process.env.RAILS_API_URL;

// Valid parameter values for validation
const VALID_STATUSES = ['open', 'closed', 'liquidated'];
const VALID_COLLATERAL_TYPES = ['WETH', 'wstETH', 'rETH'];
const VALID_SORT_FIELDS = [
  'debt', 'coll', 'collUsd', 'ratio', 'interestRate', 'created',
  'lastActivity', 'redemptions', 'transactions', 'peakDebt', 'peakColl',
  'batchRate', 'managementFee'
];
const VALID_SORT_ORDERS = ['asc', 'desc'];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  // Extract and validate parameters
  const troveId = searchParams.get('troveId');
  const status = searchParams.get('status');
  const validStatus = status && VALID_STATUSES.includes(status) ? status : null;
  const collateralType = searchParams.get('collateralType');
  const validCollateralType = collateralType && VALID_COLLATERAL_TYPES.includes(collateralType) ? collateralType : null;
  const ownerAddress = searchParams.get('ownerAddress');
  const activeWithin = searchParams.get('activeWithin');
  const createdWithin = searchParams.get('createdWithin');
  const troveType = searchParams.get('troveType');
  const batchOnly = troveType === 'batch' || searchParams.get('batchOnly') === 'true';
  const individualOnly = troveType === 'individual' || searchParams.get('individualOnly') === 'true';
  const hasRedemptions = searchParams.get('hasRedemptions') === 'true';
  const sortBy = searchParams.get('sortBy');
  const sortOrder = searchParams.get('sortOrder');
  const limit = searchParams.get('limit');
  const offset = searchParams.get('offset');
  
  // Validate sort parameters
  if (sortBy && !VALID_SORT_FIELDS.includes(sortBy)) {
    return NextResponse.json(
      { error: `Invalid sortBy parameter. Valid values: ${VALID_SORT_FIELDS.join(', ')}` },
      { status: 400 }
    );
  }
  
  if (sortOrder && !VALID_SORT_ORDERS.includes(sortOrder)) {
    return NextResponse.json(
      { error: 'Invalid sortOrder parameter. Valid values: asc, desc' },
      { status: 400 }
    );
  }
  
  // Validate mutual exclusivity
  if (batchOnly && individualOnly) {
    return NextResponse.json(
      { error: 'batchOnly and individualOnly cannot both be true' },
      { status: 400 }
    );
  }
  
  // Validate numeric parameters
  if (activeWithin && isNaN(Number(activeWithin))) {
    return NextResponse.json(
      { error: 'activeWithin must be a valid number (milliseconds)' },
      { status: 400 }
    );
  }
  
  if (createdWithin && isNaN(Number(createdWithin))) {
    return NextResponse.json(
      { error: 'createdWithin must be a valid number (milliseconds)' },
      { status: 400 }
    );
  }
  
  if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 1000)) {
    return NextResponse.json(
      { error: 'limit must be a number between 1 and 1000' },
      { status: 400 }
    );
  }
  
  if (offset && (isNaN(Number(offset)) || Number(offset) < 0)) {
    return NextResponse.json(
      { error: 'offset must be a non-negative number' },
      { status: 400 }
    );
  }
  
  // Validate Ethereum address format
  if (ownerAddress && !/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) {
    return NextResponse.json(
      { error: 'Invalid Ethereum address format' },
      { status: 400 }
    );
  }
  
  // Return mock data for specific fake trove ID
  if (troveId === "mock-all-events") {
    const mockCollateral = validCollateralType || 'WETH';
    const customizedMock = {
      ...mockTroveData,
      troveId: troveId,
      collateralType: mockCollateral,
      backedBy: {
        ...mockTroveData.backedBy,
        symbol: mockCollateral,
      }
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
    
    // Add all validated parameters
    if (troveId) backendParams.set('troveId', troveId);
    if (validStatus) backendParams.set('status', validStatus);
    if (validCollateralType) backendParams.set('collateralType', validCollateralType);
    if (ownerAddress) backendParams.set('ownerAddress', ownerAddress);
    if (activeWithin) backendParams.set('activeWithin', activeWithin);
    if (createdWithin) backendParams.set('createdWithin', createdWithin);
    if (batchOnly) backendParams.set('batchOnly', 'true');
    if (individualOnly) backendParams.set('individualOnly', 'true');
    if (hasRedemptions) backendParams.set('hasRedemptions', 'true');
    if (sortBy) backendParams.set('sortBy', sortBy);
    if (sortOrder) backendParams.set('sortOrder', sortOrder);
    if (limit) backendParams.set('limit', limit);
    if (offset) backendParams.set('offset', offset);
    
    const url = `${RAILS_API_URL}/api/troves${backendParams.toString() ? `?${backendParams.toString()}` : ""}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Backend error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data: TrovesResponse = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching troves from backend:", error);
    return NextResponse.json({ error: "Failed to fetch troves" }, { status: 500 });
  }
}

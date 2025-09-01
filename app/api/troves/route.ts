import { NextRequest, NextResponse } from "next/server";
import { TrovesResponse, TroveData } from "@/types/api/trove";
import { mockTroveData } from "@/lib/mockData";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const troveId = searchParams.get('troveId');
  const collateralType = searchParams.get('collateralType');
  
  // Return mock data for specific fake trove ID
  if (troveId === "mock-all-events") {
    const customizedMock = {
      ...mockTroveData,
      troveId: troveId,
      collateralType: collateralType || "WETH",
      backedBy: {
        ...mockTroveData.backedBy,
        symbol: collateralType || "WETH",
      }
    };
    
    return NextResponse.json({
      data: [customizedMock],
      pagination: {
        total: 1,
        limit: 10,
        offset: 0,
        hasMore: false,
      },
    });
  }

  // Original API logic
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const url = `${RAILS_API_URL}/api/troves${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

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

import { NextRequest, NextResponse } from "next/server";
import { TroveStateResponse } from "@/types/api/troveState";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ collateralType: string; troveId: string }> },
) {
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 });
  }

  try {
    const { collateralType, troveId } = await context.params;
    const url = `${RAILS_API_URL}/api/trove/state/${collateralType}/${troveId}`;

    const response = await fetch(url, createAuthFetchOptions());

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }

    const data: TroveStateResponse = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching trove state from backend:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch trove state" }, { status: 500 });
  }
}

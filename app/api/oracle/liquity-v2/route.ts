import { NextResponse } from "next/server";
import { OraclePricesResponse } from "@/types/api/oracle";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET() {
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 });
  }

  try {
    const url = `${RAILS_API_URL}/api/oracle/liquity-v2`;

    const response = await fetch(url, createAuthFetchOptions());

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }

    const data: OraclePricesResponse = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching oracle prices from backend:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch oracle prices" }, { status: 500 });
  }
}

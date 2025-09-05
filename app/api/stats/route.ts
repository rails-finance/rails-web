import { NextRequest, NextResponse } from "next/server";
import { StatsResponse } from "@/types/api/stats";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const url = `${RAILS_API_URL}/api/stats${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

    const response = await fetch(url, {
      next: { revalidate: 30 } // Cache for 30 seconds
    });

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Backend error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data: StatsResponse = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching stats from backend:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
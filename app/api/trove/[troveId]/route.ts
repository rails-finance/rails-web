import { NextRequest, NextResponse } from "next/server";
import { TransactionTimeline } from "@/types/api/troveHistory";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest, context: { params: Promise<{ troveId: string }> }) {
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const { troveId } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const url = `${RAILS_API_URL}/api/trove/${troveId}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Backend error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data: TransactionTimeline = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching timeline from backend:", error);
    return NextResponse.json({ error: "Failed to fetch timeline" }, { status: 500 });
  }
}

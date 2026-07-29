import { NextRequest, NextResponse } from "next/server";
import {
  generateDailyPlan,
  getLocalDateString,
} from "@/app/lib/planner/generator";

/**
 * Endpoint to generate today's daily plan.
 * POST /api/planner/today
 * Optionally accepts a JSON body: { "date": "YYYY-MM-DD" }
 */
export async function POST(req: NextRequest) {
  try {
    let dateStr = getLocalDateString();

    try {
      const body = await req.json();
      if (body && typeof body.date === "string" && body.date.trim()) {
        dateStr = body.date.trim();
      }
    } catch {
      // Body is empty or not JSON, default to today's local date
    }

    const plan = await generateDailyPlan(dateStr);

    return NextResponse.json({
      success: true,
      message: `Daily plan generated and saved for ${dateStr}`,
      plan,
    });
  } catch (error: any) {
    console.error("Error in POST /api/planner/today:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || String(error),
      },
      { status: 500 }
    );
  }
}

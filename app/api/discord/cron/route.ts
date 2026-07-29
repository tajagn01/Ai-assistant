import { NextRequest, NextResponse } from "next/server";
import { sendDailyPlanToDiscord } from "@/app/lib/discord/scheduler";

/**
 * Scheduled Cron Job Endpoint (Vercel Cron calls this daily at 7:00 AM)
 * GET /api/discord/cron
 */
export async function GET(req: NextRequest) {
  // Validate authorization token if configured in Vercel environment
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await sendDailyPlanToDiscord();
    return NextResponse.json({
      success: true,
      message: "Daily plan generated and dispatched to Discord successfully.",
    });
  } catch (error: any) {
    console.error("Cron failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || String(error),
      },
      { status: 500 }
    );
  }
}

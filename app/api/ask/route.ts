import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/app/lib/planner/context";
import { askAI } from "@/app/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    const context = await buildContext(question);

    const answer = await askAI(question, context);

    return NextResponse.json({
      answer,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message || String(error),
      stack: error.stack,
    }, { status: 500 });
  }
}
import { readFile } from "@/app/lib/github/read";
import { NextResponse } from "next/server";

export async function GET() {
  const markdown = await readFile(
    "Knowledge/System Design/05 - Reliability/Circuit Breaker.md"
  );
  return NextResponse.json({
    markdown,
  });
}
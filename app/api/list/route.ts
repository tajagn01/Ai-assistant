import { listFolder } from "@/app/lib/github/list";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const data = await listFolder("Knowledge/System Design");
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

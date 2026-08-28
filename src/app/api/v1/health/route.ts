import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(): NextResponse {
  return NextResponse.json({
    data: { service: "dejaview", status: "ok" },
    meta: { apiVersion: "v1" },
  });
}

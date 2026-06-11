import { NextRequest, NextResponse } from "next/server";
import { BACKEND_API, backendUnavailable, readBackendJson } from "../_backend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND_API}/api/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readBackendJson(res);
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return backendUnavailable(
      "Backend tidak dapat dihubungi. Pastikan api_server.py berjalan.",
      error,
    );
  }
}

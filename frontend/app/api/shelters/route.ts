import { NextResponse } from "next/server";
import { BACKEND_API, backendUnavailable, readBackendJson } from "../_backend";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_API}/api/shelters`, { cache: "no-store" });
    const data = await readBackendJson(res);
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return backendUnavailable("Backend tidak dapat dihubungi.", error);
  }
}

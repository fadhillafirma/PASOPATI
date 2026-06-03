import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
const API = process.env.BACKEND_URL || "http://localhost:8080";

export async function GET() {
  try {
    const res = await fetch(`${API}/api/shelters`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Backend tidak dapat dihubungi." }, { status: 503 });
  }
}

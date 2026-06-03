import { NextRequest, NextResponse } from "next/server";

const API = process.env.BACKEND_URL || "http://localhost:8080";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${API}/api/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend tidak dapat dihubungi. Pastikan api_server.py berjalan." }, { status: 503 });
  }
}

import { NextResponse } from "next/server";

export const BACKEND_API = process.env.BACKEND_URL || "http://127.0.0.1:8080";

export async function readBackendJson(res: Response) {
  const text = await res.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      error: `Backend mengembalikan respons non-JSON: ${text.slice(0, 200)}`,
    };
  }
}

export function backendUnavailable(message: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return NextResponse.json(
    {
      error: message,
      detail,
      backend_url: BACKEND_API,
    },
    { status: 503 },
  );
}

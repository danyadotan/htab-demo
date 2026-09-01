import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    product: "HTAB",
    version: "0.1.0",
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    amplitudeConfigured: Boolean(process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY),
  });
}



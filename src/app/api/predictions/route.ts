import { Muna } from "muna"
import { type NextRequest, NextResponse } from "next/server"

export async function POST (request: NextRequest) {
  const body = await request.json();
  const muna = new Muna({ accessKey: process.env.MUNA_ACCESS_KEY });
  const prediction = await muna.predictions.create(body);
  return Response.json(prediction);
}
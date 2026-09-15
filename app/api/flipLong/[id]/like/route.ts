// app/api/flipLong/[id]/like/route.ts — Like / Unlike FlipLong Video API by ID
import { NextRequest, NextResponse } from "next/server";
import { POST as handleLike, GET as handleGetLike } from "../like/route";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  let paramId: string | undefined;
  if (context?.params) {
    const p = await Promise.resolve(context.params);
    paramId = p?.id;
  }
  if (!paramId) {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const flipIdx = parts.indexOf("flipLong");
    if (flipIdx !== -1 && parts[flipIdx + 1] && parts[flipIdx + 1] !== "like") {
      paramId = parts[flipIdx + 1];
    }
  }

  // Clone or forward request with id injected if needed
  if (paramId) {
    const body = await req.json().catch(() => ({}));
    const modifiedBody = { ...body, id: paramId, videoId: paramId };
    const modifiedReq = new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(modifiedBody),
    });
    return handleLike(modifiedReq);
  }

  return handleLike(req);
}

export async function GET(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  let paramId: string | undefined;
  if (context?.params) {
    const p = await Promise.resolve(context.params);
    paramId = p?.id;
  }
  if (paramId) {
    const url = new URL(req.url);
    url.searchParams.set("id", paramId);
    const modifiedReq = new NextRequest(url.toString(), {
      method: "GET",
      headers: req.headers,
    });
    return handleGetLike(modifiedReq);
  }

  return handleGetLike(req);
}

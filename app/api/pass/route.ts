import { NextRequest, NextResponse } from "next/server";
import { passPdfForToken } from "@/lib/booking/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves the attendee's Event Pass PDF, regenerated on demand from the sheet.
// Token-gated (18-byte random rid) — used by the WhatsApp pass link and any
// "view my pass" link. Returns 404 until the pass has been issued (confirmed).
export async function GET(req: NextRequest) {
  const rid = new URL(req.url).searchParams.get("rid");
  if (!rid) {
    return NextResponse.json({ error: "missing_rid" }, { status: 400 });
  }
  const pass = await passPdfForToken(rid);
  if (!pass) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return new NextResponse(Buffer.from(pass.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pass.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

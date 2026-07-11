import { NextRequest, NextResponse } from "next/server";
import { lookupLead } from "@/lib/booking/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Powers the landing page prefill.
//   { rid }   → they came from our WhatsApp/email link (fully identified)
//   { phone } → they came from Meta's thank-you button (matched on last 10 digits)
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ found: false, alreadyRegistered: false }, { status: 400 });
  }
  const rid = typeof body.rid === "string" ? body.rid.trim() : undefined;
  const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
  if (!rid && !phone) {
    return NextResponse.json({ found: false, alreadyRegistered: false }, { status: 400 });
  }
  try {
    return NextResponse.json(await lookupLead({ rid, phone }));
  } catch (e) {
    console.error("[/api/lookup]", e);
    return NextResponse.json({ found: false, alreadyRegistered: false }, { status: 500 });
  }
}

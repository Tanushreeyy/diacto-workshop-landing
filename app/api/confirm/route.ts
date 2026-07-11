import { NextRequest, NextResponse } from "next/server";
import { confirmByToken, confirmOrganic } from "@/lib/booking/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  try {
    // Token path — the ad lead clicked their personalised link.
    if (typeof body.token === "string" && body.token) {
      const r = await confirmByToken(body.token);
      if (!r.ok) {
        return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 500 });
      }
      return NextResponse.json(r);
    }

    // Organic path — capture form on the landing page.
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const company = String(body.company ?? "").trim();

    if (!name || (!email && !phone)) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }
    if (email && !EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, error: "bad_email" }, { status: 400 });
    }

    const r = await confirmOrganic({ name, email, phone, company });
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e) {
    console.error("[/api/confirm]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

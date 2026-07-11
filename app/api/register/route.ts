import { NextRequest, NextResponse } from "next/server";
import { registerLead } from "@/lib/booking/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// The landing-page form submit. One call = a full registration:
// row in the sheet → Event Pass → WA-5 + EM-5 → Slack.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const s = (k: string) => String(body[k] ?? "").trim();
  const input = {
    name: s("name"),
    designation: s("designation"),
    company: s("company"),
    location: s("location"),
    employeeCount: s("employeeCount"),
    phone: s("phone"),
    email: s("email"),
  };

  const missing = (
    ["name", "designation", "company", "location", "employeeCount", "phone", "email"] as const
  ).filter((k) => !input[k]);
  if (missing.length) {
    return NextResponse.json(
      { ok: false, error: "missing_fields", fields: missing },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(input.email)) {
    return NextResponse.json({ ok: false, error: "bad_email" }, { status: 400 });
  }
  if (input.phone.replace(/\D/g, "").length < 10) {
    return NextResponse.json({ ok: false, error: "bad_phone" }, { status: 400 });
  }

  try {
    const r = await registerLead(input);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e) {
    console.error("[/api/register]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

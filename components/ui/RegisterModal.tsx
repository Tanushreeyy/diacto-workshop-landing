"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Select from "./Select";

interface Props {
  rid: string | null;
  onClose: () => void;
  onRegistered: () => void;
}

// Mirror the Instant Form's choices exactly — the same person may answer in both
// places, and two vocabularies for one field make the sheet unsortable.
const DESIGNATIONS = ["Founder/Director/CEO", "Co-Founder/COO/CFO", "Others"];
const EMPLOYEE_COUNTS = ["1-20", "21-50", "51-200", "201 & Above"];

interface Fields {
  name: string;
  designation: string;
  company: string;
  employeeCount: string;
  location: string;
  phone: string;
  email: string;
  expectations: string;
}
const EMPTY: Fields = {
  name: "",
  designation: "",
  company: "",
  employeeCount: "",
  location: "",
  phone: "",
  email: "",
  expectations: "",
};

// The qualifying answers moved to the Meta form, so we ask for them here only
// when we don't already have them. That is decided PER FIELD, not per lead:
// leads captured by the older form are "known" yet have no designation/company,
// and hiding the fields for them would drop the answers on the floor.
type Qualifier = "designation" | "company" | "employeeCount" | "location";
const QUALIFIERS: Qualifier[] = ["designation", "company", "employeeCount", "location"];

type Step = "loading" | "phone" | "form" | "already" | "success";

/**
 * Registration.
 *   • Arrived via our WhatsApp/email link (?rid) → looked up instantly, prefilled.
 *   • Arrived via Meta's thank-you button (no rid) → they type their phone, we
 *     match it (last 10 digits) and prefill from the Meta lead.
 *   • Already registered → we say so and re-offer the pass instead of duplicating.
 * Prefilled values stay EDITABLE — Meta's profile email is often stale, and a
 * pass sent to a dead inbox is worse than no pass.
 */
export default function RegisterModal({ rid, onClose, onRegistered }: Props) {
  // Portalled to <body>. The CTA lives inside <Reveal>, which sets
  // `transform` + `will-change` — either of those makes an ancestor the
  // containing block for position:fixed, which would pin this modal inside the
  // hero instead of the viewport. The portal escapes that entirely.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [step, setStep] = useState<Step>(rid ? "loading" : "phone");
  const [f, setF] = useState<Fields>(EMPTY);
  const [phoneInput, setPhoneInput] = useState("");
  const [known, setKnown] = useState(false);
  // Which qualifying answers we already hold, and so must not ask for again.
  const [have, setHave] = useState<Record<Qualifier, boolean>>({
    designation: false,
    company: false,
    employeeCount: false,
    location: false,
  });
  const [already, setAlready] = useState<{ regId: string; passUrl?: string } | null>(null);
  const [success, setSuccess] = useState<{ name: string; regId: string; passUrl?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const applyLookup = useCallback((data: any, typedPhone?: string) => {
    if (data?.alreadyRegistered) {
      setAlready({ regId: data.regId ?? "", passUrl: data.passUrl });
      setStep("already");
      return;
    }
    const p = data?.prefill ?? {};
    setKnown(!!data?.found);
    setF({
      name: p.name || "",
      designation: p.designation || "",
      company: p.company || "",
      employeeCount: p.employeeCount || "",
      location: p.location || "",
      phone: p.phone || typedPhone || "",
      email: p.email || "",
      expectations: "",
    });
    setHave({
      designation: !!p.designation,
      company: !!p.company,
      employeeCount: !!p.employeeCount,
      location: !!p.location,
    });
    setStep("form");
  }, []);

  // Token path: identify immediately, no phone step at all.
  useEffect(() => {
    if (!rid) return;
    (async () => {
      try {
        const res = await fetch("/api/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rid }),
        });
        const data = await res.json();
        // Unknown token — a link truncated by WhatsApp, a bad copy-paste, a stale
        // one, or someone typing nonsense. Don't strand them on a blank 7-field
        // form: fall back to the phone step so a genuine lead can still be
        // matched and prefilled from one field they already know by heart.
        if (!data?.found) {
          setStep("phone");
          return;
        }
        applyLookup(data);
      } catch {
        setStep("phone");
      }
    })();
  }, [rid, applyLookup]);

  useEffect(() => {
    if (step === "form" || step === "phone") firstRef.current?.focus();
  }, [step]);

  const set =
    (k: keyof Fields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value }));

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (phoneInput.replace(/\D/g, "").length < 10) {
      setErr("Please enter a valid phone number.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput }),
      });
      applyLookup(await res.json(), phoneInput);
    } catch {
      applyLookup({ found: false }, phoneInput);
    } finally {
      setLoading(false);
    }
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    // Only the fields actually on screen: a qualifier we already have is hidden,
    // therefore blank, and demanding it would block the lead on an invisible input.
    // Expectations is deliberately absent: it's optional. It sits at the very last
    // step before a confirmed seat, and a required free-text box there costs more
    // completions than the answer is worth.
    const required: (keyof Fields)[] = [
      "name",
      "phone",
      "email",
      ...QUALIFIERS.filter((q) => !have[q]),
    ];
    if (required.some((k) => !f[k].trim())) {
      setErr("Please fill in all fields.");
      return;
    }
    if (f.phone.replace(/\D/g, "").length < 10) {
      setErr("Please enter a valid phone number.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) {
      setErr("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, rid: rid ?? undefined }),
      });
      const d = await res.json();
      if (d.ok) {
        setSuccess({ name: d.name || f.name, regId: d.regId || "", passUrl: d.passUrl });
        setStep(d.already ? "already" : "success");
        onRegistered();
      } else if (d.error === "bad_email") setErr("Please enter a valid email address.");
      else if (d.error === "bad_phone") setErr("Please enter a valid phone number.");
      // Deliberately not "please try again". When this fires the failure is on
      // our side — a renamed sheet tab, a read-only service account — and it will
      // fail again just as fast, so inviting a retry wastes the person's time and
      // makes it look like they did something wrong.
      else setErr("We've updated our registration process. Our team will contact you shortly.");
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 font-sans text-sm " +
    "text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30";
  const label = "mb-1 block font-sans text-xs font-semibold text-brand-charcoal";

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Register for the workshop"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl md:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "loading" && (
          <p className="py-10 text-center font-sans text-sm text-brand-charcoal/70">
            Loading your details…
          </p>
        )}

        {step === "already" && (
          <div className="text-center">
            <h3 className="font-serif text-2xl font-bold text-brand-black">
              You&apos;re already registered 🎉
            </h3>
            <p className="mt-2 font-sans text-sm text-brand-charcoal/70">
              Your seat is confirmed — no need to register again.
            </p>
            {already?.regId && (
              <p className="mt-3 font-sans text-sm text-brand-black">
                Registration ID: <b>{already.regId}</b>
              </p>
            )}
            <div className="mt-5 flex flex-col gap-2">
              {already?.passUrl && (
                <a
                  href={already.passUrl}
                  className="rounded-full bg-brand-gold px-5 py-3 font-sans font-semibold text-brand-black transition hover:bg-brand-gold-light"
                >
                  📎 Download your Event Pass
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-black/15 px-5 py-2.5 font-sans text-sm text-brand-charcoal"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="text-center">
            <h3 className="font-serif text-2xl font-bold text-brand-black">
              🎉 You&apos;re in{success?.name ? `, ${success.name.split(" ")[0]}` : ""}!
            </h3>
            <p className="mt-2 font-sans text-sm text-brand-charcoal/70">
              Your seat is confirmed. We&apos;ve sent your Event Pass to your
              WhatsApp &amp; email.
            </p>
            {success?.regId && (
              <p className="mt-3 font-sans text-sm text-brand-black">
                Registration ID: <b>{success.regId}</b>
              </p>
            )}
            <div className="mt-5 flex flex-col gap-2">
              {success?.passUrl && (
                <a
                  href={success.passUrl}
                  className="rounded-full bg-brand-gold px-5 py-3 font-sans font-semibold text-brand-black transition hover:bg-brand-gold-light"
                >
                  📎 Download your Event Pass
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-black/15 px-5 py-2.5 font-sans text-sm text-brand-charcoal"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {step === "phone" && (
          <>
            <h3 className="font-serif text-2xl font-bold text-brand-black">
              Reserve your free seat
            </h3>
            <p className="mt-1 font-sans text-sm text-brand-charcoal/70">
              Enter your phone number to continue. If you&apos;ve already applied
              through our ad, we&apos;ll pull up your details.
            </p>
            <form onSubmit={submitPhone} className="mt-5 space-y-3.5">
              <div>
                <label className={label} htmlFor="p-phone">Phone (WhatsApp) *</label>
                <input
                  id="p-phone"
                  ref={firstRef}
                  type="tel"
                  inputMode="tel"
                  placeholder="+91 98765 43210"
                  className={field}
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                />
              </div>
              {err && <p className="font-sans text-sm text-red-600">{err}</p>}
              <div className="flex gap-2 pt-1.5">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-full bg-brand-gold px-5 py-3 font-sans font-semibold text-brand-black transition hover:bg-brand-gold-light disabled:opacity-60"
                >
                  {loading ? "Checking…" : "Continue"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-black/15 px-5 py-3 font-sans text-sm text-brand-charcoal"
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}

        {step === "form" && (
          <>
            <h3 className="font-serif text-2xl font-bold text-brand-black">
              {known ? `Almost done${f.name ? `, ${f.name.split(" ")[0]}` : ""}!` : "Reserve your free seat"}
            </h3>
            <p className="mt-1 font-sans text-sm text-brand-charcoal/70">
              {known
                ? "We've filled in what we know — just confirm and add a few details."
                : "Your Event Pass will be sent to your WhatsApp & email instantly."}
            </p>

            <form onSubmit={submitForm} className="mt-5 space-y-3.5">
              <div>
                <label className={label} htmlFor="r-name">Your Name *</label>
                <input id="r-name" ref={firstRef} className={field} value={f.name} onChange={set("name")} />
              </div>

              {!have.designation && (
                <div>
                  <label className={label} htmlFor="r-desig">Your Designation *</label>
                  <Select
                    id="r-desig"
                    value={f.designation}
                    onChange={(v) => setF((p) => ({ ...p, designation: v }))}
                    options={DESIGNATIONS}
                  />
                </div>
              )}
              {!have.company && (
                <div>
                  <label className={label} htmlFor="r-org">Company Name *</label>
                  <input id="r-org" className={field} value={f.company} onChange={set("company")} />
                </div>
              )}
              {!have.employeeCount && (
                <div>
                  <label className={label} htmlFor="r-emp">No. of Employees *</label>
                  <Select
                    id="r-emp"
                    value={f.employeeCount}
                    onChange={(v) => setF((p) => ({ ...p, employeeCount: v }))}
                    options={EMPLOYEE_COUNTS}
                  />
                </div>
              )}
              {!have.location && (
                <div>
                  <label className={label} htmlFor="r-loc">Organization Location *</label>
                  <input
                    id="r-loc"
                    className={field}
                    placeholder="City"
                    value={f.location}
                    onChange={set("location")}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="r-phone">Phone (WhatsApp) *</label>
                  <input id="r-phone" type="tel" inputMode="tel" className={field} value={f.phone} onChange={set("phone")} />
                </div>
                <div>
                  <label className={label} htmlFor="r-email">Email *</label>
                  <input id="r-email" type="email" className={field} value={f.email} onChange={set("email")} />
                </div>
              </div>

              <div>
                <label className={label} htmlFor="r-exp">
                  What are your expectations from this Workshop?{" "}
                  <span className="font-normal text-brand-charcoal/50">(optional)</span>
                </label>
                <textarea
                  id="r-exp"
                  rows={3}
                  className={`${field} resize-y`}
                  placeholder="What would make this workshop worth your afternoon?"
                  value={f.expectations}
                  onChange={set("expectations")}
                />
              </div>

              {err && <p className="font-sans text-sm text-red-600">{err}</p>}

              <div className="flex gap-2 pt-1.5">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-full bg-brand-gold px-5 py-3 font-sans font-semibold text-brand-black transition hover:bg-brand-gold-light disabled:opacity-60"
                >
                  {loading ? "Reserving…" : "Reserve my free seat"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-black/15 px-5 py-3 font-sans text-sm text-brand-charcoal"
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

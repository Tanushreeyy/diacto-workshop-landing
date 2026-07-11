"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { EVENT } from "@/lib/event";
import RegisterModal from "./RegisterModal";

interface Props {
  className?: string;
  children?: ReactNode;
  tabIndex?: number;
}

/**
 * The booking CTA. Opens the registration modal — submitting it registers the
 * person outright (sheet row + Event Pass on WhatsApp & email). There is no
 * pending state and no OTP step.
 */
export default function BookButton({ className = "", children, tabIndex }: Props) {
  const [open, setOpen] = useState(false);
  const [rid, setRid] = useState<string | null>(null);
  const [done, setDone] = useState<{
    name: string;
    regId: string;
    already: boolean;
    passUrl?: string;
  } | null>(null);

  // Arrived from our WhatsApp/email link? Then we can identify them outright.
  useEffect(() => {
    setRid(new URLSearchParams(window.location.search).get("rid"));
  }, []);

  const pill =
    "inline-flex items-center justify-center rounded-full px-8 min-h-[48px] " +
    "font-sans font-semibold text-center transition-all duration-200 ease-out " +
    "bg-brand-gold text-brand-black hover:bg-brand-gold-light shadow-sm " +
    "hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 " +
    className;

  if (done) {
    return (
      <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/10 px-6 py-4 text-center">
        <p className="font-sans font-semibold text-brand-gold">
          🎉 {done.name ? `${done.name}, your` : "Your"} seat is confirmed!
        </p>
        <p className="mt-1 font-sans text-sm text-white/80">
          {done.already
            ? "You're already registered — see you there!"
            : "Your Event Pass is on its way to your WhatsApp & email."}
        </p>
        {done.regId && (
          <p className="mt-1 font-sans text-xs text-white/60">
            Registration ID: {done.regId}
          </p>
        )}
        {done.passUrl && (
          <a
            href={done.passUrl}
            className="mt-3 inline-block rounded-full bg-brand-gold px-5 py-2 font-sans text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
          >
            📎 Download your Event Pass
          </a>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        tabIndex={tabIndex}
        className={pill}
      >
        {children ?? EVENT.ctaText}
      </button>
      {open && (
        <RegisterModal
          rid={rid}
          onClose={() => setOpen(false)}
          onRegistered={(name, regId, already, passUrl) => {
            setOpen(false);
            setDone({ name, regId, already, passUrl });
          }}
        />
      )}
    </>
  );
}

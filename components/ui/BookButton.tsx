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
 * The booking CTA — used by the header, hero, final CTA and the mobile sticky bar.
 * Every instance opens the same centered modal; the confirmation is shown INSIDE
 * that modal (not inline), so this button never changes size and can safely live
 * in the 64px navbar.
 */
export default function BookButton({ className = "", children, tabIndex }: Props) {
  const [open, setOpen] = useState(false);
  const [rid, setRid] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        tabIndex={tabIndex}
        className={pill}
      >
        {registered ? "✓ YOU'RE REGISTERED" : (children ?? EVENT.ctaText)}
      </button>
      {open && (
        <RegisterModal
          rid={rid}
          onClose={() => setOpen(false)}
          onRegistered={() => setRegistered(true)}
        />
      )}
    </>
  );
}

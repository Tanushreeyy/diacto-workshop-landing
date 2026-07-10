"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Button from "./Button";
import { EVENT } from "@/lib/event";

/**
 * Fixed top navbar. No nav links, no hamburger — just the logo and the booking
 * CTA. Background goes from mostly-transparent to solid + shadow after 50px of
 * scroll. The Hero adds top padding so its content clears this fixed header.
 */
export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={
        "fixed inset-x-0 top-0 z-50 border-b border-white/10 backdrop-blur transition-all duration-300 " +
        (scrolled
          ? "bg-brand-black/95 shadow-lg shadow-black/30"
          : "bg-brand-black/60")
      }
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="#hero" aria-label="Diacto — back to top">
          <Image
            src="/diacto-logo.png"
            alt="Diacto"
            width={529}
            height={578}
            priority
            className="h-8 w-auto"
          />
        </Link>

        {/* BACKEND INTEGRATION: booking workflow attaches to this CTA */}
        <Button
          href="#book"
          variant="primary"
          className="h-9 !min-h-0 !px-4 text-xs sm:h-10 sm:!px-6 sm:text-sm"
        >
          {EVENT.ctaText}
        </Button>
      </div>
    </header>
  );
}

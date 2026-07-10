"use client";

import { useEffect, useState } from "react";
import Button from "./Button";
import { EVENT } from "@/lib/event";

/**
 * Mobile-only sticky booking bar pinned to the bottom of the viewport.
 * Hidden on md+ screens where the inline CTAs remain visible.
 *
 * Appears only after the user scrolls past the hero section (watched via an
 * IntersectionObserver on #hero) and slides up into view. CSS transition only.
 */
export default function StickyCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) {
      // No hero on the page — show the bar by default.
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show once the hero has scrolled out of view.
        setVisible(!entry.isIntersecting);
      },
      { rootMargin: "0px", threshold: 0 },
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={
        "fixed inset-x-0 bottom-0 z-50 border-t border-brand-gold/30 " +
        "bg-brand-black/95 px-4 py-3 backdrop-blur transition-transform duration-300 ease-out md:hidden " +
        (visible ? "translate-y-0" : "translate-y-full")
      }
      role="region"
      aria-label="Book your spot"
      aria-hidden={!visible}
    >
      {/* BACKEND INTEGRATION: booking CTA connects to booking workflow later. */}
      <Button
        href="#book"
        variant="primary"
        className="w-full"
        tabIndex={visible ? undefined : -1}
      >
        {EVENT.ctaText}
      </Button>
    </div>
  );
}

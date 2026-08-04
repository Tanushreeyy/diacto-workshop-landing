import Image from "next/image";
import { EVENT } from "@/lib/hr/event";
import type { LandingEvent } from "@/lib/landingEvent";

export default function Footer({ ev }: { ev: LandingEvent }) {
  return (
    // Flatter, darker treatment + gold hairline so the boundary with the
    // FinalCTA band above is unmistakable.
    <footer className="border-t border-brand-gold/30 bg-[#0A0A0A] py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center">
        <Image
          src="/diacto-logo.png"
          alt="Diacto"
          width={529}
          height={578}
          className="h-7 w-auto"
        />

        <p className="font-sans text-sm text-white/80">
          {EVENT.organiserShort}
        </p>

        <p className="font-sans text-xs text-white/60">
          {EVENT.organiserTagline}
        </p>

        <p className="font-sans text-xs text-white/60">
          {ev.dayLabel} · {ev.timeLabel} · {ev.venue}
        </p>

        <a
          href={EVENT.privacyPolicyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-sans text-xs text-white/60 underline underline-offset-4 transition-colors hover:text-brand-gold"
        >
          Privacy Policy
        </a>

        <p className="mt-1 font-sans text-xs text-white/40">
          Diacto © 2026 All Rights Reserved
        </p>
      </div>
    </footer>
  );
}

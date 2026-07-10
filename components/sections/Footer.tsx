import Image from "next/image";
import { EVENT } from "@/lib/event";

export default function Footer() {
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

        <p className="font-sans text-xs text-white/60">
          World-Class Data &amp; AI Solution Provider
        </p>

        <p className="font-sans text-xs text-white/60">
          {EVENT.dayLabel} · {EVENT.timeLabel} · {EVENT.venue}
        </p>

        <p className="mt-1 font-sans text-xs text-white/40">
          Diacto © 2026 All Rights Reserved
        </p>
      </div>
    </footer>
  );
}

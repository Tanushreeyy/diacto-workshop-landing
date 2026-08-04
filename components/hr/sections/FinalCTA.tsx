import type { LandingEvent } from "@/lib/landingEvent";
import BookButton from "@/components/hr/ui/BookButton";
import Reveal from "@/components/ui/Reveal";
import EventChips from "@/components/hr/ui/EventChips";

export default function FinalCTA({ ev }: { ev: LandingEvent }) {
  return (
    <section
      id="book"
      aria-labelledby="finalcta-heading"
      className="relative isolate overflow-hidden bg-brand-black pb-28 pt-16 md:pb-36 md:pt-24"
    >
      {/* Subtle radial gold glow, centered top — sets this band apart from the
          flatter, darker footer below. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(192,145,60,0.08) 0%, rgba(192,145,60,0) 70%)",
        }}
      />

      <div className="relative mx-auto flex max-w-4xl flex-col px-4 text-center">
        <Reveal>
          <h2
            id="finalcta-heading"
            className="font-serif text-3xl font-bold leading-tight text-brand-white md:text-4xl"
          >
            Ready to Reserve Your Seat?
          </h2>
        </Reveal>

        <Reveal delay={100}>
          <p className="mx-auto mt-5 max-w-2xl font-sans text-base leading-relaxed text-white/80 md:text-lg">
            Only 30 seats per session. Submit the form and your workshop pass
            arrives on WhatsApp &amp; email.
          </p>
        </Reveal>

        <Reveal delay={200}>
          {/* BACKEND INTEGRATION: booking modal attaches to this CTA */}
          <div className="mt-8">
            <BookButton className="text-base md:min-h-[56px] md:px-10 md:text-lg" />
          </div>
        </Reveal>

        <Reveal delay={300}>
          <EventChips ev={ev} className="mt-10" />
        </Reveal>
      </div>
    </section>
  );
}

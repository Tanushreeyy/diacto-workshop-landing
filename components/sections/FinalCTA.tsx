import Button from "@/components/ui/Button";
import Reveal from "@/components/ui/Reveal";
import EventChips from "@/components/ui/EventChips";
import { EVENT } from "@/lib/event";

export default function FinalCTA() {
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
          <p className="mt-5 font-sans text-base leading-relaxed text-white/80 md:text-lg">
            Limited seats are available for every workshop.
            <br />
            Complete your booking to confirm your participation.
          </p>
        </Reveal>

        <Reveal delay={200}>
          <div className="mt-8">
            {/* BACKEND INTEGRATION: booking workflow attaches to this CTA */}
            <Button
              href="#book"
              variant="primary"
              className="text-base md:text-lg md:min-h-[56px] md:px-10"
            >
              {EVENT.ctaText}
            </Button>
          </div>
        </Reveal>

        <Reveal delay={300}>
          <EventChips className="mt-10" />
        </Reveal>
      </div>
    </section>
  );
}

import type { LandingEvent } from "@/lib/landingEvent";
import BookButton from "@/components/hr/ui/BookButton";
import Reveal from "@/components/ui/Reveal";
import EventChips from "@/components/hr/ui/EventChips";
import { EVENT } from "@/lib/hr/event";

/**
 * Text-forward hero — no imagery anywhere on this page.
 *
 * The AUDIENCE is the dominant visual element: a single centered Playfair block
 * that scales from 2rem on the smallest phone to 7rem on large desktop — bounded
 * by viewport HEIGHT as well as width, so a short laptop gets a smaller headline
 * instead of a CTA below the fold. Everything else (eyebrow, rule, sub, chips,
 * CTA) is deliberately quieter so the visitor's own job title is what they read
 * first.
 *
 * The whole block occupies exactly one screen; see the comment on the flex
 * container for why that is min-h + centring rather than tuned padding.
 */
export default function Hero({ ev }: { ev: LandingEvent }) {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden bg-brand-black"
    >
      {/* Subtle radial gold glow, centred behind the headline — matches the
          Diacto black+gold bands without introducing any imagery. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 60% at 50% 8%, rgba(192,145,60,0.10) 0%, rgba(192,145,60,0) 70%)",
        }}
      />

      {/*
        Sized to ONE SCREEN so the CTA is above the fold on a normal laptop.
        This block used to run ~990px tall at lg (pt-40, a 7rem headline and
        five 36-40px gaps), which pushed "BOOK YOUR FREE SPOT" off a 768px
        laptop entirely — the visitor had to scroll to find the one thing the
        page is for.

        min-h + justify-center rather than tuned padding: the hero claims one
        viewport and centres in it, so it stays balanced on a 13" laptop and a
        27" monitor alike. svh, not vh, because mobile browsers measure vh
        against the viewport WITHOUT their collapsing toolbar — vh here would
        reintroduce the same overflow on phones that this is fixing on laptops.

        pt-24 clears the fixed h-16 header; the padding sits inside the flex box
        so centring happens in what's left.
      */}
      <div className="relative mx-auto flex min-h-[100svh] max-w-5xl flex-col items-center justify-center px-4 pb-12 pt-24 text-center sm:pb-16 sm:pt-28">
        <Reveal>
          <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.25em] text-brand-gold sm:text-sm sm:tracking-[0.3em]">
            {EVENT.eyebrow}
          </p>
        </Reveal>

        <Reveal delay={100} className="w-full">
          {/*
            READABILITY: this was gold-on-black, which measures 6.56:1 — passing
            on paper, but Playfair is a Didone with hairline thin strokes, and at
            ~112px those hairlines dissolved into the background. Cream lifts it
            to 17.35:1 and weight 800 adds stroke mass, so the thins survive at
            display size. The gold now lands on the ampersand alone, which keeps
            the brand accent without costing legibility.

            Cased literally rather than with `uppercase` — the trailing "s" in
            CHROs is a plural, not part of the acronym, and a CSS transform
            would turn it into CHROS.

            Sized with clamp() rather than breakpoints so the audience block
            scales continuously and never overflows a narrow phone (which would
            give the whole page a horizontal scrollbar).
          */}
          <h1
            id="hero-heading"
            className="mt-4 font-serif text-[clamp(2rem,min(10.5vw,9vh),7rem)] font-extrabold leading-[0.92] tracking-tight text-brand-cream sm:mt-5"
          >
            HR MANAGERS,
            <br />
            TA HEADS <span className="text-brand-gold">&amp;</span>
            <br />
            CHROs
          </h1>
        </Reveal>

        {/* Gold hairline separating the audience block from the promise. */}
        <Reveal delay={150}>
          <span
            className="mt-5 block h-px w-24 bg-brand-gold/60 sm:mt-7 sm:w-32"
            aria-hidden="true"
          />
        </Reveal>

        <Reveal delay={200}>
          <p className="mt-5 max-w-2xl font-sans text-base leading-relaxed text-white/70 sm:mt-7 sm:text-lg">
            {EVENT.subheadline}
          </p>
        </Reveal>

        <Reveal delay={250} className="w-full">
          <EventChips ev={ev} className="mt-6 sm:mt-8" />
        </Reveal>

        <Reveal delay={300}>
          {/* BACKEND INTEGRATION: booking modal attaches to this CTA */}
          <div className="mt-7 sm:mt-8">
            <BookButton className="h-12 text-sm sm:text-base" />
            <p className="mt-4 font-sans text-sm text-white/60">
              {EVENT.ctaNote}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

import BookButton from "@/components/ui/BookButton";
import Reveal from "@/components/ui/Reveal";
import EventChips from "@/components/ui/EventChips";
import { EVENT } from "@/lib/event";

const LEARNINGS = [
  "Hire the Right Employees",
  "Train for Faster Productivity",
  "Retain Top Performers",
  "Fire Wrong Employees Professionally",
];

export default function Hero() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden bg-brand-black"
    >
      {/* Subtle radial gold glow, top-right — matches Diacto black+gold bands. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 55% at 85% 0%, rgba(192,145,60,0.06) 0%, rgba(192,145,60,0) 70%)",
        }}
      />

      {/* Extra top padding clears the fixed Header. */}
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-32 lg:pb-28 lg:pt-40">
        {/*
          DOM order is the MOBILE order (single column):
            overline → H1 → sub → points → chips → CTA block.
          On lg the explicit col-start/row-start placement rearranges this into
          two columns with the chips as a left-aligned strip below both columns:
            col 1 (rows 1-4): overline, H1, sub, CTA block
            col 2 (rows 1-4, spanned): points stack
            row 5 (both cols): chips
          Columns are vertically centered (items-center) so the right point
          stack sits centered against the left content block.
        */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[11fr_9fr] lg:items-center lg:gap-x-16 lg:gap-y-6 xl:gap-x-24">
          {/* Overline */}
          <Reveal className="text-center lg:col-start-1 lg:row-start-1 lg:text-left">
            <p className="font-sans text-sm font-semibold uppercase tracking-[0.25em] text-brand-gold">
              FREE FOUNDER SEMINAR
            </p>
          </Reveal>

          {/* Headline */}
          <Reveal
            delay={100}
            className="text-center lg:col-start-1 lg:row-start-2 lg:text-left"
          >
            <h1
              id="hero-heading"
              className="font-serif text-3xl font-bold leading-[1.1] text-brand-white md:text-4xl lg:text-5xl"
            >
              Stop Hiring Employees.
              <br />
              Start Building
              <br />
              <span className="text-brand-gold">High-Performance Teams.</span>
            </h1>
          </Reveal>

          {/* Subheading */}
          <Reveal
            delay={200}
            className="text-center lg:col-start-1 lg:row-start-3 lg:text-left"
          >
            <p className="font-sans text-lg leading-relaxed text-white/70">
              FREE Practical Workshop for Founders &amp; Business Owners of
              Private Limited &amp; Limited Companies
            </p>
          </Reveal>

          {/* Points — vertical card stack (right column on desktop) */}
          <ul className="space-y-3 lg:col-start-2 lg:row-start-1 lg:row-span-4">
            {LEARNINGS.map((item, i) => (
              <Reveal key={item} delay={150 + i * 100}>
                <li className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 font-sans text-white">
                  <CheckIcon />
                  <span>{item}</span>
                </li>
              </Reveal>
            ))}
          </ul>

          {/* Event details — left-aligned strip below both columns, its left
              edge lined up with the left column content. */}
          <Reveal
            delay={350}
            className="lg:col-span-2 lg:col-start-1 lg:row-start-5"
          >
            <EventChips align="left" />
          </Reveal>

          {/* CTA block (button + reassurance) */}
          <Reveal
            delay={300}
            className="text-center lg:col-start-1 lg:row-start-4 lg:text-left"
          >
            <BookButton className="h-12">{EVENT.ctaText}</BookButton>
            <p className="mt-4 font-sans text-sm text-white/60">
              Limited seats · Free to attend
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* Gold outline checkmark. */
function CheckIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-brand-gold"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

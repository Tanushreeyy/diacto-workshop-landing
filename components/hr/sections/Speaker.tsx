import SectionHeading from "@/components/hr/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";
import { EVENT } from "@/lib/hr/event";

/**
 * Who is actually running the session, placed directly under the hero — a live
 * masterclass is sold on the person in the room, and the visitor should not
 * have to reach the bottom of the page to find out who that is.
 *
 * Same card treatment as the About the Speaker band (gold-bordered cream on
 * white). The monogram stands in for a headshot: this page carries no
 * photography anywhere, and the only image on it is the Diacto logo.
 */
export default function Speaker() {
  const { name, initials, title, line } = EVENT.speaker;

  return (
    <section className="bg-brand-white py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <SectionHeading title="Your Speaker" />
        </Reveal>

        <Reveal delay={150}>
          <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center gap-6 rounded-2xl border border-brand-gold/25 bg-brand-cream px-6 py-8 text-center md:flex-row md:items-center md:gap-8 md:px-10 md:text-left">
            <span
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-brand-gold/40 bg-brand-gold/10 font-serif text-2xl font-bold text-brand-gold"
              aria-hidden="true"
            >
              {initials}
            </span>

            <div>
              <h3 className="font-serif text-2xl font-bold text-brand-charcoal md:text-3xl">
                {name}
              </h3>
              <p className="mt-1.5 font-sans text-sm font-semibold text-brand-gold md:text-base">
                {title}
              </p>
              <p className="mt-4 font-sans text-sm leading-relaxed text-brand-grey md:text-base">
                {line}
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

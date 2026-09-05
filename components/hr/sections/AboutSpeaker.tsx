import SectionHeading from "@/components/hr/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";

/**
 * The long-form bio, in the speaker's own voice — the closing credential before
 * the final CTA.
 *
 * This band was "About the Organiser": the same three stat cards under a
 * company blurb. The session is now sold on the person running it, so the
 * company blurb gives way to the first-person bio and the stats stay on as what
 * they always were — the skim-readable version of the sentence above them.
 */
const STATS = [
  { value: "150+", label: "professionals" },
  { value: "450+", label: "organisations" },
  { value: "600+", label: "deployments" },
];

export default function AboutSpeaker() {
  return (
    <section className="bg-brand-white py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <SectionHeading title="About the Speaker" />
        </Reveal>

        <Reveal delay={100}>
          <div className="mx-auto mt-10 max-w-3xl space-y-5 text-center font-sans text-base leading-relaxed text-brand-grey md:text-lg">
            <p>
              I&rsquo;m Omprakash Maurya, Founder &amp; CEO of Diacto
              Technologies, with 25+ years of experience, 150+ technology
              professionals, 600+ global deployments and 450+ organizations
              served.
            </p>
            <p>
              I&rsquo;m also the Founder of CandidHR.ai, an AI-powered hiring
              and screening platform, and BlissIQ, an AI-powered learning
              platform&mdash;building technology solutions that help
              organizations transform, scale and grow smarter.
            </p>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <dl className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
            {STATS.map(({ value, label }) => (
              <div
                key={label}
                className="rounded-2xl border border-brand-gold/25 bg-brand-cream px-6 py-7 text-center"
              >
                <dt className="sr-only">{label}</dt>
                <dd>
                  <span className="block font-serif text-4xl font-bold leading-none text-brand-gold md:text-5xl">
                    {value}
                  </span>
                  <span className="mt-3 block font-sans text-sm text-brand-grey md:text-base">
                    {label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

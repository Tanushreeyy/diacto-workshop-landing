import SectionHeading from "@/components/hr/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";

const STATS = [
  { value: "150+", label: "professionals" },
  { value: "450+", label: "organisations" },
  { value: "600+", label: "deployments" },
];

export default function Organiser() {
  return (
    <section className="bg-brand-white py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <SectionHeading
            title="About the Organiser"
            subtext="Organised by Diacto Technologies Pvt Ltd — a leading Data & AI solutions company."
          />
        </Reveal>

        <Reveal delay={150}>
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

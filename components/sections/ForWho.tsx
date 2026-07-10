import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";

const FOR = [
  "Founders",
  "Entrepreneurs",
  "CEOs",
  "Managing Directors",
  "Business Owners",
  "Companies with 20–500 Employees",
  "Private Limited Companies",
  "Limited Companies",
];

const NOT_FOR = [
  "HR Job Seekers",
  "Students",
  "Freelancers",
  "Startups without employees",
];

export default function ForWho() {
  return (
    <section className="bg-brand-cream py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <SectionHeading title="This Workshop Is For" />
        </Reveal>

        <Reveal delay={100}>
          <ul className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-3">
            {FOR.map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-2 rounded-full border border-brand-gold/60 bg-brand-white px-4 py-2 font-sans text-sm font-medium text-brand-charcoal shadow-sm"
              >
                <CheckIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={150}>
          <h3 className="mt-16 text-center font-serif text-2xl font-bold text-brand-charcoal md:text-3xl">
            This Workshop Is NOT For
          </h3>
        </Reveal>

        <Reveal delay={200}>
          <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-3">
            {NOT_FOR.map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-2 rounded-full border border-brand-grey/40 px-4 py-2 font-sans text-sm text-brand-grey"
              >
                <XIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* Gold check — "for" chips. */
function CheckIcon() {
  return (
    <svg
      width={16}
      height={16}
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

/* Muted grey X — "not for" chips. */
function XIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-brand-grey"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

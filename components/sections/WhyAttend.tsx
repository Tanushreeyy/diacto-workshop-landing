import Reveal from "@/components/ui/Reveal";

const DELIVERABLES = [
  "Ready-to-use Hiring Framework",
  "Interview Scorecards",
  "Performance Management System",
  "Employee Retention Framework",
  "High Performance Team Blueprint",
];

export default function WhyAttend() {
  return (
    <section
      aria-labelledby="whyattend-heading"
      className="bg-brand-black py-16"
    >
      <div className="mx-auto max-w-6xl px-4 text-center">
        <Reveal>
          <h2
            id="whyattend-heading"
            className="text-3xl font-bold leading-tight text-brand-white md:text-4xl"
          >
            Why Attend?
          </h2>
          <span
            className="mx-auto mt-4 block h-[3px] w-16 rounded-full bg-brand-gold"
            aria-hidden="true"
          />
        </Reveal>

        <Reveal delay={100}>
          <p className="mx-auto mt-6 max-w-2xl font-sans text-lg leading-relaxed text-white/80">
            Instead of HR theory…
            <br />
            You&apos;ll learn practical systems you can implement immediately.
          </p>
        </Reveal>

        <Reveal delay={200}>
          <ul className="mx-auto mt-10 flex max-w-2xl flex-col gap-4 text-left">
            {DELIVERABLES.map((item) => (
              <li
                key={item}
                className="flex items-center gap-3 font-sans text-white"
              >
                <CheckIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* Gold outline checkmark — matches the check style used across the site. */
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

import Reveal from "@/components/ui/Reveal";

/**
 * The numbers behind the claim, straight from the creative — CandidHR's live
 * throughput, sat between the agenda and the reasons to attend so the promise
 * is followed immediately by evidence it has already been kept.
 *
 * Gold hairline dividers rather than cards: this is one continuous statement,
 * and boxing each figure would make it read as three unrelated facts. The
 * dividers are horizontal when the figures stack on mobile and vertical once
 * they sit in a row.
 */
const PROOF = [
  { value: "7,854+", label: "Applicants Processed" },
  { value: "7,699+", label: "AI Resumes Screened" },
  { value: "2,246+", label: "Automated Video Interviews" },
];

export default function ProofStrip() {
  return (
    <section
      aria-label="CandidHR by the numbers"
      className="bg-brand-cream py-14 md:py-20"
    >
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <dl className="grid grid-cols-1 divide-y divide-brand-gold/25 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {PROOF.map(({ value, label }) => (
              <div key={label} className="px-6 py-7 text-center">
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

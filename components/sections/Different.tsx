import { Fragment } from "react";
import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";

const STEPS = ["Hire", "Train", "Manage", "Retain", "Fire", "Scale"];

export default function Different() {
  return (
    <section className="bg-brand-white py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <SectionHeading
            overline="THE DIFFERENCE"
            title="What Makes This Workshop Different?"
            showDot={false}
          />
        </Reveal>

        <Reveal delay={100}>
          <p className="mx-auto mt-6 max-w-2xl text-center font-sans text-lg leading-relaxed">
            <span className="block text-brand-grey">
              Most workshops teach HR.
            </span>
            <span className="mt-1 block font-semibold text-brand-charcoal">
              We teach Business Growth through Better People.
            </span>
          </p>
        </Reveal>

        {/* Flow: Hire → Train → Manage → Retain → Fire → Scale
            Vertical on mobile, horizontal from md up. */}
        <Reveal delay={200}>
          <div className="mt-14 flex flex-col items-center justify-center gap-3 md:flex-row md:flex-wrap md:gap-2 lg:gap-3">
            {STEPS.map((step, i) => (
              <Fragment key={step}>
                <div
                  className={
                    "flex h-20 w-20 items-center justify-center rounded-full border-2 border-brand-gold text-center font-serif text-base font-semibold lg:h-24 lg:w-24 " +
                    (step === "Scale"
                      ? "bg-brand-gold text-brand-black"
                      : "text-brand-charcoal")
                  }
                >
                  {step}
                </div>
                {i < STEPS.length - 1 && <Arrow />}
              </Fragment>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* Thin gold arrow — points down on mobile, right from md up. */
function Arrow() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 rotate-90 text-brand-gold md:rotate-0"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

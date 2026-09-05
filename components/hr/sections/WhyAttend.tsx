import type { ReactNode } from "react";
import Reveal from "@/components/ui/Reveal";

type Reason = { text: string; icon: ReactNode };

const REASONS: Reason[] = [
  { text: "Live and interactive, not a recording", icon: <LiveIcon /> },
  {
    text: "Practical frameworks you can apply the same week",
    icon: <FrameworkIcon />,
  },
  {
    text: "Direct Q&A with the Founder & CEO",
    icon: <InteractiveIcon />,
  },
];

export default function WhyAttend() {
  return (
    <section
      aria-labelledby="whyattend-heading"
      className="bg-brand-black py-16 md:py-24"
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

        {/* Three equal boxes side by side from md up, stacked on mobile. */}
        <ul className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {REASONS.map(({ text, icon }, i) => (
            <Reveal key={text} delay={i * 100} className="h-full">
              <li className="flex h-full flex-col items-center rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-center transition-colors duration-200 ease-out hover:border-brand-gold/40 hover:bg-white/[0.07]">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-gold/10"
                  aria-hidden="true"
                >
                  {icon}
                </span>
                <p className="mt-5 font-sans text-base leading-relaxed text-white md:text-lg">
                  {text}
                </p>
              </li>
            </Reveal>
          ))}
        </ul>

        {/* The price is the closing argument — given its own gold-bordered band
            below the row so it reads as a statement, not a fourth item. */}
        <Reveal delay={350}>
          <p className="mx-auto mt-10 inline-flex rounded-full border border-brand-gold/50 bg-brand-gold/10 px-7 py-3 font-serif text-xl font-semibold text-brand-gold md:mt-12 md:text-2xl">
            100% FREE. No fees. Just value.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ---- Gold outline icons (consistent 1.5 stroke) ---- */

const iconProps = {
  width: 28,
  height: 28,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "text-brand-gold",
  "aria-hidden": true,
};

/* Practical frameworks — modular connected blocks. */
function FrameworkIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
      <path d="M10 7h4M7 10v4M17 10v4M10 17h4" />
    </svg>
  );
}

/* Live, not a recording — a broadcasting screen. */
function LiveIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2.5" y="5" width="19" height="12.5" rx="2" />
      <path d="M8.5 21h7M12 17.5V21" />
      <circle cx="12" cy="11.25" r="1.75" />
      <path d="M8.4 8.4a4 4 0 0 0 0 5.7M15.6 8.4a4 4 0 0 1 0 5.7" />
    </svg>
  );
}

/* Interactive session — two speech bubbles in conversation. */
function InteractiveIcon() {
  return (
    <svg {...iconProps}>
      <path d="M14.5 13.5h-6L5 16.5v-3H4a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 4 3.5h10.5A1.5 1.5 0 0 1 16 5v7a1.5 1.5 0 0 1-1.5 1.5Z" />
      <path d="M18.5 8H20a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 1-1.5 1.5h-1v3l-3.5-3h-3" />
    </svg>
  );
}

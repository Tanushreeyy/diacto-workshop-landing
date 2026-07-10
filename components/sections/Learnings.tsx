import type { ReactNode } from "react";
import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";

type Learning = {
  title: string;
  description: string;
  icon: ReactNode;
};

const LEARNINGS: Learning[] = [
  {
    title: "Hire Right",
    description: "How to identify A-Players before hiring.",
    icon: <HireIcon />,
  },
  {
    title: "Train Right",
    description: "Build productive employees within weeks.",
    icon: <TrainIcon />,
  },
  {
    title: "Retain Right",
    description: "Keep your best people engaged.",
    icon: <RetainIcon />,
  },
  {
    title: "Fire Right",
    description: "Handle poor performers professionally and legally.",
    icon: <FireIcon />,
  },
  {
    title: "Build Systems",
    description: "Reduce founder dependency.",
    icon: <SystemsIcon />,
  },
];

export default function Learnings() {
  return (
    <section className="bg-brand-white py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <SectionHeading overline="THE FRAMEWORK" title="What You'll Learn" />
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-6">
          {LEARNINGS.map((item, i) => (
            <Reveal
              key={item.title}
              delay={i * 100}
              className={
                "flex flex-col items-center text-center lg:col-span-2" +
                // Center the trailing two items beneath the first three.
                (i === 3 ? " lg:col-start-2" : "")
              }
            >
              <span
                className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-gold/10"
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <h3 className="mt-5 font-serif text-xl font-semibold text-brand-charcoal">
                {item.title}
              </h3>
              <p className="mt-2 font-sans text-base leading-relaxed text-brand-grey">
                {item.description}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---- Large gold outline icons (consistent 1.5 stroke) ---- */

const iconProps = {
  width: 30,
  height: 30,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "text-brand-gold",
  "aria-hidden": true,
};

/* Hire Right — person with a check. */
function HireIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="m15.5 12.5 2 2 3.5-4" />
    </svg>
  );
}

/* Train Right — upward growth trend. */
function TrainIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 19V5M4 19h16" />
      <path d="m7.5 15 3.5-3.5 3 3 5-5.5" />
      <path d="M18.5 9h2.5v2.5" />
    </svg>
  );
}

/* Retain Right — heart. */
function RetainIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20s-7-4.6-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5c0 4.9-7 9.5-7 9.5Z" />
    </svg>
  );
}

/* Fire Right — shield with a check (professional & legal). */
function FireIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3.5 5 6v5c0 4.2 3 7.5 7 9.5 4-2 7-5.3 7-9.5V6l-7-2.5Z" />
      <path d="m9 11.5 2 2 4-4.5" />
    </svg>
  );
}

/* Build Systems — connected nodes / modular blocks. */
function SystemsIcon() {
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

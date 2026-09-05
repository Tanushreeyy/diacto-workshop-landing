import type { ReactNode } from "react";
import SectionHeading from "@/components/hr/ui/SectionHeading";
import Card from "@/components/ui/Card";
import Reveal from "@/components/ui/Reveal";

type Learning = {
  /** Gold small-caps index — the card anatomy's loudest, smallest element. */
  index: string;
  title: string;
  description: string;
  icon: ReactNode;
};

/**
 * The four takeaways, in the creative's order.
 *
 * These used to be VERB + object pairs (HIRE Right Employees, TRAIN Them
 * Faster…) with a fifth full-width band for the AI module. The session is now
 * about AI end to end, so a band setting AI apart from the other four would be
 * separating it from itself — the four below are the agenda, and AI is the
 * thread running through them rather than a bonus module at the bottom.
 */
const LEARNINGS: Learning[] = [
  {
    index: "01",
    title: "AI Trends",
    description: "The trends shaping the future of hiring",
    icon: <AiIcon />,
  },
  {
    index: "02",
    title: "Candidate Experience",
    description: "How to improve it at every step",
    icon: <CandidateIcon />,
  },
  {
    index: "03",
    title: "Faster Hiring",
    description: "How AI reduces time-to-hire",
    icon: <SpeedIcon />,
  },
  {
    index: "04",
    title: "Future-Ready Strategy",
    description: "Building a future-ready HR strategy",
    icon: <StrategyIcon />,
  },
];

export default function Learnings() {
  return (
    <section className="bg-brand-white py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <SectionHeading overline="THE AGENDA" title="What You'll Learn" />
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
          {LEARNINGS.map((item, i) => (
            <Reveal key={item.index} delay={i * 100} className="h-full">
              <Card className="flex h-full flex-col p-6">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-gold/10"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>

                <h3 className="mt-5 font-serif text-xl font-semibold leading-snug text-brand-charcoal">
                  <span className="block font-sans text-sm font-bold uppercase tracking-[0.18em] text-brand-gold">
                    {item.index}
                  </span>
                  {item.title}
                </h3>

                <p className="mt-2 font-sans text-sm leading-relaxed text-brand-grey md:text-base">
                  {item.description}
                </p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---- Large gold outline icons (consistent 1.5 stroke) ---- */

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

/* AI Trends — spark inside a processor. */
function AiIcon() {
  return (
    <svg {...iconProps}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
      <path d="M10 3v3.5M14 3v3.5M10 17.5V21M14 17.5V21M3 10h3.5M3 14h3.5M17.5 10H21M17.5 14H21" />
      <path d="m12 9.3.85 1.85L14.7 12l-1.85.85L12 14.7l-.85-1.85L9.3 12l1.85-.85L12 9.3Z" />
    </svg>
  );
}

/* Candidate Experience — a person with an approving heart. */
function CandidateIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="9.5" cy="7.5" r="3.25" />
      <path d="M3.5 20a6 6 0 0 1 11 0" />
      <path d="M18 14.5s-2.5-1.6-2.5-3.3a1.35 1.35 0 0 1 2.5-.7 1.35 1.35 0 0 1 2.5.7c0 1.7-2.5 3.3-2.5 3.3Z" />
    </svg>
  );
}

/* Faster Hiring — a clock with a speed arc: time-to-hire coming down. */
function SpeedIcon() {
  return (
    <svg {...iconProps}>
      <path d="M20.5 15a9 9 0 1 0-17 0" />
      <path d="M12 15l4.5-4.5" />
      <path d="M2.5 19h6M15.5 19h6" />
    </svg>
  );
}

/* Future-Ready Strategy — a compass pointing the way. */
function StrategyIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5.2-5.2 2 2-5.2 5.2-2Z" />
    </svg>
  );
}

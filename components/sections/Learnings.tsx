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
    title: "The Growth Mindset",
    description: "Think 10X, not 10% — the founder mindset shift.",
    icon: <MindsetIcon />,
  },
  {
    title: "The 3Ps of Growth",
    description: "People, Process & Product — the growth engine.",
    icon: <TrainIcon />,
  },
  {
    title: "The 8 Pillars",
    description: "The framework for a scalable business.",
    icon: <SystemsIcon />,
  },
  {
    title: "High-Performance Teams",
    description: "Build a team that owns outcomes, not tasks.",
    icon: <HireIcon />,
  },
  {
    title: "Hire, Train & Retain",
    description: "Attract and keep the right A-players.",
    icon: <RetainIcon />,
  },
  {
    title: "Exit the Right Way",
    description: "Let go of wrong-fit employees professionally.",
    icon: <FireIcon />,
  },
  {
    title: "Founder Freedom",
    description: "Reduce founder dependency — a business that runs without you.",
    icon: <OpenLockIcon />,
  },
  {
    title: "Next-Gen Strategies",
    description: "Modern playbooks for the next decade of growth.",
    icon: <CompassIcon />,
  },
];

export default function Learnings() {
  return (
    <section className="bg-brand-white py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <SectionHeading overline="THE FRAMEWORK" title="What You'll Learn" />
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {LEARNINGS.map((item, i) => (
            <Reveal
              key={item.title}
              delay={i * 80}
              className="flex flex-col items-center text-center"
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

/* Growth Mindset — lightbulb. */
function MindsetIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9v.2h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

/* Founder Freedom — open padlock (reduced dependency). */
function OpenLockIcon() {
  return (
    <svg {...iconProps}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.7-1.5" />
      <path d="M12 15v2" />
    </svg>
  );
}

/* Next-Gen Strategies — compass / navigation. */
function CompassIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </svg>
  );
}

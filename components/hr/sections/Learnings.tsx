import type { ReactNode } from "react";
import SectionHeading from "@/components/hr/ui/SectionHeading";
import Card from "@/components/ui/Card";
import Reveal from "@/components/ui/Reveal";

type Learning = {
  /** The verb — set in gold, the loudest word in the card. */
  verb: string;
  /** The rest of the card title. */
  object: string;
  description: string;
  icon: ReactNode;
};

const LEARNINGS: Learning[] = [
  {
    verb: "HIRE",
    object: "Right Employees",
    description: "Attract, assess & hire top talent",
    icon: <HireIcon />,
  },
  {
    verb: "TRAIN",
    object: "Them Faster",
    description: "Build skills, improve productivity",
    icon: <TrainIcon />,
  },
  {
    verb: "RETAIN",
    object: "Best Employees",
    description: "Increase engagement, reduce attrition",
    icon: <RetainIcon />,
  },
  {
    verb: "MANAGE",
    object: "Underperformers",
    description: "Handle performance issues with confidence",
    icon: <ManageIcon />,
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
            <Reveal key={item.verb} delay={i * 100} className="h-full">
              <Card className="flex h-full flex-col p-6">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-gold/10"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>

                <h3 className="mt-5 font-serif text-xl font-semibold leading-snug text-brand-charcoal">
                  <span className="block font-sans text-sm font-bold uppercase tracking-[0.18em] text-brand-gold">
                    {item.verb}
                  </span>
                  {item.object}
                </h3>

                <p className="mt-2 font-sans text-sm leading-relaxed text-brand-grey md:text-base">
                  {item.description}
                </p>
              </Card>
            </Reveal>
          ))}

          {/* Wide card — the AI module, given its own full-width gold-tinted
              band so it reads as the headline takeaway of the session. */}
          <Reveal delay={400} className="sm:col-span-2 lg:col-span-4">
            <div className="flex flex-col items-start gap-5 rounded-2xl border border-brand-gold/30 bg-brand-gold/10 p-6 shadow-md transition-all duration-200 ease-out hover:shadow-lg md:flex-row md:items-center md:gap-7 md:p-8">
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-gold/20"
                aria-hidden="true"
              >
                <AiIcon />
              </span>

              <div>
                {/* One continuous line here (unlike the four cards above) —
                    "Leverage AI in Recruitment" is a single phrase, so only
                    the AI half takes the gold. */}
                <h3 className="font-serif text-xl font-semibold leading-snug text-brand-charcoal md:text-2xl">
                  <span className="text-brand-gold">Leverage AI</span> in
                  Recruitment
                </h3>
                <p className="mt-2 font-sans text-sm leading-relaxed text-brand-charcoal/80 md:text-base">
                  Reduce hiring time and improve quality of hire with AI-powered
                  strategies
                </p>
              </div>
            </div>
          </Reveal>
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

/* HIRE — person with a magnifier/check: assess then select. */
function HireIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="m15.5 12.5 2 2 3.5-4" />
    </svg>
  );
}

/* TRAIN — graduation cap. */
function TrainIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4Z" />
      <path d="M6.5 10.8V16c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-5.2" />
      <path d="M21.5 8.5V14" />
    </svg>
  );
}

/* RETAIN — shield with a heart: keep your best people. */
function RetainIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3.5 5 6v5c0 4.2 3 7.5 7 9.5 4-2 7-5.3 7-9.5V6l-7-2.5Z" />
      <path d="M12 15.5s-3-2-3-4a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2-3 4-3 4Z" />
    </svg>
  );
}

/* MANAGE — a team with a performance gauge. */
function ManageIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="8" cy="7.5" r="2.75" />
      <path d="M2.75 18a5.25 5.25 0 0 1 10.5 0" />
      <circle cx="17.5" cy="15.5" r="4.5" />
      <path d="M17.5 15.5v-2M17.5 15.5l1.9 1.4" />
    </svg>
  );
}

/* Leverage AI — spark inside a processor. */
function AiIcon() {
  return (
    <svg {...iconProps}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
      <path d="M10 3v3.5M14 3v3.5M10 17.5V21M14 17.5V21M3 10h3.5M3 14h3.5M17.5 10H21M17.5 14H21" />
      <path d="m12 9.3.85 1.85L14.7 12l-1.85.85L12 14.7l-.85-1.85L9.3 12l1.85-.85L12 9.3Z" />
    </svg>
  );
}

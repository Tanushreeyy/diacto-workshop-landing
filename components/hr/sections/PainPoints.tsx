import type { ReactNode } from "react";
import SectionHeading from "@/components/hr/ui/SectionHeading";
import Card from "@/components/ui/Card";
import Reveal from "@/components/ui/Reveal";

type PainPoint = { text: string; icon: ReactNode };

const PAIN_POINTS: PainPoint[] = [
  { text: "Hiring takes months, roles stay vacant", icon: <HourglassIcon /> },
  {
    text: "Wrong hires cost time, money and momentum",
    icon: <UserXIcon />,
  },
  { text: "Best employees leave within a year", icon: <ExitDoorIcon /> },
  {
    text: "Interviews run on gut feeling, not data",
    icon: <ClipboardQuestionIcon />,
  },
  {
    text: "Underperformers are hard to manage professionally",
    icon: <TrendingDownIcon />,
  },
  { text: "Recruitment isn't leveraging AI yet", icon: <AiChipIcon /> },
];

export default function PainPoints() {
  return (
    <section className="bg-brand-cream py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <SectionHeading
            overline="SOUND FAMILIAR?"
            title="Is Your Hiring Slowing You Down?"
            showDot={false}
          />
        </Reveal>

        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {PAIN_POINTS.map(({ text, icon }, i) => (
            <Reveal key={text} delay={i * 60} className="h-full">
              <li className="h-full">
                <Card className="flex h-full items-start gap-4 p-5">
                  {/* Fixed icon block keeps icons at an identical position in
                      every card regardless of 1- vs 2-line text beside it. */}
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-charcoal/5"
                    aria-hidden="true"
                  >
                    {icon}
                  </span>
                  <p className="pt-1 font-sans text-sm font-medium leading-snug text-brand-charcoal md:text-base">
                    {text}
                  </p>
                </Card>
              </li>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---- Relatable outline icons (lucide-like, 24px, consistent 1.5 stroke) ---- */

const iconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "text-brand-charcoal/70",
  "aria-hidden": true,
};

/* Hiring takes months — hourglass. */
function HourglassIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6 3h12M6 21h12" />
      <path d="M7.5 3v3.2c0 1.9 4.5 3.6 4.5 5.8s-4.5 3.9-4.5 5.8V21" />
      <path d="M16.5 3v3.2c0 1.9-4.5 3.6-4.5 5.8s4.5 3.9 4.5 5.8V21" />
    </svg>
  );
}

/* Wrong hires — person with an X. */
function UserXIcon() {
  return (
    <svg {...iconProps}>
      <path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M17 8l5 5" />
      <path d="M22 8l-5 5" />
    </svg>
  );
}

/* Best employees leave — door with exit arrow. */
function ExitDoorIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/* Gut feeling, not data — clipboard with a question mark. */
function ClipboardQuestionIcon() {
  return (
    <svg {...iconProps}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9.8 12a2.2 2.2 0 1 1 3.1 2c-.6.3-1.1.9-1.1 1.7" />
      <path d="M11.8 18.5h.01" />
    </svg>
  );
}

/* Underperformers — downward trend line. */
function TrendingDownIcon() {
  return (
    <svg {...iconProps}>
      <path d="M22 17 13.5 8.5 8.5 13.5 2 7" />
      <path d="M16 17h6v-6" />
    </svg>
  );
}

/* Recruitment isn't using AI — processor chip with a spark. */
function AiChipIcon() {
  return (
    <svg {...iconProps}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
      <path d="m12 9.8.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7.7-1.5Z" />
    </svg>
  );
}

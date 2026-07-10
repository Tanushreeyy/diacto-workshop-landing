import type { ReactNode } from "react";
import SectionHeading from "@/components/ui/SectionHeading";
import Card from "@/components/ui/Card";
import Reveal from "@/components/ui/Reveal";

type PainPoint = { text: string; icon: ReactNode };

const PAIN_POINTS: PainPoint[] = [
  { text: "Employees leave within months", icon: <ExitDoorIcon /> },
  { text: "Wrong hiring decisions", icon: <UserXIcon /> },
  { text: "Productivity is low", icon: <TrendingDownIcon /> },
  { text: "No accountability", icon: <ClipboardQuestionIcon /> },
  { text: "Founder manages everything", icon: <RadiatingIcon /> },
  {
    text: "Business isn't growing despite hiring more people",
    icon: <FlatChartIcon />,
  },
  { text: "High recruitment costs", icon: <RupeeUpIcon /> },
  { text: "Team lacks ownership", icon: <ScatteredPeopleIcon /> },
];

export default function PainPoints() {
  return (
    <section className="bg-brand-cream py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <SectionHeading
            overline="SOUND FAMILIAR?"
            title="Is Your Business Facing These Challenges?"
            showDot={false}
          />
        </Reveal>

        <ul className="mt-12 grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-4">
          {PAIN_POINTS.map(({ text, icon }, i) => (
            <Reveal key={text} delay={i * 60} className="h-full">
              <li className="h-full">
                <Card className="flex h-full flex-col items-start gap-4 p-5">
                  {/* Fixed icon block keeps icons at an identical position in
                      every card regardless of 1- vs 2-line text below. */}
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-charcoal/5"
                    aria-hidden="true"
                  >
                    {icon}
                  </span>
                  <p className="min-h-[2.75rem] font-sans text-sm font-medium leading-snug text-brand-charcoal md:text-base">
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

/* Employees leave — door with exit arrow. */
function ExitDoorIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/* Wrong hiring decisions — person with an X. */
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

/* Productivity is low — downward trend line. */
function TrendingDownIcon() {
  return (
    <svg {...iconProps}>
      <path d="M22 17 13.5 8.5 8.5 13.5 2 7" />
      <path d="M16 17h6v-6" />
    </svg>
  );
}

/* No accountability — clipboard with a question mark. */
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

/* Founder manages everything — person at the centre of radiating spokes. */
function RadiatingIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21" />
      <path d="M6 6l3.2 3.2M18 6l-3.2 3.2M6 18l3.2-3.2M18 18l-3.2-3.2" />
    </svg>
  );
}

/* Business not growing — flat / stalled bar chart. */
function FlatChartIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 3v18h18" />
      <path d="M7 21v-6M12 21v-6M17 21v-6" />
    </svg>
  );
}

/* High recruitment costs — rupee coin with an up arrow. */
function RupeeUpIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="9" cy="13" r="6" />
      <path d="M6.5 10.5h5M6.5 13h5M10.5 10.5c0 2.2-1.7 2.5-3.5 2.5l3.5 3.5" />
      <path d="M18 9V4M16 6l2-2 2 2" />
    </svg>
  );
}

/* Team lacks ownership — a loose, disconnected group of people. */
function ScatteredPeopleIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="6" cy="8" r="2.2" />
      <path d="M2.5 15.5a3.5 3.5 0 0 1 7 0" />
      <circle cx="18" cy="8" r="2.2" />
      <path d="M14.5 15.5a3.5 3.5 0 0 1 7 0" />
      <circle cx="12" cy="14" r="2.2" />
      <path d="M8.5 21.5a3.5 3.5 0 0 1 7 0" />
    </svg>
  );
}

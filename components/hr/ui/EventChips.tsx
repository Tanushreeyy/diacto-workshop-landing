import { EVENT } from "@/lib/hr/event";
import type { LandingEvent } from "@/lib/landingEvent";

/**
 * Event details row shared by Hero and FinalCTA — four pill chips (seats, day,
 * time, venue) with small gold outline icons. Styled for dark (brand-black)
 * backgrounds: white text on subtle white/5 rounded-full chips.
 *
 * The seats chip is emphasised (gold border + gold text) because scarcity is
 * the strongest booking driver on this page.
 */
export default function EventChips({
  ev,
  className = "",
  align = "center",
}: {
  /** Date/time/venue for the campaign this host serves — see lib/landingEvent.ts. */
  ev: LandingEvent;
  className?: string;
  /** "center" keeps chips centered. "left" centers on mobile but left-aligns
   *  from lg up (to line up with a left-aligned column). */
  align?: "center" | "left";
}) {
  const chips = [
    { icon: SeatsIcon, label: EVENT.seatsLabel, emphasis: true },
    { icon: CalendarIcon, label: ev.dayLabel, emphasis: false },
    { icon: ClockIcon, label: ev.timeLabel, emphasis: false },
    { icon: PinIcon, label: ev.venue, emphasis: false },
  ];

  const justify =
    align === "left" ? "justify-center lg:justify-start" : "justify-center";

  return (
    <ul
      className={`flex flex-wrap items-center gap-2 sm:gap-3 ${justify} ${className}`.trim()}
    >
      {chips.map(({ icon: Icon, label, emphasis }) => (
        <li
          key={label}
          className={
            "inline-flex items-center gap-2 rounded-full border px-3 py-2 font-sans text-xs sm:px-4 sm:text-sm " +
            (emphasis
              ? "border-brand-gold/50 bg-brand-gold/10 font-semibold text-brand-gold-light"
              : "border-white/10 bg-white/5 text-white/90")
          }
        >
          <Icon />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---- Inline outline icons (gold, 1.5 stroke) ---- */

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "shrink-0 text-brand-gold",
  "aria-hidden": true,
};

/* Limited seats — a small group of people. */
function SeatsIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16.5 6.2a3 3 0 0 1 0 5.6M18 19a5.5 5.5 0 0 0-2.5-4.6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

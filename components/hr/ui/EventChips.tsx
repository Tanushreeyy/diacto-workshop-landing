import { EVENT } from "@/lib/hr/event";
import type { LandingEvent } from "@/lib/landingEvent";

/**
 * Event details row shared by Hero and FinalCTA — pill chips with small gold
 * outline icons. Styled for dark (brand-black) backgrounds: white text on
 * subtle white/5 rounded-full chips.
 *
 * The price chip is emphasised (gold border + gold text) because "free" is the
 * strongest booking driver on this page now that seats are not the scarce thing
 * an online session sells on.
 *
 * Day, time and venue come from the CAMPAIGN (the `ev` prop), never from
 * literals here — the page and the messages the same visitor receives have to
 * agree. `day` overrides only the label, for the closing band, which advertises
 * the recurring schedule ("Mon to Fri") rather than the next single session.
 */
export default function EventChips({
  ev,
  className = "",
  align = "center",
  day,
  showDuration = false,
}: {
  /** Date/time/venue for the campaign this host serves — see lib/landingEvent.ts. */
  ev: LandingEvent;
  className?: string;
  /** "center" keeps chips centered. "left" centers on mobile but left-aligns
   *  from lg up (to line up with a left-aligned column). */
  align?: "center" | "left";
  /** Replaces the campaign's day label. Used by the closing band. */
  day?: string;
  /** Append the session length. The hero shows it; the closing band doesn't. */
  showDuration?: boolean;
}) {
  const chips = [
    { icon: PriceIcon, label: EVENT.priceLabel, emphasis: true },
    { icon: CalendarIcon, label: day ?? ev.dayLabel, emphasis: false },
    { icon: ClockIcon, label: ev.timeLabel, emphasis: false },
    { icon: OnlineIcon, label: ev.venue, emphasis: false },
    ...(showDuration
      ? [{ icon: DurationIcon, label: EVENT.durationLabel, emphasis: false }]
      : []),
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

/* Free — a price tag. */
function PriceIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 12.5V4.5a1.5 1.5 0 0 1 1.5-1.5h8l8.5 8.5a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0L3 12.5Z" />
      <circle cx="7.75" cy="7.75" r="1.25" />
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

/* Live online — a screen with a broadcast dot, replacing the map pin this row
   carried while the workshop was an in-person Pune session. */
function OnlineIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8.5 21h7M12 17v4" />
      <circle cx="12" cy="10.5" r="2" />
    </svg>
  );
}

/* Session length — an hourglass. */
function DurationIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6.5 3h11M6.5 21h11" />
      <path d="M8 3v3.2c0 1.8 4 3.4 4 5.8s-4 4-4 5.8V21" />
      <path d="M16 3v3.2c0 1.8-4 3.4-4 5.8s4 4 4 5.8V21" />
    </svg>
  );
}

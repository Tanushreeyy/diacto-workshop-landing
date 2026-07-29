import { EVENT } from "@/lib/event";

/**
 * Event details row shared by Hero and FinalCTA — three pill chips (day, time,
 * venue) with small outline icons. Styled for dark (brand-black) backgrounds:
 * white text on subtle white/5 rounded-full chips.
 */
export default function EventChips({
  className = "",
  align = "center",
}: {
  className?: string;
  /** "center" keeps chips centered. "left" centers on mobile but left-aligns
   *  from lg up (to line up with a left-aligned column). */
  align?: "center" | "left";
}) {
  const chips = [
    { icon: CalendarIcon, label: EVENT.dayLabel },
    { icon: ClockIcon, label: EVENT.timeLabel },
    // The venue chip links to Google Maps so a lead can open directions in one tap.
    { icon: PinIcon, label: EVENT.venue, href: EVENT.mapUrl },
  ];

  const justify =
    align === "left" ? "justify-center lg:justify-start" : "justify-center";

  const chipClass =
    "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 font-sans text-sm text-white/90";

  return (
    <ul
      className={`flex flex-wrap items-center gap-3 ${justify} ${className}`.trim()}
    >
      {chips.map(({ icon: Icon, label, href }) => (
        <li key={label} className="inline-flex">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${label} in Google Maps`}
              className={`${chipClass} underline decoration-brand-gold/40 underline-offset-4 transition hover:border-brand-gold/40 hover:bg-white/10`}
            >
              <Icon />
              <span>{label}</span>
            </a>
          ) : (
            <span className={chipClass}>
              <Icon />
              <span>{label}</span>
            </span>
          )}
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

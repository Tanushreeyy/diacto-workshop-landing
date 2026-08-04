// Central source of truth for all workshop copy + event details.
// Every string the visitor sees that names the event lives here, so a date or
// venue change is a one-file edit.
//
// BACKEND INTEGRATION: the booking CTA opens a registration modal (built next).
// No backend logic now.

export const EVENT = {
  /** Small gold overline above the hero headline. */
  eyebrow: "A FREE PRACTICAL WORKSHOP FOR",

  /** The audience — the visually dominant element of the page. */
  audience: "HR Managers, TA Heads & CHROs",

  subheadline:
    "Master Hiring, Training, Retention & Performance Management — Build High-Performance Teams with AI.",

  seatsLabel: "30 Seats Only",
  dayLabel: "Wed, 12 Aug",
  timeLabel: "3–6 PM",
  venue: "Baner, Pune",

  ctaText: "BOOK YOUR FREE SPOT",
  ctaNote: "Limited seats · Free to attend",

  /** Shown when a submission fails, so a lead is never lost to a bad request. */
  supportPhone: "+91 73877 31069",

  organiser: "Diacto Technologies Pvt Ltd",
  organiserShort: "Diacto Technologies",
  organiserTagline: "World-Class Data & AI Solution Provider",
  privacyPolicyUrl: "https://www.diacto.com/privacy-policy/",
} as const;

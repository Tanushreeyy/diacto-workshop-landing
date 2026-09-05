// Central source of truth for all workshop copy + event details.
// Every string the visitor sees that names the event lives here, so a copy
// change is a one-file edit.
//
// WHAT IS *NOT* HERE: the live date, time and venue. Those belong to the
// campaign and reach the page as an `ev` prop (see lib/landingEvent.ts) so the
// page can never advertise one day while the WhatsApp confirmation says
// another. The dayLabel/timeLabel/venue below are FALLBACKS only — used when
// the campaign's control tab leaves the cell blank or a Sheets read fails.

export const EVENT = {
  /** Small gold overline above the hero headline. */
  eyebrow: "A FREE LIVE MASTERCLASS FOR",

  /** The workshop's name — the loud first line of the hero subheadline. */
  title: "The Future of Hiring with AI.",

  subheadline:
    "Discover how AI is transforming recruitment, improving quality of hire and building future-ready teams.",

  /** Chips that are true of every session, whatever the campaign's date is. */
  priceLabel: "FREE",
  durationLabel: "2 Hours",
  /** The recurring schedule, shown in the closing band instead of one date. */
  recurrenceLabel: "Mon to Fri",

  // Fallbacks — the control tab wins. See the note at the top of this file.
  dayLabel: "This Friday",
  timeLabel: "3:00 PM to 5:00 PM",
  venue: "Live Online",

  ctaText: "RESERVE MY FREE SEAT",
  ctaNote: "Limited seats per session · Book your free spot",

  /** Shown when a submission fails, so a lead is never lost to a bad request. */
  supportPhone: "+91 73877 31069",

  speaker: {
    name: "Om Maurya",
    /** Initials monogram — this page carries no photography by design. */
    initials: "OM",
    title: "Founder & CEO, CandidHR (by Diacto Technologies)",
    line: "Building AI-powered hiring for modern teams. Live, practical and interactive, with your questions answered in the session.",
  },

  organiserShort: "Diacto Technologies",
  organiserTagline: "World-Class Data & AI Solution Provider",
  productSite: "candidhr.ai",
  productSiteUrl: "https://candidhr.ai",
  contactPhone: "7387731069",
  privacyPolicyUrl: "https://www.diacto.com/privacy-policy/",
} as const;

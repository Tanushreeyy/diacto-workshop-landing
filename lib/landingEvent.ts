// The date, time and venue the LANDING PAGE shows, taken from the campaign.
//
// These used to be literals in lib/event.ts, frozen on the founder workshop's
// original 1 August date because the page was believed to be out of the funnel.
// It never was: the page registers people, and once the founder campaign moved
// to 8 August the page went on advertising 1 August while the Event Pass, the
// confirmation WhatsApp and every reminder said the 8th. A page contradicting
// the message the same visitor receives is worse than either being wrong alone.
//
// So the campaign owns them, which also makes "change the date" one control-tab
// cell for the page exactly as it already is for the messaging.
//
// Resolved ONCE per request in app/page.tsx and passed down as a prop rather
// than parked in a module-level holder. Two hosts can be rendering concurrently
// in one process, and a shared mutable "current event" is the same class of bug
// as the SHEET_ID singleton this whole change exists to remove.
import { loadCampaign } from "./booking/campaign";
import { withCampaign, ActiveCampaign } from "./booking/routes";

export interface LandingEvent {
  dayLabel: string;
  timeLabel: string;
  venue: string;
  mapUrl?: string;
}

/**
 * The campaign's event fields, falling back to the page's own literals.
 *
 * Fails OPEN: a Sheets blip returns the fallback rather than throwing, because a
 * landing page that renders with a slightly stale date still sells the workshop,
 * while one that 500s sells nothing. This is the same call control.ts makes for
 * the kill switches, and the opposite of the one campaign.ts makes for sending —
 * where being wrong means messaging real people about the wrong day.
 */
export async function resolveLandingEvent(
  route: ActiveCampaign | null,
  fallback: LandingEvent,
): Promise<LandingEvent> {
  if (!route) return fallback;
  try {
    const c = await withCampaign(route, () => loadCampaign());
    return {
      dayLabel: c.event.dateShort || fallback.dayLabel,
      timeLabel: c.event.timeLabel || fallback.timeLabel,
      venue: c.event.venue || fallback.venue,
      mapUrl: c.event.mapUrl || fallback.mapUrl,
    };
  } catch {
    return fallback;
  }
}

import { headers } from "next/headers";
import { hostOf, routeForHost } from "@/lib/booking/routes";
import FounderPage from "@/components/pages/FounderPage";
import { resolveLandingEvent } from "@/lib/landingEvent";
import { EVENT as FOUNDER_EVENT } from "@/lib/event";
import { EVENT as HR_EVENT } from "@/lib/hr/event";
import HrPage from "@/components/pages/HrPage";

// Both workshops are served from ONE deployment on two subdomains, and the host
// picks which page renders. No middleware and no URL segment: "/" stays "/" on
// both domains, which is what the ads, the WhatsApp booking links and every
// printed reference already point at.
//
// This is the display half of the decision /api/register makes about which sheet
// to write to (see lib/booking/routes.ts). Keeping both on the host is the whole
// point — the page and the campaign behind it can no longer disagree, which is
// how the founder page came to be selling one workshop while registering its
// visitors into another's sheet.
export const dynamic = "force-dynamic";

export default async function Home() {
  const h = headers();
  const route = routeForHost(hostOf({ headers: { get: (n: string) => h.get(n) } }));
  const isHr = route?.key === "hr";

  // The date/time/venue come from the campaign this host serves, resolved ONCE
  // here and passed down. Before this the page held its own literals, so moving
  // the founder workshop to 8 August left the page still advertising 1 August
  // while the pass and every message said the 8th.
  //
  // The fallbacks are each page's own copy, so a campaign that does not set
  // these — or a Sheets read that fails — renders exactly what it always did.
  const ev = await resolveLandingEvent(
    route,
    isHr
      ? { dayLabel: HR_EVENT.dayLabel, timeLabel: HR_EVENT.timeLabel, venue: HR_EVENT.venue }
      : {
          dayLabel: FOUNDER_EVENT.dayLabel,
          timeLabel: FOUNDER_EVENT.timeLabel,
          venue: FOUNDER_EVENT.venue,
          mapUrl: FOUNDER_EVENT.mapUrl,
        },
  );

  // An unknown host falls back to the founder page rather than 404ing: someone
  // who reached us on an unconfigured alias should still see a workshop. The
  // WRITE paths are where an unknown host has to be refused, and they refuse it.
  return isHr ? <HrPage ev={ev} /> : <FounderPage ev={ev} />;
}

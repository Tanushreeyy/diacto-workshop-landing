import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { headers } from "next/headers";
import { hostOf, routeForHost } from "@/lib/booking/routes";
import { resolveLandingEvent } from "@/lib/landingEvent";
import { EVENT as FOUNDER_EVENT } from "@/lib/event";
import { EVENT as HR_EVENT } from "@/lib/hr/event";
import "./globals.css";

// 800 is carried for the HR hero headline only — at display size Playfair's thin
// strokes need the extra mass to stay legible (see components/hr/sections/Hero).
// The founder page uses 600/700 and is unaffected.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

// Per host, like the page itself. A single static `metadata` export would have
// put the founder workshop's title and description on the HR page — the same
// class of mismatch as the Event Pass that carried the previous workshop's
// branding, except this one is what Google and every WhatsApp link preview show.
// The date is interpolated, not written in. A title that still said "Sat 1 Aug"
// after the workshop moved to the 8th is what Google and every WhatsApp link
// preview would show — the one piece of copy a visitor sees before they ever
// reach the page, and the last place anyone thinks to check.
const META: Record<string, (d: string) => Metadata> = {
  founder: (d) => ({
    title: `Business Transformation Blueprint™ — FREE Workshop for Founders | 10X Growth in 1 Year | ${d}, Baner, Pune`,
    description:
      `Business Transformation Blueprint™ — a FREE practical workshop for founders & entrepreneurs. ` +
      `Achieve 10X business growth in just 1 year. ${d}, 3–6 PM, Baner, Pune. Limited seats.`,
  }),
  hr: (d) => ({
    title: `FREE Live Masterclass for HR Leaders & Founders | The Future of Hiring with AI | CandidHR by Diacto | ${d}`,
    description:
      `A free live masterclass for founders, CEOs, HR Managers, TA Heads & CHROs. Discover how AI is ` +
      `transforming recruitment, improving quality of hire and building future-ready teams. ${d} · ` +
      `3:00 PM to 5:00 PM · live online. Limited seats per session, free to attend.`,
  }),
};

export async function generateMetadata(): Promise<Metadata> {
  const h = headers();
  const route = routeForHost(hostOf({ headers: { get: (n: string) => h.get(n) } }));
  const isHr = route?.key === "hr";
  const ev = await resolveLandingEvent(
    route,
    isHr
      ? { dayLabel: HR_EVENT.dayLabel, timeLabel: HR_EVENT.timeLabel, venue: HR_EVENT.venue }
      : { dayLabel: FOUNDER_EVENT.dayLabel, timeLabel: FOUNDER_EVENT.timeLabel, venue: FOUNDER_EVENT.venue },
  );
  return (META[route?.key ?? ""] ?? META.founder)(ev.dayLabel);
}

export const viewport: Viewport = {
  themeColor: "#121212",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}

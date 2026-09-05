import type { LandingEvent } from "@/lib/landingEvent";
import Header from "@/components/hr/ui/Header";
import Hero from "@/components/hr/sections/Hero";
import Speaker from "@/components/hr/sections/Speaker";
import PainPoints from "@/components/hr/sections/PainPoints";
import Learnings from "@/components/hr/sections/Learnings";
import ProofStrip from "@/components/hr/sections/ProofStrip";
import WhyAttend from "@/components/hr/sections/WhyAttend";
import ForWho from "@/components/hr/sections/ForWho";
import AboutSpeaker from "@/components/hr/sections/AboutSpeaker";
import FinalCTA from "@/components/hr/sections/FinalCTA";
import Footer from "@/components/hr/sections/Footer";
import StickyCTA from "@/components/hr/ui/StickyCTA";
import BookingProvider from "@/components/hr/booking/BookingProvider";

/**
 * Copied from the standalone hr-workshop-landing repo and namespaced under
 * components/hr so it shares this deployment with the founder page without
 * either one's components shadowing the other's.
 *
 * Single-page HR workshop landing page — sibling of the founder workshop page,
 * same Diacto design system, different audience and content.
 *
 * Text-forward by design: there is no photography anywhere. The only image on
 * the page is the Diacto logo in the header and footer.
 *
 * Every CTA opens the same three-step booking modal, supplied by
 * BookingProvider — which wraps the whole page so the modal can be triggered
 * from the header, the hero, the closing band and the mobile sticky bar.
 *
 * Bottom padding on mobile (pb-24) keeps the sticky booking bar from covering
 * the final content; removed at md+ where the sticky bar is hidden.
 */
export default function HrPage({ ev }: { ev: LandingEvent }) {
  return (
    <BookingProvider>
      <Header />

      <main className="pb-24 md:pb-0">
        {/* 1  Hero — the audience is the dominant visual element */}
        <Hero ev={ev} />

        {/* 2  Speaker — a live session is sold on who is running it, so the
               name lands before the problem does */}
        <Speaker />

        {/* 3  PainPoints — the hiring problems HR leaders and founders recognise */}
        <PainPoints />

        {/* 4  Learnings — the four takeaways */}
        <Learnings />

        {/* 5  ProofStrip — CandidHR's numbers, evidence for the promise above */}
        <ProofStrip />

        {/* 6  WhyAttend — the value of showing up */}
        <WhyAttend />

        {/* 7  ForWho (+ NotFor) — who this masterclass is / isn't for */}
        <ForWho />

        {/* 8  AboutSpeaker — the long-form bio */}
        <AboutSpeaker />

        {/* 9  FinalCTA — closing booking call-to-action */}
        <FinalCTA ev={ev} />
      </main>

      {/* 10  Footer — dark band */}
      <Footer ev={ev} />

      {/* Mobile sticky booking bar — appears after the hero scrolls away. */}
      <StickyCTA />
    </BookingProvider>
  );
}

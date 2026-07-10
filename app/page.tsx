import Header from "@/components/ui/Header";
import Hero from "@/components/sections/Hero";
import PainPoints from "@/components/sections/PainPoints";
import Learnings from "@/components/sections/Learnings";
import WhyAttend from "@/components/sections/WhyAttend";
import ForWho from "@/components/sections/ForWho";
import Different from "@/components/sections/Different";
import FinalCTA from "@/components/sections/FinalCTA";
import Footer from "@/components/sections/Footer";
import StickyCTA from "@/components/ui/StickyCTA";

/**
 * Single-page premium event landing page. Section order is client-approved.
 * There is NO registration form anywhere — booking happens via CTA buttons only.
 *
 * Bottom padding on mobile (pb-24) keeps the sticky booking bar from covering
 * the final content; removed at md+ where the sticky bar is hidden.
 */
export default function Home() {
  return (
    <>
      <Header />

      <main className="pb-24 md:pb-0">
        {/* 1  Hero */}
        <Hero />

        {/* 2  PainPoints — the hiring/retention struggles founders face */}
        <PainPoints />

        {/* 3  Learnings — what attendees will walk away knowing */}
        <Learnings />

        {/* 4  WhyAttend — the value/benefits of showing up */}
        <WhyAttend />

        {/* Trainer & Testimonials sections deferred — will be added when client assets arrive */}

        {/* 5  ForWho (+ NotFor) — who this workshop is / isn't for */}
        <ForWho />

        {/* 6  Different — why this workshop is different */}
        <Different />

        {/* 7  FinalCTA — closing booking call-to-action */}
        <FinalCTA />
      </main>

      {/* 9  Footer — dark band */}
      <Footer />

      {/* Mobile sticky booking bar — appears after the hero scrolls away. */}
      <StickyCTA />
    </>
  );
}

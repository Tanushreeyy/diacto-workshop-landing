"use client";

import Button from "@/components/ui/Button";
import { useBooking } from "@/components/hr/booking/BookingProvider";
import { EVENT } from "@/lib/hr/event";

type BookButtonProps = {
  className?: string;
  /** Keyboard-focusable? StickyCTA sets this false while the bar is hidden. */
  focusable?: boolean;
};

/**
 * The single booking seam for the whole page. Header, Hero, FinalCTA and the
 * mobile StickyCTA all render this, so every CTA opens the same flow at step 1.
 */
export default function BookButton({
  className = "",
  focusable = true,
}: BookButtonProps) {
  const { open } = useBooking();

  return (
    <Button
      type="button"
      variant="primary"
      className={className}
      aria-haspopup="dialog"
      tabIndex={focusable ? undefined : -1}
      onClick={open}
    >
      {EVENT.ctaText}
    </Button>
  );
}

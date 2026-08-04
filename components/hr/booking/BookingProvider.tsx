"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import BookingModal from "./BookingModal";

type BookingContextValue = { open: () => void };

const BookingContext = createContext<BookingContextValue | null>(null);

/** Every CTA on the page calls open() to start the booking flow at step 1. */
export function useBooking(): BookingContextValue {
  const context = useContext(BookingContext);
  if (!context) {
    throw new Error("useBooking must be used inside <BookingProvider>");
  }
  return context;
}

export default function BookingProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  // Bumped on every open so BookingModal remounts with fresh state. This is
  // what makes "close at any step, reopen at step 1 with nothing retained" a
  // property of the tree rather than a reset routine that can drift.
  const [session, setSession] = useState(0);

  const open = useCallback(() => {
    setSession((n) => n + 1);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <BookingContext.Provider value={value}>
      {children}
      {isOpen && <BookingModal key={session} onClose={close} />}
    </BookingContext.Provider>
  );
}

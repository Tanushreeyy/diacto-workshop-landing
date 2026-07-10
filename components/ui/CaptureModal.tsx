"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onConfirmed: (name: string) => void;
}

/**
 * Minimal capture for organic visitors who arrive without a booking token.
 * Collects name + email/phone so we can send the same confirmation + Event Pass
 * on email and WhatsApp. Token visitors never see this (they confirm in one tap).
 */
export default function CaptureModal({ onClose, onConfirmed }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim() || (!email.trim() && !phone.trim())) {
      setErr("Please add your name and an email or WhatsApp number.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });
      const data = await res.json();
      if (data.ok) onConfirmed(data.name || name);
      else setErr("Couldn't confirm — please check your details and try again.");
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "w-full rounded-lg border border-black/15 px-3 py-2.5 font-sans text-sm text-brand-black outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm your free seat"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-xl font-bold text-brand-black">
          Confirm your free seat
        </h3>
        <p className="mt-1 font-sans text-sm text-brand-charcoal/70">
          Enter your details and we&apos;ll send your Event Pass to your email &amp;
          WhatsApp.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            className={field}
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <input
            className={field}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={field}
            type="tel"
            placeholder="WhatsApp number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {err && <p className="font-sans text-sm text-red-600">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-full bg-brand-gold px-5 py-2.5 font-sans font-semibold text-brand-black transition hover:bg-brand-gold-light disabled:opacity-60"
            >
              {loading ? "Confirming…" : "Confirm my seat"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-black/15 px-5 py-2.5 font-sans text-sm text-brand-charcoal"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { EVENT } from "@/lib/event";
import CaptureModal from "./CaptureModal";

interface Props {
  className?: string;
  children?: ReactNode;
  tabIndex?: number;
}

type State = "idle" | "loading" | "done" | "capture" | "error";

/**
 * The booking CTA. Replaces the old scroll-only button.
 *  - Ad leads arrive with ?rid=<token> → one-tap confirm.
 *  - Organic visitors (no token) → capture modal → same confirm flow.
 * Confirmation triggers WA-6 + EM-1 (Event Pass) server-side.
 */
export default function BookButton({ className = "", children, tabIndex }: Props) {
  const [rid, setRid] = useState<string | null>(null);
  const [state, setState] = useState<State>("idle");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setRid(new URLSearchParams(window.location.search).get("rid"));
  }, []);

  const pill =
    "inline-flex items-center justify-center rounded-full px-8 min-h-[48px] " +
    "font-sans font-semibold text-center transition-all duration-200 ease-out " +
    "bg-brand-gold text-brand-black hover:bg-brand-gold-light shadow-sm " +
    "hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 " +
    "disabled:opacity-70 disabled:hover:translate-y-0 " +
    className;

  async function confirmToken(token: string) {
    setState("loading");
    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.ok) {
        setName(data.name || "");
        setMsg(
          data.already
            ? "You're already confirmed — see you there!"
            : "Your Event Pass is on its way to your email & WhatsApp.",
        );
        setState("done");
      } else if (data.error === "not_found") {
        setState("capture"); // stale/unknown token → let them re-enter details
      } else {
        setMsg("Something went wrong. Please try again or contact support.");
        setState("error");
      }
    } catch {
      setMsg("Network error. Please try again.");
      setState("error");
    }
  }

  function onClick() {
    if (rid) confirmToken(rid);
    else setState("capture");
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/10 px-6 py-4 text-center">
        <p className="font-sans font-semibold text-brand-gold">
          🎉 {name ? `${name}, your` : "Your"} seat is confirmed!
        </p>
        <p className="mt-1 font-sans text-sm text-white/80">{msg}</p>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={state === "loading"}
        tabIndex={tabIndex}
        className={pill}
      >
        {state === "loading" ? "Confirming…" : children ?? EVENT.ctaText}
      </button>
      {state === "error" && (
        <p className="mt-2 font-sans text-sm text-red-400">{msg}</p>
      )}
      {state === "capture" && (
        <CaptureModal
          onClose={() => setState("idle")}
          onConfirmed={(n) => {
            setName(n);
            setMsg("Your Event Pass is on its way to your email & WhatsApp.");
            setState("done");
          }}
        />
      )}
    </>
  );
}

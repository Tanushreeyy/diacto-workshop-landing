"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

// A native <select> renders its option list through the OS, which ignores our
// palette and our cursor — so on the booking form it looked nothing like the rest
// of the site. This is a listbox we own end to end: brand colours, pointer cursor,
// and the keyboard contract people expect from a select (arrows, Home/End, Enter,
// Escape, type-ahead).
interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}

export default function Select({ id, value, onChange, options, placeholder = "Select…" }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ q: "", at: 0 });
  const listId = useId();

  const close = useCallback(() => setOpen(false), []);

  // Open with the current value highlighted, not the first row.
  const openList = useCallback(() => {
    const i = options.indexOf(value);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!open) return;
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (i: number) => {
    onChange(options[i]);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // The modal closes on a window-level Escape. When the list is open, Escape
    // belongs to the list — swallow it so one keypress doesn't nuke the whole form.
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      e.preventDefault();
      close();
      return;
    }
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(a + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(active);
        break;
      case "Tab":
        close();
        break;
      default: {
        // Type-ahead: "co" jumps to Co-Founder. Resets after a pause.
        if (e.key.length !== 1) return;
        const now = Date.now();
        typed.current.q = now - typed.current.at > 700 ? e.key : typed.current.q + e.key;
        typed.current.at = now;
        const q = typed.current.q.toLowerCase();
        const i = options.findIndex((o) => o.toLowerCase().startsWith(q));
        if (i >= 0) setActive(i);
      }
    }
  };

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={
          "flex w-full cursor-pointer items-center justify-between rounded-lg border bg-white px-3 py-2.5 " +
          "text-left font-sans text-sm outline-none transition " +
          "focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 " +
          (open ? "border-brand-gold ring-2 ring-brand-gold/30 " : "border-black/15 hover:border-brand-gold/60 ") +
          (value ? "text-brand-black" : "text-brand-charcoal/45")
        }
      >
        <span className="truncate">{value || placeholder}</span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={
            "ml-2 h-4 w-4 shrink-0 text-brand-gold transition-transform duration-200 " +
            (open ? "rotate-180" : "")
          }
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-activedescendant={`${listId}-${active}`}
          tabIndex={-1}
          className={
            "absolute z-20 mt-1.5 max-h-56 w-full overflow-auto rounded-lg border border-black/10 " +
            "bg-white py-1 shadow-xl shadow-black/10 ring-1 ring-brand-gold/10"
          }
        >
          {options.map((o, i) => {
            const selected = o === value;
            return (
              <li
                key={o}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className={
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 font-sans text-sm transition-colors " +
                  (i === active ? "bg-brand-cream " : "") +
                  (selected ? "font-semibold text-brand-black" : "text-brand-charcoal")
                }
              >
                <span className="truncate">{o}</span>
                {selected && (
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-gold">
                    <path
                      d="M4 10.5L8 14.5L16 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

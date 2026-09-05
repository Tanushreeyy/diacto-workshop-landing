"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Button from "@/components/ui/Button";
import { EVENT } from "@/lib/hr/event";
import {
  DESIGNATIONS,
  EMPLOYEE_COUNTS,
  LOCATIONS,
  isValidEmail,
  normalizePhone,
  submitLead,
} from "@/lib/hr/booking";
import type { LeadPayload } from "@/lib/hr/booking";

type Step = 1 | 2 | 3;

type Details = {
  fullName: string;
  companyName: string;
  designation: string;
  employeeCount: string;
  location: string;
  email: string;
};

const EMPTY_DETAILS: Details = {
  fullName: "",
  companyName: "",
  designation: "",
  employeeCount: "",
  location: "",
  email: "",
};

const SUBMIT_ERROR = `Something went wrong — please try again or WhatsApp us at ${EVENT.supportPhone}`;

/**
 * Three-step booking modal: WhatsApp capture → full details → confirmation.
 *
 * State lives here for the whole flow, so stepping back from 2 to 1 preserves
 * everything typed. Starting fresh on reopen is handled by BookingProvider
 * remounting this component, not by clearing state here.
 */
export default function BookingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>(1);

  // Shared by step 1 and step 2 — step 2 shows this prefilled and editable.
  const [phone, setPhone] = useState("");
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);

  // Bot trap: a real visitor never sees or fills this.
  const [honeypot, setHoneypot] = useState("");

  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  // Lock the page behind the modal.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Escape to close, Tab cycles within the panel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
        ),
      ).filter((element) => element.tabIndex >= 0);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Move focus to the top of each step as it appears.
  useEffect(() => {
    const target = panelRef.current?.querySelector<HTMLElement>(
      "input, select, button",
    );
    target?.focus();
  }, [step]);

  function setDetail(key: keyof Details, value: string) {
    setDetails((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function handleContinue(event: React.FormEvent) {
    event.preventDefault();

    if (!normalizePhone(phone)) {
      setErrors({
        phone: "Enter a valid 10-digit mobile number.",
      });
      return;
    }

    setErrors({});
    setStep(2);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const normalizedPhone = normalizePhone(phone);
    const nextErrors: Partial<Record<string, string>> = {};

    if (!details.fullName.trim()) nextErrors.fullName = "Enter your full name.";
    if (!details.companyName.trim())
      nextErrors.companyName = "Enter your company name.";
    if (!details.designation) nextErrors.designation = "Select your designation.";
    if (!details.employeeCount)
      nextErrors.employeeCount = "Select the number of employees.";
    if (!details.location) nextErrors.location = "Select your location.";
    if (!isValidEmail(details.email))
      nextErrors.email = "Enter a valid email address.";
    if (!normalizedPhone)
      nextErrors.phone = "Enter a valid 10-digit mobile number.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitError(null);
      return;
    }

    setErrors({});
    setSubmitError(null);

    // Honeypot tripped — drop the submission without a network call and without
    // telling the bot. It sees the same confirmation a human would.
    if (honeypot.trim()) {
      setStep(3);
      return;
    }

    const payload: LeadPayload = {
      source: "landing_direct",
      created_at: new Date().toISOString(),
      full_name: details.fullName.trim(),
      company_name: details.companyName.trim(),
      designation: details.designation,
      employee_count: details.employeeCount,
      location: details.location,
      phone: normalizedPhone as string,
      email: details.email.trim(),
    };

    setSubmitting(true);
    const result = await submitLead(payload);
    setSubmitting(false);

    if (result.ok) {
      setStep(3);
    } else {
      // Everything the visitor typed stays put so they can simply retry.
      setSubmitError(SUBMIT_ERROR);
    }
  }

  const width = step === 2 ? "max-w-2xl" : "max-w-md";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        // Only a click on the backdrop itself closes — not a drag out of a field.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
        className={`relative w-full ${width} rounded-2xl bg-brand-white shadow-2xl`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-brand-grey transition-colors hover:bg-brand-cream hover:text-brand-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
        >
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="px-6 py-8 sm:px-8">
          {step === 1 && (
            <StepOne
              phone={phone}
              error={errors.phone}
              onPhoneChange={(value) => {
                setPhone(value);
                setErrors((current) => ({ ...current, phone: undefined }));
              }}
              onSubmit={handleContinue}
            />
          )}

          {step === 2 && (
            <StepTwo
              details={details}
              phone={phone}
              errors={errors}
              honeypot={honeypot}
              submitting={submitting}
              submitError={submitError}
              onDetailChange={setDetail}
              onPhoneChange={(value) => {
                setPhone(value);
                setErrors((current) => ({ ...current, phone: undefined }));
              }}
              onHoneypotChange={setHoneypot}
              onBack={() => setStep(1)}
              onSubmit={handleSubmit}
            />
          )}

          {step === 3 && <StepThree onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Step 1 ------------------------------ */

function StepOne({
  phone,
  error,
  onPhoneChange,
  onSubmit,
}: {
  phone: string;
  error?: string;
  onPhoneChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <h2
        id="booking-title"
        className="pr-8 font-serif text-2xl font-bold text-brand-charcoal"
      >
        Reserve Your Free Seat
      </h2>
      <span
        className="mt-3 block h-[3px] w-16 rounded-full bg-brand-gold"
        aria-hidden="true"
      />

      <div className="mt-6">
        <TextField
          id="booking-phone"
          label="WhatsApp Number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          value={phone}
          error={error}
          onChange={onPhoneChange}
          required
        />
      </div>

      <Button type="submit" variant="primary" className="mt-6 w-full">
        Continue
      </Button>

      <p className="mt-4 text-center font-sans text-xs text-brand-grey">
        Your workshop pass will be sent on this number.
      </p>
    </form>
  );
}

/* ------------------------------ Step 2 ------------------------------ */

function StepTwo({
  details,
  phone,
  errors,
  honeypot,
  submitting,
  submitError,
  onDetailChange,
  onPhoneChange,
  onHoneypotChange,
  onBack,
  onSubmit,
}: {
  details: Details;
  phone: string;
  errors: Partial<Record<string, string>>;
  honeypot: string;
  submitting: boolean;
  submitError: string | null;
  onDetailChange: (key: keyof Details, value: string) => void;
  onPhoneChange: (value: string) => void;
  onHoneypotChange: (value: string) => void;
  onBack: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 rounded font-sans text-sm text-brand-grey transition-colors hover:text-brand-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Back
      </button>

      <h2
        id="booking-title"
        className="pr-8 font-serif text-2xl font-bold text-brand-charcoal"
      >
        Reserve Your Free Seat
      </h2>
      <span
        className="mt-3 block h-[3px] w-16 rounded-full bg-brand-gold"
        aria-hidden="true"
      />

      {/* Field order is fixed by the brief. The two-column grid is row-major,
          so the reading order is identical to the single-column mobile order. */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          id="booking-full-name"
          label="Full Name"
          autoComplete="name"
          value={details.fullName}
          error={errors.fullName}
          onChange={(value) => onDetailChange("fullName", value)}
          required
        />

        <TextField
          id="booking-company"
          label="Company Name"
          autoComplete="organization"
          value={details.companyName}
          error={errors.companyName}
          onChange={(value) => onDetailChange("companyName", value)}
          required
        />

        <SelectField
          id="booking-designation"
          label="Designation"
          options={DESIGNATIONS}
          value={details.designation}
          error={errors.designation}
          onChange={(value) => onDetailChange("designation", value)}
        />

        <SelectField
          id="booking-employees"
          label="Number of Employees"
          options={EMPLOYEE_COUNTS}
          value={details.employeeCount}
          error={errors.employeeCount}
          onChange={(value) => onDetailChange("employeeCount", value)}
        />

        <SelectField
          id="booking-location"
          label="Location"
          options={LOCATIONS}
          value={details.location}
          error={errors.location}
          onChange={(value) => onDetailChange("location", value)}
        />

        <TextField
          id="booking-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={details.email}
          error={errors.email}
          onChange={(value) => onDetailChange("email", value)}
          required
        />

        <div className="sm:col-span-2">
          <TextField
            id="booking-phone"
            label="WhatsApp Number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            error={errors.phone}
            onChange={onPhoneChange}
            required
          />
        </div>
      </div>

      {/* Honeypot — off-screen, unlabelled to assistive tech, never tabbable. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-0">
        <label htmlFor="booking-company-website">
          Company website (leave blank)
        </label>
        <input
          id="booking-company-website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => onHoneypotChange(event.target.value)}
        />
      </div>

      {submitError && (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700"
        >
          {submitError}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={submitting}
        className="mt-6 w-full disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:bg-brand-gold disabled:hover:shadow-sm"
      >
        {submitting ? "RESERVING…" : "RESERVE MY FREE SEAT"}
      </Button>

      <p className="mt-4 font-sans text-xs leading-relaxed text-brand-grey">
        By submitting, you agree to receive your seat confirmation, workshop pass
        and event reminders from Diacto Technologies via WhatsApp and email.
      </p>
    </form>
  );
}

/* ------------------------------ Step 3 ------------------------------ */

function StepThree({ onClose }: { onClose: () => void }) {
  return (
    <div className="text-center">
      <p className="text-4xl" aria-hidden="true">
        🎉
      </p>

      <h2
        id="booking-title"
        className="mt-3 font-serif text-2xl font-bold text-brand-charcoal"
      >
        You&apos;re registered!
      </h2>
      <span
        className="mx-auto mt-3 block h-[3px] w-16 rounded-full bg-brand-gold"
        aria-hidden="true"
      />

      {/* No date in here. It said "see you on 12th August" — a literal that
          outlived its workshop by a month, on the one screen a lead reads
          immediately after handing over their number. */}
      <p className="mt-5 font-sans text-base leading-relaxed text-brand-grey">
        Your joining link will arrive on WhatsApp and email before the session.
        See you at 3 PM!
      </p>

      <Button
        type="button"
        variant="primary"
        onClick={onClose}
        className="mt-7 w-full"
      >
        Close
      </Button>
    </div>
  );
}

/* ------------------------------ Fields ------------------------------ */

const fieldBase =
  "w-full rounded-xl border bg-brand-white px-4 py-3 font-sans text-base " +
  "text-brand-charcoal transition-colors placeholder:text-brand-grey/60 " +
  "focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold";

function TextField({
  id,
  label,
  value,
  error,
  onChange,
  type = "text",
  required,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  inputMode?: "tel" | "email";
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <FieldShell id={id} label={label} error={error}>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldBase} ${error ? "border-red-400" : "border-black/15"}`}
        {...rest}
      />
    </FieldShell>
  );
}

function SelectField({
  id,
  label,
  options,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  options: readonly string[];
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <FieldShell id={id} label={label} error={error}>
      <select
        id={id}
        value={value}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={
          `${fieldBase} appearance-none bg-[length:18px] bg-[right_0.9rem_center] bg-no-repeat pr-10 ` +
          (error ? "border-red-400" : "border-black/15") +
          (value ? "" : " text-brand-grey/70")
        }
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B6B6B' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function FieldShell({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block font-sans text-sm font-medium text-brand-charcoal"
      >
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 font-sans text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

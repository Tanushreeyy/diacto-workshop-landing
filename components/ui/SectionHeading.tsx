import type { ReactNode } from "react";

type SectionHeadingProps = {
  /** Gold small-caps overline above the heading. */
  overline?: string;
  /** Main serif H2 heading. */
  title: ReactNode;
  /** Optional supporting subtext below the heading. */
  subtext?: ReactNode;
  /** Alignment of the heading block. Defaults to centered. */
  align?: "left" | "center";
  /** Show the Diacto gold-dot motif after the title. Disable for headings
   *  that already end in punctuation (e.g. a question mark). Defaults to true. */
  showDot?: boolean;
  className?: string;
};

export default function SectionHeading({
  overline,
  title,
  subtext,
  align = "center",
  showDot = true,
  className = "",
}: SectionHeadingProps) {
  const isCentered = align === "center";

  return (
    <div
      className={
        (isCentered ? "text-center mx-auto " : "text-left ") +
        "max-w-2xl " +
        className
      }
    >
      {overline && (
        <p className="mb-3 font-sans text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">
          {overline}
        </p>
      )}

      <h2 className="text-3xl md:text-4xl font-bold leading-tight text-brand-charcoal">
        {title}
        {/* Diacto signature motif: a subtle gold dot after the heading. */}
        {showDot && <span className="text-brand-gold">.</span>}
      </h2>

      {/* Thin gold underline accent. */}
      <span
        className={
          "mt-4 block h-[3px] w-16 rounded-full bg-brand-gold " +
          (isCentered ? "mx-auto" : "")
        }
        aria-hidden="true"
      />

      {subtext && (
        <p className="mt-5 font-sans text-base md:text-lg leading-relaxed text-brand-grey">
          {subtext}
        </p>
      )}
    </div>
  );
}

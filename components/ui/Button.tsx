import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "primary" | "secondary";

const base =
  "inline-flex items-center justify-center rounded-full px-8 min-h-[48px] " +
  "font-sans font-semibold text-center transition-all duration-200 ease-out " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold " +
  "focus-visible:ring-offset-2";

const variants: Record<Variant, string> = {
  // Primary: gold pill, black label. Hover lifts + shifts toward gold-light.
  primary:
    "bg-brand-gold text-brand-black hover:bg-brand-gold-light " +
    "shadow-sm hover:shadow-lg hover:-translate-y-0.5",
  // Secondary: transparent with 1.5px gold border, charcoal label.
  secondary:
    "bg-transparent text-brand-charcoal border-[1.5px] border-brand-gold " +
    "hover:bg-brand-gold-light/20 hover:-translate-y-0.5 hover:shadow-md",
};

type ButtonAsButton = {
  variant?: Variant;
  children: ReactNode;
  href?: undefined;
} & ComponentPropsWithoutRef<"button">;

type ButtonAsLink = {
  variant?: Variant;
  children: ReactNode;
  href: string;
} & Omit<ComponentPropsWithoutRef<typeof Link>, "href">;

type ButtonProps = ButtonAsButton | ButtonAsLink;

export default function Button(props: ButtonProps) {
  const { variant = "primary", children, className = "", ...rest } = props;
  const classes = `${base} ${variants[variant]} ${className}`.trim();

  if (props.href !== undefined) {
    const { href, ...linkRest } = rest as ButtonAsLink;
    return (
      <Link href={href} className={classes} {...linkRest}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(rest as ButtonAsButton)}>
      {children}
    </button>
  );
}

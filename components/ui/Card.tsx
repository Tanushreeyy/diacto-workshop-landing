import type { ComponentPropsWithoutRef, ReactNode } from "react";

type CardProps = {
  children: ReactNode;
} & ComponentPropsWithoutRef<"div">;

export default function Card({
  children,
  className = "",
  ...rest
}: CardProps) {
  return (
    <div
      className={
        "rounded-2xl bg-brand-white border border-black/5 shadow-md " +
        "transition-all duration-200 ease-out " +
        "hover:shadow-lg hover:-translate-y-1 " +
        className
      }
      {...rest}
    >
      {children}
    </div>
  );
}

import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
}

/** Shared classes so `<Link>` CTAs can match the button look exactly. */
export function buttonClasses(
  variant: NonNullable<ButtonProps["variant"]>,
): string {
  const base =
    "inline-flex items-center justify-center rounded-sm px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary: "bg-accent text-ink hover:brightness-110",
    ghost:
      "border border-line text-ivory hover:border-accent hover:text-accent",
  } as const;
  return `${base} ${variants[variant]}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return <button className={`${buttonClasses(variant)} ${className}`} {...props} />;
}

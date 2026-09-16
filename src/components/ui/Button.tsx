"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { LoaderCircle } from "lucide-react";

const variants = {
  primary: "bg-ink text-paper hover:bg-[#2c241c] hover:shadow-md",
  accent: "bg-accent text-white hover:bg-accent-dark hover:shadow-md",
  secondary: "border border-line bg-card text-ink hover:border-ink/25 hover:bg-paper hover:shadow-sm",
  ghost: "text-accent hover:bg-[#f7efe6]",
  danger: "text-bad hover:bg-[#f8ecec]",
};

const sizes = {
  md: "h-11 px-4 text-sm",
  sm: "h-9 px-3 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  loading = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  icon?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}) {
  const iconOnly = !children;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition duration-150 hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 ${variants[variant]} ${iconOnly ? (size === "sm" ? "h-9 w-9 px-0" : "h-11 w-11 px-0") : sizes[size]} ${className}`}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" size={16} /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

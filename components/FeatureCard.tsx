// components/FeatureCard.tsx
"use client";

import type { MouseEventHandler } from "react";

type FeatureCardProps = {
  title: string;
  description: string;
  cta: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  /** Marks the card as a Pro feature (adds a subtle badge + styling). */
  pro?: boolean;
};

export function FeatureCard({
  title,
  description,
  cta,
  onClick,
  disabled = false,
  pro = false,
}: FeatureCardProps) {
  const isClickable = !!onClick && !disabled;

  return (
    <article
      className={[
        "relative flex flex-col justify-between rounded-xl border px-4 py-3 md:px-5 md:py-4",
        "bg-neutral-900/60 shadow-sm",
        "transition-colors transition-transform duration-150",
        isClickable && "hover:border-purple-500/70 hover:-translate-y-0.5",
        disabled && "opacity-60 cursor-not-allowed",
        pro ? "border-amber-500/60" : "border-neutral-800",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Header */}
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold md:text-base">{title}</h2>
        {pro && (
          <span className="rounded-full border border-amber-400/60 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
            Pro
          </span>
        )}
      </header>

      {/* Description */}
      <p className="mb-4 text-xs leading-snug text-neutral-300 md:text-sm">
        {description}
      </p>

      {/* CTA button */}
      <div className="mt-auto pt-1">
        <button
          type="button"
          onClick={isClickable ? onClick : undefined}
          disabled={!isClickable}
          aria-disabled={!isClickable}
          className={[
            "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs md:text-sm font-medium",
            "border border-neutral-700 bg-neutral-800",
            "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
            isClickable
              ? "hover:bg-purple-600 hover:border-purple-500 hover:text-white"
              : "bg-neutral-900 text-neutral-500 border-neutral-800 cursor-not-allowed",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {cta}
        </button>
      </div>
    </article>
  );
}

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
        // Semantic Colors: Uses 'card' background to adapt to Light/Dark mode automatically
        "bg-card text-card-foreground shadow-sm",
        "transition-all duration-200",
        
        // Hover effects (Terminal Green Glow on hover)
        isClickable && "hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-md cursor-pointer",
        
        // Disabled state
        disabled && "opacity-60 cursor-not-allowed",
        
        // Border styling: Amber for Pro, Standard Border for normal
        pro ? "border-amber-500/40" : "border-border",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Header */}
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold md:text-base">{title}</h2>
        {pro && (
          <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
            Pro
          </span>
        )}
      </header>

      {/* Description: Uses muted foreground for readability in both modes */}
      <p className="mb-4 text-xs leading-snug text-muted-foreground md:text-sm">
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
            "border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            
            isClickable
              // Interactive: Secondary bg by default -> Primary (Green) on hover
              ? "bg-secondary text-secondary-foreground border-border hover:bg-primary hover:text-primary-foreground hover:border-primary"
              // Disabled: Muted bg
              : "bg-muted text-muted-foreground border-transparent cursor-not-allowed",
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
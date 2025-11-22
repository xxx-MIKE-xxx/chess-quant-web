// components/ProGate.tsx
"use client";

import { ProBadge } from "./ProBadge";

type Props = {
  isPro: boolean | null | undefined;
  children: React.ReactNode;
  onUpgradeClick?: () => void;
};

export function ProGate({ isPro, children, onUpgradeClick }: Props) {
  // If user is Pro, show the actual content
  if (isPro) return <>{children}</>;

  // If locked, show the "Terminal Locked" state
  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-border bg-card/50 p-6 text-sm shadow-sm transition-all hover:border-primary/30 group">
      
      {/* Background "Noise" or Pattern (Optional aesthetic touch) */}
      <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] opacity-[0.03] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Restricted Access
            </span>
            <ProBadge />
          </div>
          {/* Lock Icon */}
          <svg 
            className="w-4 h-4 text-muted-foreground" 
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">Deep Pro Analytics</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Advanced performance breakdowns and training plans tailored to your tilt patterns.
          </p>
        </div>

        {onUpgradeClick && (
          <button
            onClick={onUpgradeClick}
            className="mt-2 self-start rounded-md bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] active:scale-95"
          >
            UNLOCK TERMINAL
          </button>
        )}
      </div>
    </div>
  );
}
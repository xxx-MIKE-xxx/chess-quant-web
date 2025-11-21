// components/ProGate.tsx
"use client";

import { ProBadge } from "./ProBadge";

type Props = {
  isPro: boolean | null | undefined;
  children: React.ReactNode;
  onUpgradeClick?: () => void;
};

export function ProGate({ isPro, children, onUpgradeClick }: Props) {
  if (isPro) return <>{children}</>;

  return (
    <div className="rounded-lg border border-purple-700/60 bg-purple-950/40 p-4 text-sm text-purple-100 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Pro feature</span>
        <ProBadge />
      </div>
      <p className="text-xs text-purple-200/80">
        Unlock this analysis by upgrading to Chess Quant Pro.
      </p>
      {onUpgradeClick && (
        <button
          onClick={onUpgradeClick}
          className="self-start rounded bg-purple-500 px-3 py-1 text-xs font-semibold text-white hover:bg-purple-400"
        >
          Upgrade
        </button>
      )}
    </div>
  );
}

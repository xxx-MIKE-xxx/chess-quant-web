type FeatureCardProps = {
    title: string;
    description: string;
    cta: string;
    onClick: () => void;
    disabled?: boolean;
    pro?: boolean;
  };
  
  export function FeatureCard({
    title,
    description,
    cta,
    onClick,
    disabled,
    pro,
  }: FeatureCardProps) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{title}</h3>
          {pro && (
            <span className="rounded-full bg-yellow-400/90 px-2 py-0.5 text-[10px] font-semibold text-black">
              PRO
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-400">{description}</p>
        <button
          onClick={onClick}
          disabled={disabled}
          className="self-start rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {cta}
        </button>
      </div>
    );
  }
  
type ProgressBarProps = {
  value: number;
  max?: number;
  label?: string;
  className?: string;
};

export function ProgressBar({
  value,
  max = 100,
  label,
  className,
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className={className}>
      {label ? (
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-ink-muted">
          <span>{label}</span>
          <span className="tabular">{Math.round(percentage)}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={label ?? "Progress — प्रगति"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentage)}
        className="h-2.5 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="grad-spring h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

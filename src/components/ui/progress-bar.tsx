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
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={className}>
      {label ? (
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-ink-muted">
          <span>{label}</span>
          <span className="tabular">{Math.round(percentage)}%</span>
        </div>
      ) : null}
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className="grad-spring h-full rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

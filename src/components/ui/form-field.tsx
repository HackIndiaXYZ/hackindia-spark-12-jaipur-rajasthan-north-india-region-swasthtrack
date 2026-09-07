import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
};

/**
 * Every input in the product is wrapped in this: visible label, optional
 * helper, and an error slot that replaces the helper when validation fails
 * (§7).
 */
export function Field({
  label,
  children,
  hint,
  error,
  required,
  className,
}: FieldProps) {
  return (
    <label className={cn("block", className)}>
      <span className="flex items-baseline gap-1 text-sm font-medium text-ink">
        {label}
        {required ? (
          <span aria-hidden className="text-critical">
            *
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {error ? (
        <span role="alert" className="mt-1 block text-xs font-medium text-critical">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-subtle">{hint}</span>
      ) : null}
    </label>
  );
}

const controlBase =
  "min-h-control w-full rounded-field border border-line bg-surface px-3 text-base text-ink " +
  "shadow-inset-field outline-none transition-colors placeholder:text-ink-subtle " +
  "focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-surface-sunken disabled:text-ink-subtle " +
  "aria-[invalid=true]:border-critical aria-[invalid=true]:ring-critical/20";

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlBase, className)} {...props} />;
}

/**
 * Numeric health input. Uses `inputMode="decimal"` so phones open the number
 * pad, and `type="text"` so iOS Safari does not silently reject partial
 * entries or show spinners (§7). Only digits and one separator are accepted.
 */
export function NumberInput({
  className,
  allowDecimal = false,
  onChange,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { allowDecimal?: boolean }) {
  const pattern = allowDecimal ? /[^0-9.]/g : /[^0-9]/g;

  return (
    <input
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      autoComplete="off"
      className={cn(controlBase, "tabular", className)}
      onChange={(event) => {
        const cleaned = event.target.value.replace(pattern, "");
        // Keep at most one decimal separator.
        event.target.value = allowDecimal
          ? cleaned.replace(/(\..*)\./g, "$1")
          : cleaned;
        onChange?.(event);
      }}
      {...props}
    />
  );
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(controlBase, "min-h-24 resize-y py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(controlBase, "cursor-pointer appearance-none bg-none pr-9", className)}
      {...props}
    />
  );
}

/**
 * Segmented radio group for short, mutually exclusive choices such as
 * Morning / Evening. Larger tap targets than a `<select>` and no picker sheet.
 */
export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
  className,
}: {
  label: string;
  options: { value: T; label: string; hindiLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
  className?: string;
}) {
  const groupId = useId();

  return (
    <fieldset className={cn("block", className)}>
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <div
        role="radiogroup"
        aria-labelledby={groupId}
        className="mt-1.5 grid auto-cols-fr grid-flow-col gap-2"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "pressable flex min-h-control cursor-pointer flex-col items-center justify-center",
                "rounded-field border px-2 text-sm font-semibold whitespace-nowrap",
                active
                  ? "border-brand bg-brand-soft text-brand-ink"
                  : "border-line bg-surface text-ink-muted hover:border-brand-line",
              )}
            >
              <span>{option.label}</span>
              {option.hindiLabel ? (
                <span lang="hi" className="text-2xs font-normal text-ink-subtle">
                  {option.hindiLabel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
    </fieldset>
  );
}

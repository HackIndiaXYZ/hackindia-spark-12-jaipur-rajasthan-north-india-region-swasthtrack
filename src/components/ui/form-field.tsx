"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ComponentProps,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Hide the label visually but keep it for screen readers (search boxes). */
  labelHidden?: boolean;
  /**
   * For a Field that holds a composite control (radio buttons, a Segmented)
   * instead of one input: the label then names the group via aria-labelledby.
   */
  group?: boolean;
};

const CONTROL_SELECTOR =
  'input:not([type="hidden"]), select, textarea';

function joinIds(...ids: Array<string | undefined | null | false>) {
  const joined = ids.filter(Boolean).join(" ");
  return joined || undefined;
}

/**
 * Every input in the product is wrapped in this: visible label, optional
 * helper, and an error slot that replaces the helper when validation fails
 * (§7).
 *
 * The label is a real `<label for>` tied to the control by id, and the hint /
 * error are exposed through `aria-describedby`, with `aria-invalid` set when
 * there is an error — all wired automatically, so a screen reader announces
 * "Systolic, required, edit text, invalid, Enter a value from 70 to 260".
 *
 * Wiring: a single direct `<TextInput>`/`<NumberInput>`/`<Select>`/`<TextArea>`
 * (or raw `<input>`) child gets the props injected. If the control is nested in
 * your own wrapper (an icon box, a flex row), the first control found inside
 * is wired after mount instead. A control that already has its own `id` keeps
 * it. Several controls in one Field: only the first is labelled, give the
 * others their own `aria-label`.
 */
export function Field({
  label,
  children,
  hint,
  error,
  required,
  className,
  labelHidden = false,
  group = false,
}: FieldProps) {
  const reactId = useId();
  const labelId = `${reactId}-label`;
  const hintId = `${reactId}-hint`;
  const errorId = `${reactId}-error`;
  const fallbackControlId = `${reactId}-control`;

  const wrapRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLLabelElement>(null);

  const describedBy = error ? errorId : hint ? hintId : undefined;

  const directControl =
    isValidElement(children) &&
    (typeof children.type !== "string" ||
      /^(input|select|textarea)$/.test(children.type))
      ? (children as ReactElement<Record<string, unknown>>)
      : null;

  const directId =
    directControl && typeof directControl.props.id === "string"
      ? directControl.props.id
      : fallbackControlId;

  // Nested control: wire the first one after mount. DOM attributes written
  // here are not managed by React, so re-renders do not undo them.
  useEffect(() => {
    if (directControl || group) return;
    const control = wrapRef.current?.querySelector<HTMLElement>(CONTROL_SELECTOR);
    if (!control) return;

    if (!control.id) control.id = fallbackControlId;
    if (labelRef.current) labelRef.current.htmlFor = control.id;

    // Only touch attributes the caller has not set themselves.
    const mine = control.dataset.fieldDescribed;
    const current = control.getAttribute("aria-describedby");
    if (!current || current === mine) {
      if (describedBy) {
        control.setAttribute("aria-describedby", describedBy);
        control.dataset.fieldDescribed = describedBy;
      } else {
        control.removeAttribute("aria-describedby");
        delete control.dataset.fieldDescribed;
      }
    }

    if (error) {
      control.setAttribute("aria-invalid", "true");
      control.dataset.fieldInvalid = "1";
    } else if (control.dataset.fieldInvalid) {
      control.removeAttribute("aria-invalid");
      delete control.dataset.fieldInvalid;
    }

    if (required) control.setAttribute("aria-required", "true");
  });

  const content = directControl
    ? cloneElement(directControl, {
        id: directId,
        "aria-describedby": joinIds(
          directControl.props["aria-describedby"] as string | undefined,
          describedBy,
        ),
        "aria-invalid": error ? true : directControl.props["aria-invalid"],
        "aria-required": required ? true : directControl.props["aria-required"],
      })
    : children;

  return (
    <div
      ref={wrapRef}
      className={cn("block", className)}
      {...(group ? { role: "group", "aria-labelledby": labelId } : {})}
    >
      <label
        ref={labelRef}
        id={labelId}
        htmlFor={group ? undefined : directId}
        className={cn(
          "flex items-baseline gap-1 text-sm font-medium text-ink",
          labelHidden && "sr-only",
        )}
      >
        {label}
        {required ? (
          <span aria-hidden className="text-critical">
            *
          </span>
        ) : null}
      </label>
      <div className={cn(!labelHidden && "mt-1.5")}>{content}</div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1 text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// 16px text (`text-field`) so iOS Safari does not zoom on focus. The focus
// ring is the global 2px outline pulled flush to the border, so it follows the
// field radius and reads the same as every other focused control.
const controlBase =
  "min-h-control w-full rounded-field border border-line bg-surface px-3 text-field text-ink " +
  "shadow-inset-field transition-colors placeholder:text-ink-subtle " +
  "hover:border-line-strong " +
  "focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand " +
  "read-only:bg-surface-sunken " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle " +
  "aria-[invalid=true]:border-critical aria-[invalid=true]:focus-visible:outline-critical";

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

/**
 * Native select (best picker UX on phones) with a visible chevron — the
 * browser arrow is removed for a consistent look, so the affordance is drawn
 * here. `className` still lands on the `<select>` itself.
 */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select
        className={cn(controlBase, "cursor-pointer appearance-none bg-none pr-10", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
      />
    </span>
  );
}

/**
 * Segmented radio group for short, mutually exclusive choices such as
 * Morning / Evening or Viewer / Editor. Bigger tap targets than a `<select>`
 * and no picker sheet. One tab stop (roving tabindex); arrow keys move and
 * select, like native radio buttons.
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
  const hintId = `${groupId}-hint`;
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const last = options.length - 1;
    let next = from;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = from === last ? 0 : from + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = from === 0 ? last : from - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = last;
    } else {
      return;
    }
    event.preventDefault();
    buttons.current[next]?.focus();
    onChange(options[next].value);
  };

  return (
    <div className={cn("block", className)}>
      <p id={`${groupId}-label`} className="text-sm font-medium text-ink">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        aria-describedby={hint ? hintId : undefined}
        className="mt-1.5 grid auto-cols-fr grid-flow-col gap-2"
      >
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={index === selectedIndex ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => move(event, index)}
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
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

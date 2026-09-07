import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Vertical rhythm shared by every screen (§14). Pages compose
 * `PageHeader` + `Section`s inside this and never invent their own spacing.
 */
export function PageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("page-body space-y-5 sm:space-y-6", className)}>
      {children}
    </div>
  );
}

/**
 * Compact page header. The previous version spent ~180px of a 812px phone
 * screen on an eyebrow, a two-line title and a paragraph before any health
 * data appeared; the description is now desktop-only.
 */
export function PageHeader({
  eyebrow,
  title,
  hindiTitle,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  hindiTitle?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-brand">
            <span aria-hidden className="h-px w-6 rounded-full grad-spring" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {title}
        </h1>
        {hindiTitle ? (
          <p lang="hi" className="mt-0.5 text-sm text-ink-muted">
            {hindiTitle}
          </p>
        ) : null}
        {description ? (
          <p className="mt-2 hidden max-w-2xl text-sm text-ink-muted sm:block">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A titled block within a page. Keeps section headings aligned with card
 * content on every screen.
 */
export function Section({
  title,
  hindiTitle,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  hindiTitle?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {title || action ? (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
                <span aria-hidden className="h-4 w-0.5 rounded-full grad-spring" />
                {title}
              </h2>
            ) : null}
            {hindiTitle ? (
              <p lang="hi" className="text-xs text-ink-subtle">
                {hindiTitle}
              </p>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Empty state. Always answers: what is missing, why, and what to do (§41).
 */
export function EmptyState({
  icon: Icon,
  title,
  hindiTitle,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  hindiTitle?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-card border border-dashed border-line-strong",
        "bg-surface-sunken px-5 py-8 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-control bg-surface text-ink-subtle shadow-e1">
          <Icon aria-hidden className="h-5 w-5" />
        </span>
      ) : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hindiTitle ? (
        <p lang="hi" className="mt-0.5 text-sm text-ink-muted">
          {hindiTitle}
        </p>
      ) : null}
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Error state. Human-readable message plus a retry — raw Supabase/API errors
 * are never shown to the reader (§42).
 */
export function ErrorState({
  title = "कुछ गड़बड़ हो गई",
  englishTitle = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  englishTitle?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-card border border-critical-line bg-critical-soft px-4 py-4",
        className,
      )}
    >
      <p lang="hi" className="text-sm font-semibold text-critical">
        {title}
      </p>
      <p className="text-xs text-ink-muted">{englishTitle}</p>
      {description ? (
        <p className="mt-1.5 text-sm text-ink-muted">{description}</p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="pressable mt-3 inline-flex min-h-control cursor-pointer items-center rounded-control border border-critical-line bg-surface px-4 text-sm font-semibold text-critical"
        >
          फिर कोशिश करें (Try Again)
        </button>
      ) : null}
    </div>
  );
}

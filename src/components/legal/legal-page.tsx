import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageBody, PageHeader } from "@/components/ui/page";
import { cn } from "@/lib/utils";

/**
 * Frame for the public information pages (about, privacy, terms, disclaimer,
 * contact). They are readable signed out, so nothing here touches the session,
 * a patient, or any data service: it is static content only.
 */
export function LegalPage({
  eyebrow,
  title,
  hindiTitle,
  description,
  children,
  width = "max-w-4xl",
}: {
  eyebrow: string;
  title: string;
  hindiTitle?: string;
  description?: string;
  children: ReactNode;
  width?: "max-w-3xl" | "max-w-4xl";
}) {
  return (
    <div className={cn("mx-auto", width)}>
      <PageBody>
        <Link
          href="/"
          className="inline-flex min-h-control items-center gap-1.5 rounded-control text-sm font-semibold text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          वापस जाएँ (Back)
        </Link>
        <PageHeader eyebrow={eyebrow} title={title} hindiTitle={hindiTitle} description={description} />
        {children}
      </PageBody>
    </div>
  );
}

/** A frosted-white reading surface for long text: gold rim, no tint behind the words. */
export function LegalBody({ children }: { children: ReactNode }) {
  return (
    <Card tone="raised" flush className="space-y-6 p-5 text-sm leading-relaxed text-ink-muted sm:p-8">
      {children}
    </Card>
  );
}

export function LegalSection({
  title,
  icon,
  children,
  divider = false,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <section className={cn("space-y-2", divider && "border-t border-line-strong/50 pt-4")}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-gold-ink">{children}</ul>;
}

export function ContactCard({ children }: { children: ReactNode }) {
  return <div className="space-y-0.5 rounded-card border border-line bg-surface-sunken p-3.5 text-sm text-ink">{children}</div>;
}

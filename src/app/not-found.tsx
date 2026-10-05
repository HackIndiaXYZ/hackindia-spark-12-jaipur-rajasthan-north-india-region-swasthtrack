import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-8 sm:py-12">
      <Card tone="premium" className="rounded-panel p-6 text-center sm:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-card bg-surface text-gold-ink shadow-e2 ring-1 ring-gold-line">
          <Compass aria-hidden className="h-7 w-7" />
        </span>
        <p className="tabular mt-4 text-4xl font-bold tracking-wide text-gold-ink" aria-hidden>
          404
        </p>
        <h1 lang="hi" className="mt-1 text-xl font-semibold text-ink">
          यह पेज नहीं मिला
        </h1>
        <p className="mt-0.5 text-sm font-medium text-ink-muted">We could not find that page.</p>
        <p lang="hi" className="mt-3 text-sm text-ink-muted">
          लिंक पुराना हो सकता है या पता गलत टाइप हुआ है। नीचे से आगे बढ़ें।
        </p>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link href="/" className={buttonClasses({ variant: "primary" })}>
            होम पर जाएँ (Home)
          </Link>
          <Link href="/health" className={buttonClasses({ variant: "secondary" })}>
            स्वास्थ्य (Health)
          </Link>
        </div>
      </Card>
    </div>
  );
}

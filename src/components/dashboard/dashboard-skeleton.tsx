import { Card } from "@/components/ui/card";
import { PageBody } from "@/components/ui/page";

const RING = 188;

/** A card-shaped placeholder: a title line, then `rows` content blocks. */
function CardSkeleton({ rows = 2, rowHeight = "h-16" }: { rows?: number; rowHeight?: string }) {
  return (
    <Card aria-hidden>
      <div className="flex items-center gap-2.5">
        <div className="skeleton h-9 w-9 shrink-0 rounded-control" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="skeleton h-4 w-40 max-w-full" />
          <div className="skeleton h-3 w-56 max-w-full" />
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={`skeleton w-full ${rowHeight}`} />
        ))}
      </div>
    </Card>
  );
}

/**
 * The dashboard's loading state: the same shape as the loaded page (the one
 * gilt-rich hero with its dial and six tiles, then the two columns of cards), so
 * nothing jumps when the data arrives.
 */
export function DashboardSkeleton() {
  return (
    <PageBody>
      <p role="status" aria-live="polite" className="sr-only">
        डैशबोर्ड लोड हो रहा है…
      </p>

      <Card tone="premium" flush aria-hidden className="relative overflow-hidden rounded-panel">
        <div className="grid gap-x-8 gap-y-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
          <div className="space-y-3 sm:col-start-1 sm:row-start-1 sm:self-end">
            <div className="skeleton h-7 w-44 rounded-full" />
            <div className="skeleton h-8 w-64 max-w-full" />
          </div>
          <div className="grid place-items-center sm:col-start-2 sm:row-span-2 sm:row-start-1">
            <div
              className="skeleton max-w-full rounded-full"
              style={{ width: RING, height: RING }}
            />
          </div>
          <div className="skeleton h-16 w-full sm:col-start-1 sm:row-start-2" />
        </div>

        <div className="border-t border-gold-line px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
          <div className="skeleton mb-3 h-4 w-52 max-w-full" />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="tile h-[7.25rem] rounded-card p-3">
                <div className="flex items-center gap-2">
                  <div className="skeleton h-8 w-8 rounded-field" />
                  <div className="skeleton h-3.5 w-14" />
                </div>
                <div className="skeleton mt-3 h-6 w-20" />
                <div className="skeleton mt-2.5 h-3 w-24 max-w-full" />
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-5 sm:gap-6 lg:grid lg:grid-cols-2 lg:items-start xl:grid-cols-12">
        <div className="space-y-5 sm:space-y-6 xl:col-span-7">
          <CardSkeleton rows={2} rowHeight="h-20" />
          <CardSkeleton rows={4} rowHeight="h-14" />
        </div>
        <div className="space-y-5 sm:space-y-6 xl:col-span-5">
          <CardSkeleton rows={3} rowHeight="h-24" />
          <CardSkeleton rows={2} rowHeight="h-16" />
        </div>
      </div>
    </PageBody>
  );
}

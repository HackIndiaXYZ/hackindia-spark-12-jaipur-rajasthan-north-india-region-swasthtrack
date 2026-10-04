import { SkeletonCard } from "@/components/ui/skeleton-loaders";

/**
 * Shown while a route segment streams in. Matches the page rhythm (header
 * block, then cards) so the layout does not jump when real content lands.
 */
export default function Loading() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div aria-hidden="true" className="space-y-2">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-4 w-32" />
      </div>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

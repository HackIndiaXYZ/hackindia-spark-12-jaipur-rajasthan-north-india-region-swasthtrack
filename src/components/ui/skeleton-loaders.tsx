"use client";

import React from "react";

/* ------------------------------------------------------------------ */
/*  Skeleton primitives                                                */
/* ------------------------------------------------------------------ */
/*  All shimmer bars share the `.skeleton` keyframe (globals.css) — the
    same loading treatment the wellness ring uses — instead of a plain
    `animate-pulse` grey block, so every loading state in the product
    reads as one system. */

/** Shimmer bar for normal text (e.g. labels, descriptions) */
const TextBar: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`skeleton h-4 w-24 ${className}`} />
);

/** Shimmer bar for large values (e.g. metric numbers) */
const ValueBar: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`skeleton h-8 w-32 ${className}`} />
);

/** Shimmer bar for input fields */
const InputBar: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`skeleton h-10 w-full rounded-field ${className}`} />
);

/** Shimmer bar for small / helper text */
const SmallTextBar: React.FC<{ className?: string }> = ({
  className = "",
}) => <div className={`skeleton h-3 w-16 ${className}`} />;

/* ------------------------------------------------------------------ */
/*  1. SkeletonCard                                                    */
/* ------------------------------------------------------------------ */

/**
 * A card-shaped skeleton matching the Card component pattern.
 * Renders a header area and a content area with shimmer bars.
 */
export const SkeletonCard: React.FC<{ className?: string }> = ({
  className = "",
}) => (
  <div
    className={`rounded-card border border-line bg-surface p-5 space-y-4 ${className}`}
    aria-hidden="true"
  >
    {/* Header area */}
    <div className="flex items-center gap-3">
      <div className="skeleton h-8 w-8 rounded-full" />
      <TextBar className="w-36" />
    </div>

    {/* Content area */}
    <div className="space-y-3">
      <TextBar className="w-full" />
      <TextBar className="w-3/4" />
      <TextBar className="w-1/2" />
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  2. SkeletonMetricGrid                                              */
/* ------------------------------------------------------------------ */

/** Single metric card skeleton (icon circle + title + value + helper) */
const SkeletonMetricCard: React.FC = () => (
  <div
    className="rounded-card border border-line bg-surface p-5 space-y-3"
    aria-hidden="true"
  >
    <div className="flex items-center gap-3">
      {/* Icon circle */}
      <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
      {/* Title bar */}
      <TextBar className="w-28" />
    </div>
    {/* Value bar */}
    <ValueBar className="w-24" />
    {/* Helper text bar */}
    <SmallTextBar className="w-20" />
  </div>
);

/**
 * A grid of 6 metric card skeletons matching the TodaySummaryGrid layout.
 */
export const SkeletonMetricGrid: React.FC<{ className?: string }> = ({
  className = "",
}) => (
  <div
    className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className}`}
    aria-hidden="true"
  >
    {Array.from({ length: 6 }).map((_, i) => (
      <SkeletonMetricCard key={i} />
    ))}
  </div>
);

/* ------------------------------------------------------------------ */
/*  3. SkeletonHealthPanel                                             */
/* ------------------------------------------------------------------ */

/**
 * A larger skeleton for health panels (BP / Weight).
 * Includes a header row, large number display, form inputs, and a
 * history list area.
 */
export const SkeletonHealthPanel: React.FC<{ className?: string }> = ({
  className = "",
}) => (
  <div
    className={`rounded-card border border-line bg-surface p-5 space-y-6 ${className}`}
    aria-hidden="true"
  >
    {/* Header row */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="skeleton h-9 w-9 rounded-full" />
        <TextBar className="w-40" />
      </div>
      <SmallTextBar className="w-20" />
    </div>

    {/* Large number display area */}
    <div className="flex items-baseline gap-2">
      <ValueBar className="w-28 h-10" />
      <SmallTextBar className="w-14" />
    </div>

    {/* Form area with input fields */}
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <InputBar />
        <InputBar />
      </div>
      <InputBar />
      {/* Submit button placeholder */}
      <div className="skeleton h-10 w-28 rounded-control" />
    </div>

    {/* History list area */}
    <div className="space-y-3 pt-2 border-t border-line">
      <TextBar className="w-32" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SmallTextBar className="w-20" />
            <TextBar className="w-16" />
          </div>
          <SmallTextBar className="w-12" />
        </div>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  4. SkeletonDashboard                                               */
/* ------------------------------------------------------------------ */

/**
 * Full dashboard skeleton combining:
 *  - Patient overview banner
 *  - Quick actions bar
 *  - SkeletonMetricGrid
 *  - 4 × SkeletonCard in a 2-col grid
 */
export const SkeletonDashboard: React.FC<{ className?: string }> = ({
  className = "",
}) => (
  <div className={`space-y-6 ${className}`} aria-hidden="true">
    {/* Patient overview banner skeleton */}
    <div className="rounded-card border border-line bg-surface p-5 flex items-center gap-4">
      {/* Avatar */}
      <div className="skeleton h-14 w-14 shrink-0 rounded-full" />
      <div className="space-y-2 flex-1">
        <TextBar className="w-44" />
        <SmallTextBar className="w-32" />
        <SmallTextBar className="w-24" />
      </div>
      {/* Status badge placeholder */}
      <div className="skeleton h-6 w-20 shrink-0 rounded-full" />
    </div>

    {/* Quick actions bar skeleton */}
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-10 w-32 shrink-0 rounded-control" />
      ))}
    </div>

    {/* Metric grid */}
    <SkeletonMetricGrid />

    {/* 4 cards in 2-col grid */}
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  </div>
);

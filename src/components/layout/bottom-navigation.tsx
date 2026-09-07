"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNavigation } from "@/components/layout/navigation-items";
import { cn } from "@/lib/utils";

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      className="frost fixed inset-x-0 bottom-0 z-40 border-t border-line lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {primaryNavigation.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                // 56px tall including the label — comfortably over the 44px
                // minimum tap target (§44).
                "pressable flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-control px-1",
                active
                  ? "bg-brand-soft text-brand-ink shadow-e1"
                  : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
              )}
              href={item.href}
              key={item.href}
            >
              <Icon
                aria-hidden
                className={cn("h-5 w-5 shrink-0", active && "stroke-[2.4]")}
              />
              <span
                lang="hi"
                className="w-full truncate text-center text-2xs font-medium leading-tight"
              >
                {item.hindiLabel}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

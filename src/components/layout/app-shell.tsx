"use client";

import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { BottomNavigation } from "@/components/layout/bottom-navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";
import { AuthProvider } from "@/context/auth-context";
import { AuthGuard } from "@/components/layout/auth-guard";

function AppShellContent({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const isStandalonePage = pathname === "/login" || pathname === "/onboarding";

  if (isStandalonePage) {
    return <main>{children}</main>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <Sidebar />

      {/* The sidebar is fixed at 17rem on lg+, so the content column is inset
          rather than overlapped. */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-68">
        <Header />

        {/*
          One container, one set of gutters, one max width for every screen
          (§14). There is deliberately no `overflow-x-hidden` here: any
          sideways scroll is a real layout bug and must be visible so it gets
          fixed at the source (§8).
        */}
        <main
          id="main-content"
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-28 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10"
        >
          {children}
        </main>

        <Footer />
      </div>

      <BottomNavigation />
    </div>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  // Registers the offline app-shell caching worker (public/sw.js). This
  // effect only runs client-side, so the 'serviceWorker' in navigator check
  // is enough - no extra SSR guard needed.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <AuthProvider>
      <AuthGuard>
        <AppShellContent>{children}</AppShellContent>
      </AuthGuard>
    </AuthProvider>
  );
}

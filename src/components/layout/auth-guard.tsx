"use client";

import { Fragment, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HeartPulse, RefreshCw, ServerCrash, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";

/**
 * Pages anyone may open without an account. The legal pages must stay reachable
 * from the login screen and while logged out.
 */
export const PUBLIC_ROUTES = ["/login", "/about", "/privacy", "/terms", "/medical-disclaimer", "/contact"];
// Public pages that need no account AND no backend at all.
const STATIC_PUBLIC_ROUTES = PUBLIC_ROUTES.filter((r) => r !== "/login");

function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/** For the app shell: public pages are rendered for signed-out visitors too. */
export function isPublicRoute(pathname: string): boolean {
  return matchesRoute(pathname, PUBLIC_ROUTES);
}

/** Only ever send people to a path inside this app. */
function safeNextPath(raw: string | null): string {
  // Must be a single-slash path: "//host", "/\\host" and "javascript:" style values are refused.
  if (!raw || !/^\/(?![/\\])/.test(raw) || raw.startsWith("/login")) return "/";
  return raw;
}

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-10">
      {children}
    </div>
  );
}

function Splash({ label = "SwasthTrack सुरक्षित लोड हो रहा है..." }: { label?: string }) {
  return (
    <FullScreen>
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-card bg-brand text-ink-inverse shadow-e2 animate-pulse">
          <HeartPulse className="h-6 w-6" aria-hidden />
        </div>
        <p className="text-sm font-semibold text-ink-muted">{label}</p>
      </div>
    </FullScreen>
  );
}

function SetupRequired() {
  return (
    <FullScreen>
      <div role="alert" className="gold-edge w-full max-w-md rounded-panel bg-surface p-6 text-center sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-attention-soft text-attention">
          <Settings2 className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-ink">Setup required</h1>
        <p lang="hi" className="mt-1 text-sm font-semibold text-ink-muted">
          सेटअप ज़रूरी है
        </p>
        <p className="mt-4 text-sm text-ink-muted">
          SwasthTrack cannot reach its database because these environment variables are missing in{" "}
          <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-ink">.env.local</code>:
        </p>
        <ul className="mt-3 space-y-1.5 text-left">
          <li className="rounded-field border border-line bg-surface-sunken px-3 py-2 font-mono text-xs text-ink">
            NEXT_PUBLIC_SUPABASE_URL
          </li>
          <li className="rounded-field border border-line bg-surface-sunken px-3 py-2 font-mono text-xs text-ink">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </li>
        </ul>
        <p lang="hi" className="mt-4 text-xs text-ink-subtle">
          ऊपर के दोनों मान .env.local में भरें, फिर ऐप दोबारा शुरू करें। विवरण: docs/auth-setup.md
        </p>
      </div>
    </FullScreen>
  );
}

function LoadFailed({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <FullScreen>
      <div role="alert" className="gold-edge w-full max-w-md rounded-panel bg-surface p-6 text-center sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-critical-soft text-critical">
          <ServerCrash className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-ink">Could not load your account</h1>
        <p lang="hi" className="mt-1 text-sm font-semibold text-ink-muted">
          आपका खाता लोड नहीं हो सका
        </p>
        <p className="mt-3 text-sm text-ink-muted">{message}</p>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Button variant="primary" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            दोबारा कोशिश करें (Retry)
          </Button>
          <Button variant="secondary" onClick={onSignOut}>
            लॉग आउट (Sign out)
          </Button>
        </div>
      </div>
    </FullScreen>
  );
}

type Decision =
  | { kind: "render" }
  | { kind: "splash" }
  | { kind: "setup" }
  | { kind: "failed"; message: string }
  | { kind: "redirect"; to: "login" | "onboarding" | "home" };

export function AuthGuard({ children }: { children: ReactNode }) {
  const {
    user,
    loading,
    loadError,
    supabaseConfigured,
    authorizedPatients,
    activePatientId,
    refreshSession,
    signOut,
  } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = matchesRoute(pathname, PUBLIC_ROUTES);
  const isStaticPublic = matchesRoute(pathname, STATIC_PUBLIC_ROUTES);
  const isLogin = pathname === "/login";
  const isOnboarding = pathname === "/onboarding";

  let decision: Decision;
  if (!supabaseConfigured) {
    // No backend means no accounts: never pretend otherwise. Static legal pages still read fine.
    decision = isStaticPublic ? { kind: "render" } : { kind: "setup" };
  } else if (loading) {
    decision = { kind: "splash" };
  } else if (!user) {
    decision = isPublic ? { kind: "render" } : { kind: "redirect", to: "login" };
  } else if (loadError && authorizedPatients.length === 0) {
    decision = { kind: "failed", message: loadError };
  } else if (isLogin) {
    decision = { kind: "redirect", to: authorizedPatients.length === 0 ? "onboarding" : "home" };
  } else if (authorizedPatients.length === 0 && !isOnboarding && !isPublic) {
    decision = { kind: "redirect", to: "onboarding" };
  } else {
    decision = { kind: "render" };
  }

  const redirectTo = decision.kind === "redirect" ? decision.to : null;

  useEffect(() => {
    if (!redirectTo) return;
    if (redirectTo === "login") {
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
    } else if (redirectTo === "onboarding") {
      router.replace("/onboarding");
    } else {
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    }
  }, [redirectTo, router]);

  switch (decision.kind) {
    case "setup":
      return <SetupRequired />;
    case "failed":
      return (
        <LoadFailed
          message={decision.message}
          onRetry={() => void refreshSession()}
          onSignOut={() => void signOut()}
        />
      );
    case "splash":
    case "redirect":
      return <Splash />;
    default:
      // Re-mounting on a patient switch makes every page refetch for the new patient.
      return <Fragment key={activePatientId ?? "no-patient"}>{children}</Fragment>;
  }
}

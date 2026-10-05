"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getActivePatientId, setActivePatientId as setStoreActivePatientId } from "@/lib/active-patient";
import type { AuthUser } from "@/lib/auth/constants";
import { fetchSessionPayload, primeSession, refreshSession as refreshSessionCache, sessionEnded, subscribeSession } from "@/lib/auth/client-session";
import { onSessionRejected } from "@/lib/db/client";
import type { MemberRole } from "@/lib/db/database.types";
import {
  clearLocalUserData,
  getAuthorizedPatients,
  getProfile,
  signOut as signOutService,
  type AuthorizedPatient,
  type UserProfile,
} from "@/services/auth-service";
import { clearAllPatientCaches } from "@/services/patient-service";

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  /** True until the session AND the user's memberships are known. */
  loading: boolean;
  /** Set when the session exists but profile/memberships could not be loaded. */
  loadError: string | null;
  /** Set when the server could not be reached to learn whether anyone is signed in. */
  sessionError: string | null;
  /** False when the server has no DATABASE_URL (the app shows its setup screen). */
  databaseConfigured: boolean;
  /** Null (never a placeholder id) when the user has no patient yet. */
  activePatientId: string | null;
  /** Every patient the user is an active member of. */
  authorizedPatients: AuthorizedPatient[];
  /** The user's role on the active patient. */
  memberRole: MemberRole | null;
  /** Owner or editor on the active patient (viewers are read-only). */
  canWrite: boolean;
  setActivePatientId: (patientId: string) => void;
  /** Reload profile + memberships (after creating or joining a patient). */
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// A UI preference only: which patient to open first. It is validated against the
// real memberships every time, so editing it by hand grants nothing.
const ACTIVE_PATIENT_PREF_KEY = "swasthtrack_active_patient";

function readPreferredPatient(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PATIENT_PREF_KEY);
  } catch {
    return null;
  }
}

function writePreferredPatient(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_PATIENT_PREF_KEY, id);
    else localStorage.removeItem(ACTIVE_PATIENT_PREF_KEY);
  } catch {
    // storage blocked
  }
}

function pickActivePatient(patients: AuthorizedPatient[], preferred: string | null): string | null {
  if (preferred && patients.some((p) => p.id === preferred)) return preferred;
  return patients[0]?.id ?? null;
}

interface LoadedData {
  userId: string;
  profile: UserProfile | null;
  patients: AuthorizedPatient[];
  activePatientId: string | null;
  error: string | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [data, setData] = useState<LoadedData | null>(null);

  const lastUserIdRef = useRef<string | null>(null);
  const patientsRef = useRef<AuthorizedPatient[]>([]);

  // Profile + memberships for one user. Writes the module-level active patient
  // BEFORE the state update, so pages mounting in the same commit already see it
  // (child effects run before this provider's effects).
  const loadData = useCallback(async (user: AuthUser): Promise<void> => {
    try {
      const [profile, patients] = await Promise.all([getProfile(), getAuthorizedPatients()]);
      patientsRef.current = patients;
      const activePatientId = pickActivePatient(patients, getActivePatientId() ?? readPreferredPatient());
      setStoreActivePatientId(activePatientId);
      writePreferredPatient(activePatientId);
      setData({ userId: user.id, profile, patients, activePatientId, error: null });
    } catch (err) {
      console.error("Auth data load error:", err);
      setData({
        userId: user.id,
        profile: null,
        patients: [],
        activePatientId: null,
        error: err instanceof Error ? err.message : "Could not load your account.",
      });
    }
  }, []);

  // Session lifecycle. The server owns the session (HttpOnly cookie); this keeps the UI in step:
  // the first read, sign-in/sign-out from this tab or another one, and a 401 from the data gateway.
  useEffect(() => {
    let alive = true;

    const apply = (nextUser: AuthUser | null, event: "SIGNED_IN" | "SIGNED_OUT" | "SESSION_REFRESHED" | "INITIAL") => {
      const previousId = lastUserIdRef.current;
      if (event === "SIGNED_OUT") {
        // Includes a sign-out performed in another tab.
        clearAllPatientCaches();
        setStoreActivePatientId(null);
        setTimeout(() => void clearLocalUserData(), 0);
      } else if (previousId && nextUser && previousId !== nextUser.id) {
        // A different account took over this browser: nothing of the old one may linger.
        clearAllPatientCaches();
        setStoreActivePatientId(null);
      }
      lastUserIdRef.current = nextUser?.id ?? null;
      setSessionError(null);
      setAuthUser((prev) => (prev?.id === nextUser?.id ? prev : nextUser));
      setAuthResolved(true);
    };

    const unsubscribe = subscribeSession((event, user) => {
      if (alive) apply(user, event);
    });

    const readSession = async (initial: boolean) => {
      try {
        const payload = await fetchSessionPayload();
        if (!alive) return;
        setConfigured(payload.configured);
        if (initial) {
          primeSession(payload.user);
          apply(payload.user, "INITIAL");
        }
        else void refreshSessionCache();
      } catch (err) {
        if (!alive) return;
        console.error("Session check failed:", err);
        if (initial) {
          setSessionError("सर्वर से जवाब नहीं मिला। इंटरनेट जांचें और फिर कोशिश करें। (We could not reach the server.)");
          setAuthResolved(true);
        }
      }
    };
    void readSession(true);

    // The data gateway answered 401, or the tab came back after a while: re-check who is signed in.
    onSessionRejected(() => void refreshSessionCache());
    const onVisible = () => {
      if (document.visibilityState === "visible") void readSession(false);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      unsubscribe();
      onSessionRejected(null);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    // Deferred a tick so the fetch's state updates never happen synchronously in the effect body.
    void Promise.resolve().then(() => (cancelled ? undefined : loadData(authUser)));
    return () => {
      cancelled = true;
    };
  }, [authUser, loadData]);

  const setActivePatientId = useCallback((patientId: string) => {
    if (!patientsRef.current.some((p) => p.id === patientId)) return;
    setStoreActivePatientId(patientId);
    writePreferredPatient(patientId);
    setData((prev) => (prev ? { ...prev, activePatientId: patientId } : prev));
  }, []);

  const refreshSession = useCallback(async () => {
    setSessionError(null);
    const payload = await refreshSessionCache();
    if (payload === null) {
      if (!lastUserIdRef.current) {
        setSessionError("सर्वर से जवाब नहीं मिला। इंटरनेट जांचें और फिर कोशिश करें। (We could not reach the server.)");
      }
      return;
    }
    setConfigured(payload.configured);
    setAuthResolved(true);
    if (payload.user) {
      lastUserIdRef.current = payload.user.id;
      setAuthUser((prev) => (prev?.id === payload.user!.id ? prev : payload.user));
      await loadData(payload.user);
    }
  }, [loadData]);

  const signOut = useCallback(async () => {
    lastUserIdRef.current = null;
    await signOutService();
    sessionEnded(false);
    setAuthUser(null);
    setData(null);
  }, []);

  const value = useMemo<AuthContextType>(() => {
    const current = authUser && data?.userId === authUser.id ? data : null;
    const patients = current?.patients ?? [];
    const activePatientId = current?.activePatientId ?? null;
    const memberRole = patients.find((p) => p.id === activePatientId)?.member_role ?? null;
    return {
      user: authUser,
      profile: current?.profile ?? null,
      loading: configured && !sessionError && (!authResolved || (authUser !== null && current === null)),
      loadError: current?.error ?? null,
      sessionError,
      databaseConfigured: configured,
      activePatientId,
      authorizedPatients: patients,
      memberRole,
      canWrite: memberRole === "owner" || memberRole === "editor",
      setActivePatientId,
      refreshSession,
      signOut,
    };
  }, [authUser, authResolved, configured, sessionError, data, setActivePatientId, refreshSession, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

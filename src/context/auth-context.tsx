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
import type { User } from "@supabase/supabase-js";
import { getActivePatientId, setActivePatientId as setStoreActivePatientId } from "@/lib/active-patient";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { MemberRole } from "@/lib/supabase/database.types";
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
  user: User | null;
  profile: UserProfile | null;
  /** True until the session AND the user's memberships are known. */
  loading: boolean;
  /** Set when the session exists but profile/memberships could not be loaded. */
  loadError: string | null;
  supabaseConfigured: boolean;
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
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [data, setData] = useState<LoadedData | null>(null);

  const lastUserIdRef = useRef<string | null>(null);
  const resolvedRef = useRef(false);
  const patientsRef = useRef<AuthorizedPatient[]>([]);

  // Profile + memberships for one user. Writes the module-level active patient
  // BEFORE the state update, so pages mounting in the same commit already see it
  // (child effects run before this provider's effects).
  const loadData = useCallback(async (user: User): Promise<void> => {
    try {
      const [profile, patients] = await Promise.all([getProfile(user), getAuthorizedPatients()]);
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

  // Session lifecycle. The callback only records the session: calling other
  // Supabase methods (or awaiting) inside it can deadlock the auth client, so the
  // profile/membership fetch lives in the effect below.
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null;
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
      resolvedRef.current = true;
      // TOKEN_REFRESHED / repeated SIGNED_IN for the same user must not reload everything.
      setAuthUser((prev) => (prev?.id === nextUser?.id && event !== "USER_UPDATED" ? prev : nextUser));
      setAuthResolved(true);
    });

    // Safety net in case the INITIAL_SESSION event is not delivered.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      lastUserIdRef.current = session?.user?.id ?? null;
      setAuthUser(session?.user ?? null);
      setAuthResolved(true);
    });

    return () => subscription.unsubscribe();
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
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) await loadData(session.user);
  }, [loadData]);

  const signOut = useCallback(async () => {
    lastUserIdRef.current = null;
    await signOutService();
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
      loading: isSupabaseConfigured && (!authResolved || (authUser !== null && current === null)),
      loadError: current?.error ?? null,
      supabaseConfigured: isSupabaseConfigured,
      activePatientId,
      authorizedPatients: patients,
      memberRole,
      canWrite: memberRole === "owner" || memberRole === "editor",
      setActivePatientId,
      refreshSession,
      signOut,
    };
  }, [authUser, authResolved, data, setActivePatientId, refreshSession, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

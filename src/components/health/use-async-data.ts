"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NoActivePatientError,
  PatientNotFoundError,
  DatabaseNotConfiguredError,
} from "@/services/patient-service";

type Settled<T> = { key: string; nonce: number; data: T | null; error: unknown };

/**
 * One loader for one screen: no duplicated "mount" and "refresh" code paths,
 * and a stale response can never overwrite a newer one.
 *
 * The result is stored together with the key it was loaded for, so `loading` is
 * derived (no result for the current key yet) instead of being set from inside
 * an effect. Changing `deps` (a filter, the active patient) therefore shows the
 * skeleton for the new key and ignores whatever the previous request returns.
 *
 * `reload()` keeps the data on screen while it refetches (`refreshing` is true
 * meanwhile, for a spinner); after a failure it goes back to the skeleton so
 * "Try again" gives visible feedback.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  enabled = true,
) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<Settled<T> | null>(null);
  const [nonce, setNonce] = useState(0);

  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loaderRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ key, nonce, data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ key, nonce, data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [key, nonce, enabled]);

  const reload = useCallback(() => {
    setState((current) => (current && current.error ? null : current));
    setNonce((n) => n + 1);
  }, []);

  const current = state && state.key === key ? state : null;

  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: enabled && current === null,
    /** A reload is in flight and the previous data is still shown (for a spinner). */
    refreshing: enabled && current !== null && current.nonce !== nonce,
    reload,
  };
}

/** The user has no patient yet (or lost access): a calm empty state, not an error. */
export function isNoPatientError(error: unknown): boolean {
  return error instanceof NoActivePatientError || error instanceof PatientNotFoundError;
}

/** Plain-language cause for an ErrorState; raw service errors are never shown. */
export function loadErrorMessage(error: unknown): string | undefined {
  if (error instanceof DatabaseNotConfiguredError) {
    return "ऐप का डेटाबेस कनेक्शन तय नहीं है। (The app is not connected to its database.)";
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "इंटरनेट बंद लगता है। कनेक्शन जाँचकर फिर कोशिश करें। (You appear to be offline.)";
  }
  return undefined;
}

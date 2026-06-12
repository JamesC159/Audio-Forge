import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

export interface UseAsyncDataOptions {
  /** If true, fetch immediately on mount (default: true) */
  immediate?: boolean;
  /** Abort and re-fetch whenever any dep changes */
  deps?: unknown[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Generic data-fetching hook with:
 * - AbortController cancel-on-unmount (prevents setState on unmounted components)
 * - Manual refetch trigger
 * - Typed discriminated union state (idle | loading | success | error)
 *
 * @example
 * const { state, refetch } = useAsyncData(() => api.getJobs(), { deps: [userId] });
 * if (state.status === 'success') renderJobs(state.data);
 */
export function useAsyncData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  { immediate = true, deps = [] }: UseAsyncDataOptions = {}
) {
  const [state, setState] = useState<AsyncState<T>>({ status: "idle" });
  // Stable ref so the fetch closure doesn't capture stale state
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(() => {
    const controller = new AbortController();

    setState({ status: "loading" });

    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ status: "success", data });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return; // intentional cancel — ignore
        setState({
          status: "error",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });

    // Return the controller so callers can cancel early if needed
    return controller;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally stable

  useEffect(() => {
    if (!immediate) return;
    const controller = run();
    // Cleanup: cancel in-flight request when component unmounts or deps change
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate, ...deps]);

  return { state, refetch: run };
}

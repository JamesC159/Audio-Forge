/**
 * Context splitting pattern — separate frequently-changing state from stable
 * actions so consumers only re-render when their slice actually changes.
 *
 * Without splitting: every component that reads the context re-renders on
 * every queue update. With splitting: <JobList> re-renders on queue changes,
 * <GenerateButton> does NOT (it only reads dispatch).
 */
import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  type ReactNode,
} from "react";

// ── Domain types ──────────────────────────────────────────────────────────────

export interface AudioJob {
  id: string;
  prompt: string;
  status: "queued" | "processing" | "completed" | "failed";
  s3Key: string | null;
  durationMs: number | null;
  createdAt: string;
}

// ── State ─────────────────────────────────────────────────────────────────────

interface AudioState {
  jobs: AudioJob[];
  isGenerating: boolean;
}

type AudioAction =
  | { type: "SET_JOBS"; payload: AudioJob[] }
  | { type: "ADD_JOB"; payload: AudioJob }
  | { type: "UPDATE_JOB"; payload: Partial<AudioJob> & { id: string } }
  | { type: "SET_GENERATING"; payload: boolean };

function audioReducer(state: AudioState, action: AudioAction): AudioState {
  switch (action.type) {
    case "SET_JOBS":
      return { ...state, jobs: action.payload };
    case "ADD_JOB":
      return { ...state, jobs: [action.payload, ...state.jobs] };
    case "UPDATE_JOB":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.payload.id ? { ...j, ...action.payload } : j
        ),
      };
    case "SET_GENERATING":
      return { ...state, isGenerating: action.payload };
    default:
      return state;
  }
}

// ── Contexts (split!) ─────────────────────────────────────────────────────────

// 1. State context — consumers re-render when jobs/isGenerating change
const AudioStateContext = createContext<AudioState | null>(null);

// 2. Dispatch context — never changes reference, so consumers never re-render
const AudioDispatchContext = createContext<React.Dispatch<AudioAction> | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(audioReducer, {
    jobs: [],
    isGenerating: false,
  });

  return (
    <AudioStateContext.Provider value={state}>
      <AudioDispatchContext.Provider value={dispatch}>
        {children}
      </AudioDispatchContext.Provider>
    </AudioStateContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useAudioState() {
  const ctx = useContext(AudioStateContext);
  if (!ctx) throw new Error("useAudioState must be inside <AudioProvider>");
  return ctx;
}

export function useAudioDispatch() {
  const ctx = useContext(AudioDispatchContext);
  if (!ctx) throw new Error("useAudioDispatch must be inside <AudioProvider>");
  return ctx;
}

/** Stable action creators — use these instead of raw dispatch */
export function useAudioActions() {
  const dispatch = useAudioDispatch();

  return {
    setJobs: useCallback(
      (jobs: AudioJob[]) => dispatch({ type: "SET_JOBS", payload: jobs }),
      [dispatch]
    ),
    addJob: useCallback(
      (job: AudioJob) => dispatch({ type: "ADD_JOB", payload: job }),
      [dispatch]
    ),
    updateJob: useCallback(
      (patch: Partial<AudioJob> & { id: string }) =>
        dispatch({ type: "UPDATE_JOB", payload: patch }),
      [dispatch]
    ),
    setGenerating: useCallback(
      (v: boolean) => dispatch({ type: "SET_GENERATING", payload: v }),
      [dispatch]
    ),
  };
}
